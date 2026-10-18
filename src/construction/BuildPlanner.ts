/**
 * Build Planner — V9 Construction Module
 *
 * Given a Blueprint + anchor position, generates an ordered BuildPlan with:
 * - Dependency-ordered placement steps (foundation → walls → roof)
 * - Auto-generated scaffolding for unreachable positions
 * - Material requirements calculation
 */

import type { Bot } from "../core/Bot";
import type { Vec3 } from "../types";
import { BlockRegistry } from "../registry/blocks";
import {
  Blueprint,
  BlueprintBlock,
  BuildPlan,
  BuildStep,
  getBlueprint,
  listBlueprints,
} from "./Blueprint";

export interface BuildPlannerOptions {
  /** Max reach distance for placing blocks (default 4.5) */
  maxReach: number;
  /** Whether to generate scaffolding for unreachable blocks */
  generateScaffolding: boolean;
  /** Scaffolding block ID (default: cobblestone = 4) */
  scaffoldingBlockId: number;
}

const DEFAULT_OPTIONS: BuildPlannerOptions = {
  maxReach: 4.5,
  generateScaffolding: true,
  scaffoldingBlockId: 4, // cobblestone
};

export class BuildPlanner {
  private options: BuildPlannerOptions;

  constructor(options: Partial<BuildPlannerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Create a build plan from a blueprint name and anchor position.
   */
  createPlan(blueprintName: string, anchor: Vec3): BuildPlan | null {
    const blueprint = getBlueprint(blueprintName);
    if (!blueprint) return null;
    return this.planFromBlueprint(blueprint, anchor);
  }

  /**
   * Create a build plan from a custom Blueprint object.
   */
  planFromBlueprint(blueprint: Blueprint, anchor: Vec3): BuildPlan {
    const steps: BuildStep[] = [];
    const materials = new Map<number, number>();

    // Convert blueprint blocks to world-positioned build steps
    for (const block of blueprint.blocks) {
      const worldPos = {
        x: anchor.x + block.x,
        y: anchor.y + block.y,
        z: anchor.z + block.z,
      };

      // Determine placement face (simplified: place against block below)
      const face = this.determineFace(block, blueprint);

      steps.push({
        x: worldPos.x,
        y: worldPos.y,
        z: worldPos.z,
        blockId: block.blockId,
        blockName: block.blockName,
        face,
        isScaffolding: false,
        dependsOn: [],
        priority: this.calculatePriority(block, blueprint),
      });

      // Track materials
      materials.set(block.blockId, (materials.get(block.blockId) ?? 0) + 1);
    }

    // Sort by priority (foundation first)
    steps.sort((a, b) => a.priority - b.priority);

    // Add dependency indices after sorting
    const stepMap = new Map<string, number>();
    steps.forEach((s, i) => stepMap.set(`${s.x},${s.y},${s.z}`, i));

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      step.dependsOn = this.calculateDependencies(step, steps, stepMap);
    }

    // Generate scaffolding if needed
    const scaffolding = this.options.generateScaffolding
      ? this.generateScaffolding(steps, anchor, blueprint)
      : [];

    // Estimate ticks (rough: 5 ticks per block + scaffolding overhead)
    const estimatedTicks = (steps.length + scaffolding.length) * 5;

    return {
      blueprint,
      anchor,
      steps,
      scaffolding,
      estimatedTicks,
      materials,
    };
  }

  /**
   * Determine which face to place the block against.
   * Simplified: prefer placing against the block below (face=1 = top).
   */
  private determineFace(block: BlueprintBlock, blueprint: Blueprint): number {
    // Check if there's a block directly below in the blueprint
    const below = blueprint.blocks.find(
      (b) => b.x === block.x && b.y === block.y - 1 && b.z === block.z
    );
    if (below) return 1; // TOP face (place on top)

    // Check adjacent blocks for side placement
    const adjacent = blueprint.blocks.find(
      (b) =>
        (Math.abs(b.x - block.x) === 1 && b.y === block.y && b.z === block.z) ||
        (Math.abs(b.z - block.z) === 1 && b.x === block.x && b.y === block.y)
    );
    if (adjacent) {
      // Determine which side
      if (adjacent.x < block.x) return 4; // EAST (place against west face)
      if (adjacent.x > block.x) return 5; // WEST
      if (adjacent.z < block.z) return 2; // SOUTH
      if (adjacent.z > block.z) return 3; // NORTH
    }

    return 1; // Default: TOP
  }

  /**
   * Calculate placement priority (lower = earlier).
   * Foundation (y=0) first, then walls, then roof.
   */
  private calculatePriority(block: BlueprintBlock, blueprint: Blueprint): number {
    const minY = blueprint.bounds.min.y;
    const maxY = blueprint.bounds.max.y;
    const relativeY = block.y - minY;
    const height = maxY - minY;

    // Priority tiers:
    // 0: Foundation (bottom layer)
    // 1: Lower walls
    // 2: Upper walls
    // 3: Roof / top layer
    // 4: Decorative / doors / special

    if (relativeY === 0) return 0; // Foundation
    if (relativeY === height) return 3; // Roof
    if (relativeY <= height / 2) return 1; // Lower walls
    return 2; // Upper walls
  }

  /**
   * Calculate which steps must complete before this one can be placed.
   * A block depends on the block below it (if any) and adjacent support.
   */
  private calculateDependencies(
    step: BuildStep,
    allSteps: BuildStep[],
    stepMap: Map<string, number>
  ): number[] {
    const deps: number[] = [];

    // Depends on block directly below
    const belowKey = `${step.x},${step.y - 1},${step.z}`;
    if (stepMap.has(belowKey)) {
      deps.push(stepMap.get(belowKey)!);
    }

    // For side placement, depends on adjacent block at same Y
    if (step.face !== 1) {
      // Would need to check which adjacent block is the support
      // Simplified: skip for now
    }

    return deps;
  }

  /**
   * Generate scaffolding steps for blocks that are out of reach.
   * Places temporary blocks to stand on / reach from.
   */
  private generateScaffolding(
    steps: BuildStep[],
    anchor: Vec3,
    blueprint: Blueprint
  ): BuildStep[] {
    const scaffolding: BuildStep[] = [];
    const scaffoldingId = this.options.scaffoldingBlockId;
    const scaffoldingName = BlockRegistry.get(scaffoldingId).name ?? "cobblestone";

    // Helper sets for scaffolding check
    const allSteps = new Set(steps.map(s => `${s.x},${s.y},${s.z}`));
    const stepMap = new Map(steps.map((s, i) => [`${s.x},${s.y},${s.z}`, i]));

    // For each build step, check if bot can reach it from ground or previous steps
    // Simplified: if Y > 3 and no block below within reach, add scaffolding column
    for (const step of steps) {
      const relativeY = step.y - anchor.y;
      if (relativeY > 3) {
        // Check if there's a solid column below
        let hasSupport = false;
        for (let y = step.y - 1; y >= anchor.y; y--) {
          const key = `${step.x},${y},${step.z}`;
          if (allSteps.has(key) || stepMap.has(key)) {
            hasSupport = true;
            break;
          }
        }

        if (!hasSupport) {
          // Add scaffolding column from ground up to step.y - 1
          for (let y = anchor.y; y < step.y; y++) {
            const skKey = `${step.x},${y},${step.z}`;
            if (!stepMap.has(skKey) && !allSteps.has(skKey)) {
              scaffolding.push({
                x: step.x,
                y,
                z: step.z,
                blockId: scaffoldingId,
                blockName: scaffoldingName,
                face: 1,
                isScaffolding: true,
                dependsOn: y > anchor.y ? [scaffolding.length - 1] : [],
                priority: -1, // Place before everything
              });
            }
          }
        }
      }
    }

    return scaffolding;
  }

  /**
   * Check if the bot has all required materials in inventory.
   */
  checkMaterials(bot: Bot, plan: BuildPlan): { hasAll: boolean; missing: Map<number, number> } {
    const missing = new Map<number, number>();

    for (const [blockId, required] of plan.materials) {
      const item = bot.inventory.findItem((i) => i.networkId === blockId);
      const available = item?.count ?? 0;
      if (available < required) {
        missing.set(blockId, required - available);
      }
    }

    return { hasAll: missing.size === 0, missing };
  }
}

export function createBuildPlanner(options?: Partial<BuildPlannerOptions>) {
  return new BuildPlanner(options);
}
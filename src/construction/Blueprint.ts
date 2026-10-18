/**
 * Blueprint System — V9 Construction Module
 *
 * JSON schema for structures with relative block coordinates.
 * Used by BuildPlanner to generate ordered place sequences with scaffolding.
 */

import type { Vec3 } from "../types";

export interface BlueprintBlock {
  x: number; y: number; z: number;
  blockId: number;
  blockName: string;
  /** Optional: block state/data (e.g., direction, waterlogged) */
  state?: Record<string, any>;
}

export interface Blueprint {
  name: string;
  version: number;
  /** Bounding box of the structure */
  bounds: {
    min: Vec3;
    max: Vec3;
  };
  /** All blocks in the structure, relative to anchor (0,0,0) */
  blocks: BlueprintBlock[];
  /** Metadata */
  metadata?: {
    author?: string;
    description?: string;
    requiredTools?: string[];
    estimatedBlocks?: number;
    tags?: string[];
  };
}

export interface BuildPlan {
  blueprint: Blueprint;
  anchor: Vec3; // World position where blueprint (0,0,0) is placed
  /** Ordered sequence of block placements */
  steps: BuildStep[];
  /** Scaffolding blocks needed (auto-generated) */
  scaffolding: BuildStep[];
  /** Total estimated ticks to complete */
  estimatedTicks: number;
  /** Required materials (blockId -> count) */
  materials: Map<number, number>;
}

export interface BuildStep {
  x: number; y: number; z: number; // World coordinates
  blockId: number;
  blockName: string;
  /** Face to place against (for scaffolding logic) */
  face: number;
  /** Whether this is scaffolding (temporary) */
  isScaffolding: boolean;
  /** Prerequisites: indices of steps that must complete first */
  dependsOn: number[];
  /** Priority: lower = place first (foundation before roof) */
  priority: number;
}

/** Built-in blueprints for common structures */
export const BUILTIN_BLUEPRINTS: Record<string, Blueprint> = {
  "simple_shelter": {
    name: "Simple Shelter",
    version: 1,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 3, z: 4 } },
    blocks: [
      // Floor (5x4)
      ...Array.from({ length: 5 }, (_, x) =>
        Array.from({ length: 4 }, (_, z) => ({ x, y: 0, z, blockId: 4, blockName: "cobblestone" }))
      ).flat(),
      // Walls (perimeter, 3 high)
      ...Array.from({ length: 3 }, (_, y) => [
        // Front/back walls
        ...Array.from({ length: 5 }, (_, x) => ({ x, y: y + 1, z: 0, blockId: 4, blockName: "cobblestone" })),
        ...Array.from({ length: 5 }, (_, x) => ({ x, y: y + 1, z: 3, blockId: 4, blockName: "cobblestone" })),
        // Side walls (excluding corners already done)
        ...Array.from({ length: 2 }, (_, z) => ({ x: 0, y: y + 1, z: z + 1, blockId: 4, blockName: "cobblestone" })),
        ...Array.from({ length: 2 }, (_, z) => ({ x: 4, y: y + 1, z: z + 1, blockId: 4, blockName: "cobblestone" })),
      ]).flat(),
      // Roof
      ...Array.from({ length: 5 }, (_, x) =>
        Array.from({ length: 4 }, (_, z) => ({ x, y: 4, z, blockId: 4, blockName: "cobblestone" }))
      ).flat(),
      // Door (2 high, center front)
      { x: 2, y: 1, z: 0, blockId: 64, blockName: "oak_door", state: { facing: "north", half: "lower" } },
      { x: 2, y: 2, z: 0, blockId: 64, blockName: "oak_door", state: { facing: "north", half: "upper" } },
    ],
    metadata: {
      description: "Basic 5x4x3 cobblestone shelter with door",
      requiredTools: ["pickaxe"],
      estimatedBlocks: 72,
      tags: ["shelter", "starter", "survival"],
    },
  },

  "wall_perimeter": {
    name: "Wall Perimeter",
    version: 1,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 3, z: 20 } },
    blocks: [
      // Base layer
      ...Array.from({ length: 20 }, (_, x) => ({ x, y: 0, z: 0, blockId: 4, blockName: "cobblestone" })),
      ...Array.from({ length: 20 }, (_, x) => ({ x, y: 0, z: 19, blockId: 4, blockName: "cobblestone" })),
      ...Array.from({ length: 18 }, (_, z) => ({ x: 0, y: 0, z: z + 1, blockId: 4, blockName: "cobblestone" })),
      ...Array.from({ length: 18 }, (_, z) => ({ x: 19, y: 0, z: z + 1, blockId: 4, blockName: "cobblestone" })),
      // 3 blocks high
      ...Array.from({ length: 3 }, (_, y) => [
        ...Array.from({ length: 20 }, (_, x) => ({ x, y: y + 1, z: 0, blockId: 4, blockName: "cobblestone" })),
        ...Array.from({ length: 20 }, (_, x) => ({ x, y: y + 1, z: 19, blockId: 4, blockName: "cobblestone" })),
        ...Array.from({ length: 18 }, (_, z) => ({ x: 0, y: y + 1, z: z + 1, blockId: 4, blockName: "cobblestone" })),
        ...Array.from({ length: 18 }, (_, z) => ({ x: 19, y: y + 1, z: z + 1, blockId: 4, blockName: "cobblestone" })),
      ]).flat(),
    ],
    metadata: {
      description: "20x20 perimeter wall, 3 blocks high",
      requiredTools: ["pickaxe"],
      estimatedBlocks: 232,
      tags: ["defense", "perimeter", "base"],
    },
  },

  "crop_farm_9x9": {
    name: "9x9 Crop Farm (Water Center)",
    version: 1,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 1, z: 8 } },
    blocks: [
      // Farmland ring around center water
      ...Array.from({ length: 9 }, (_, x) =>
        Array.from({ length: 9 }, (_, z) => {
          const dx = Math.abs(x - 4), dz = Math.abs(z - 4);
          if (dx === 0 && dz === 0) return { x, y: 0, z, blockId: 9, blockName: "water" };
          return { x, y: 0, z, blockId: 60, blockName: "farmland" };
        })
      ).flat(),
    ],
    metadata: {
      description: "Standard 9x9 farm with center water source",
      requiredTools: ["hoe"],
      estimatedBlocks: 81,
      tags: ["farm", "food", "automation"],
    },
  },

  "iron_golem": {
    name: "Iron Golem",
    version: 1,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 3, z: 2 } },
    blocks: [
      // T shape: 4 iron blocks + pumpkin
      { x: 1, y: 0, z: 1, blockId: 42, blockName: "iron_block" },
      { x: 0, y: 1, z: 1, blockId: 42, blockName: "iron_block" },
      { x: 1, y: 1, z: 1, blockId: 42, blockName: "iron_block" },
      { x: 2, y: 1, z: 1, blockId: 42, blockName: "iron_block" },
      { x: 1, y: 2, z: 1, blockId: 86, blockName: "carved_pumpkin" },
    ],
    metadata: {
      description: "Iron Golem summoning structure",
      requiredTools: [],
      estimatedBlocks: 5,
      tags: ["defense", "mob", "utility"],
    },
  },
};

export function getBlueprint(name: string): Blueprint | undefined {
  return BUILTIN_BLUEPRINTS[name];
}

export function listBlueprints(): Blueprint[] {
  return Object.values(BUILTIN_BLUEPRINTS);
}

export function createCustomBlueprint(name: string, blocks: BlueprintBlock[]): Blueprint {
  const xs = blocks.map(b => b.x);
  const ys = blocks.map(b => b.y);
  const zs = blocks.map(b => b.z);
  return {
    name,
    version: 1,
    bounds: {
      min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
      max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) },
    },
    blocks,
    metadata: { estimatedBlocks: blocks.length },
  };
}
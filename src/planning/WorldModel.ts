/**
 * World Model — V9 State Prediction
 *
 * Simulates the outcome of actions 5-10 ticks ahead without executing them.
 * Used by HTNPlanner for plan validation and by DecisionEngine for safety checks.
 * Pure simulation — no side effects, no network calls.
 */

import type { Bot } from "../core/Bot";
import type { AgentAction, AgentObservation, Vec3 } from "../ai/Agent";
import type { World } from "../world/World";
import { BlockRegistry } from "../registry/blocks";
import { distance } from "../types";

export interface SimulatedTickResult {
  position: Vec3;
  health: number;
  food: number;
  oxygen: number;
  inventoryChanges: InventoryDelta[];
  worldChanges: WorldDelta[];
  damageTaken: number;
  hostileThreats: ThreatInfo[];
  canExecute: boolean;
  failureReason?: string;
}

export interface InventoryDelta {
  itemName: string;
  countDelta: number; // positive = gained, negative = lost
}

export interface WorldDelta {
  x: number; y: number; z: number;
  oldBlockId: number;
  newBlockId: number;
}

export interface ThreatInfo {
  entityId: number;
  type: string;
  position: Vec3;
  distance: number;
  estimatedDamagePerTick: number;
}

export interface SimulationConfig {
  maxTicks: number;
  /** Include physics (gravity, collision) in simulation */
  simulatePhysics: boolean;
  /** Simulate nearby hostile entity AI */
  simulateHostiles: boolean;
  /** Track inventory changes */
  trackInventory: boolean;
}

const DEFAULT_CONFIG: SimulationConfig = {
  maxTicks: 10,
  simulatePhysics: true,
  simulateHostiles: true,
  trackInventory: true,
};

export class WorldModel {
  private world: World;
  private bot: Bot;
  private config: SimulationConfig;

  constructor(bot: Bot, config: Partial<SimulationConfig> = {}) {
    this.bot = bot;
    this.world = bot.world;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Simulate a sequence of actions from the current observation.
   * Returns the predicted state after each tick.
   */
  simulate(actions: AgentAction[], initialObs: AgentObservation): SimulatedTickResult[] {
    const results: SimulatedTickResult[] = [];
    let currentObs = this.cloneObservation(initialObs);
    let currentPos = currentObs.position ? { ...currentObs.position } : { x: 0, y: 64, z: 0 };

    for (let tick = 0; tick < this.config.maxTicks; tick++) {
      const action = actions[tick % actions.length]; // Cycle through actions if more ticks than actions
      const result = this.simulateTick(action, currentObs, currentPos);
      results.push(result);

      // Update state for next tick
      currentPos = result.position;
      currentObs.health = result.health;
      currentObs.food = result.food;
      currentObs.oxygen = result.oxygen;
      currentObs.position = result.position;

      // Apply inventory changes
      for (const delta of result.inventoryChanges) {
        // Would update inventory summary in real impl
      }

      // Apply world changes
      for (const delta of result.worldChanges) {
        // Would update world in real impl
      }

      // Early exit if dead or stuck
      if (result.health <= 0 || !result.canExecute) break;
    }

    return results;
  }

  /**
   * Simulate a single action for one tick.
   */
  simulateTick(action: AgentAction, obs: AgentObservation, currentPos: Vec3): SimulatedTickResult {
    const inventoryChanges: InventoryDelta[] = [];
    const worldChanges: WorldDelta[] = [];
    let damageTaken = 0;
    let newPos = { ...currentPos };
    let newHealth = obs.health;
    let newFood = obs.food;
    let newOxygen = obs.oxygen;
    let canExecute = true;
    let failureReason: string | undefined;

    switch (action.type) {
      case "move_to":
        // Simplified: move toward goal by ~2 blocks per tick
        const goal = action.goal;
        if (goal.type === "near" || goal.type === "block") {
          const target = { x: goal.x, y: goal.y, z: goal.z };
          const dist = distance(currentPos, target);
          if (dist > (goal.range ?? 2)) {
            const step = Math.min(2, dist);
            const dx = target.x - currentPos.x;
            const dz = target.z - currentPos.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            newPos.x += (dx / len) * step;
            newPos.z += (dz / len) * step;
            // Y movement (jump/fall)
            if (target.y > currentPos.y) newPos.y += Math.min(1, target.y - currentPos.y);
            else if (target.y < currentPos.y) newPos.y += Math.max(-1, target.y - currentPos.y);
          }
        }
        newFood = Math.max(0, newFood - 0.01); // hunger drain
        break;

      case "dig":
        const blockId = this.world.getBlock(action.x, action.y, action.z);
        const def = BlockRegistry.get(blockId);
        if (def.solid) {
          worldChanges.push({ x: action.x, y: action.y, z: action.z, oldBlockId: blockId, newBlockId: 0 });
          // Simulate drop
          if (this.config.trackInventory) {
            inventoryChanges.push({ itemName: def.name ?? "block", countDelta: 1 });
          }
        } else {
          canExecute = false;
          failureReason = "Cannot dig non-solid block";
        }
        newFood = Math.max(0, newFood - 0.05);
        break;

      case "place":
        const heldItem = obs.heldItem;
        if (heldItem && heldItem.count > 0) {
          worldChanges.push({ x: action.x, y: action.y, z: action.z, oldBlockId: 0, newBlockId: heldItem.networkId });
          if (this.config.trackInventory) {
            inventoryChanges.push({ itemName: heldItem.name ?? "block", countDelta: -1 });
          }
        } else {
          canExecute = false;
          failureReason = "No block in hand to place";
        }
        break;

      case "attack":
        if (obs.nearestEntity && distance(currentPos, obs.nearestEntity.position) < 4.5) {
          // Simulate damage to entity (not tracked in detail)
          damageTaken = 0; // we deal damage, don't take it here
        } else {
          canExecute = false;
          failureReason = "Target out of range";
        }
        break;

      case "eat":
        if (newFood < 20) {
          newFood = Math.min(20, newFood + 4);
          newHealth = Math.min(20, newHealth + 1); // regen
        }
        break;

      case "wait":
        newFood = Math.max(0, newFood - 0.01);
        break;

      case "chat":
      case "look_at":
      case "control":
        // No state change
        break;

      default:
        canExecute = false;
        failureReason = `Unsimulated action: ${action.type}`;
    }

    // Physics: gravity
    if (this.config.simulatePhysics) {
      const belowId = this.world.getBlock(Math.floor(newPos.x), Math.floor(newPos.y) - 1, Math.floor(newPos.z));
      const belowDef = BlockRegistry.get(belowId);
      if (!belowDef.solid && newPos.y > -64) {
        newPos.y -= 0.5; // fall
      }
    }

    // Hostile threats
    const hostileThreats: ThreatInfo[] = [];
    if (this.config.simulateHostiles && obs.nearestEntity) {
      for (const [, e] of this.bot.entities) {
        if (e.type === "player" || e.type === "item") continue;
        const n = (e.type || "").toLowerCase();
        if (/zombie|skeleton|creeper|spider|pillager|drowned|husk|stray/.test(n)) {
          const d = distance(currentPos, e.position);
          if (d < 16) {
            hostileThreats.push({
              entityId: e.id,
              type: e.type,
              position: e.position,
              distance: d,
              estimatedDamagePerTick: d < 3 ? 2 : (d < 6 ? 1 : 0),
            });
            if (d < 3) {
              damageTaken += 2; // melee hit
              newHealth -= 2;
            }
          }
        }
      }
    }

    // Environmental damage
    if (newOxygen <= 0) newHealth -= 1;

    return {
      position: newPos,
      health: Math.max(0, newHealth),
      food: Math.max(0, newFood),
      oxygen: Math.max(0, newOxygen),
      inventoryChanges,
      worldChanges,
      damageTaken,
      hostileThreats,
      canExecute,
      failureReason,
    };
  }

  /**
   * Check if a planned action sequence is "safe" — bot survives and makes progress.
   */
  validatePlan(actions: AgentAction[], obs: AgentObservation): { safe: boolean; reason?: string } {
    const results = this.simulate(actions, obs);
    let minHealth = obs.health;
    let totalProgress = 0;

    for (const r of results) {
      if (!r.canExecute) return { safe: false, reason: r.failureReason };
      minHealth = Math.min(minHealth, r.health);
      if (r.position && obs.position) {
        totalProgress += distance(obs.position, r.position);
      }
    }

    if (minHealth <= 0) return { safe: false, reason: "Plan results in death" };
    if (minHealth < 5) return { safe: false, reason: "Plan leaves bot critically wounded" };

    return { safe: true };
  }

  private cloneObservation(obs: AgentObservation): AgentObservation {
    return {
      ...obs,
      position: obs.position ? { ...obs.position } : null,
      velocity: obs.velocity ? { ...obs.velocity } : null,
      nearestPlayer: obs.nearestPlayer ? { ...obs.nearestPlayer } : null,
      nearestEntity: obs.nearestEntity ? { ...obs.nearestEntity } : null,
      inventorySummary: [...(obs.inventorySummary ?? [])],
      recentFailures: [...(obs.recentFailures ?? [])],
    };
  }
}

export function createWorldModel(bot: Bot, config?: Partial<SimulationConfig>) {
  return new WorldModel(bot, config);
}
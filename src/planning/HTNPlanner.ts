/**
 * Hierarchical Task Network (HTN) Planner — V9 Core
 *
 * Decomposes high-level goals into ordered primitive actions with preconditions/effects.
 * Used by DecisionEngine in "autonomous" mode instead of personality dice rolls.
 * No LLM dependency — pure symbolic planning for reliability and speed.
 */

import type { Bot } from "../core/Bot";
import type { AgentAction, AgentObservation } from "../ai/Agent";
import type { Goal } from "../pathfinding/Pathfinder";
import { distance } from "../types";

/** Primitive action the bot can execute (maps 1:1 to AgentAction) */
export interface PrimitiveAction {
  name: string;
  action: AgentAction;
  /** Preconditions that must be true in world state */
  preconditions: WorldStatePredicate[];
  /** Effects that become true after execution */
  effects: WorldStatePredicate[];
  /** Estimated cost (ticks, resources, risk) */
  cost: number;
}

/** Compound task that decomposes into subtasks */
export interface CompoundTask {
  name: string;
  /** Ordered list of subtasks (primitive or compound) */
  subtasks: (PrimitiveAction | CompoundTask)[];
  /** Optional: alternative decompositions for replanning */
  alternatives?: (PrimitiveAction | CompoundTask)[][];
}

/** World state predicate: key=value fact (e.g., "hasIronPickaxe"=true) */
export type WorldStatePredicate = { key: string; value: any };

/** Current world state snapshot for planning */
export interface WorldState {
  predicates: Map<string, any>;
  observation: AgentObservation;
}

/** HTN Planning result */
export interface PlanResult {
  success: boolean;
  actions: AgentAction[];           // Primitive actions to execute
  remainingState: WorldState;       // Predicted final state
  failureReason?: string;
}

type Task = PrimitiveAction | CompoundTask;

export class HTNPlanner {
  private primitives = new Map<string, PrimitiveAction>();
  private compounds = new Map<string, CompoundTask>();

  constructor(private bot: Bot) {
    this.registerPrimitives();
    this.registerCompounds();
  }

  /** Register all primitive actions the bot can perform */
  private registerPrimitives() {
    // Movement
    this.addPrimitive({
      name: "move_to",
      action: { type: "move_to", goal: { type: "near", x: 0, y: 0, z: 0, range: 2 } },
      preconditions: [{ key: "canWalk", value: true }],
      effects: [{ key: "atTarget", value: true }],
      cost: 10,
    });

    this.addPrimitive({
      name: "look_at",
      action: { type: "look_at", position: { x: 0, y: 0, z: 0 } },
      preconditions: [],
      effects: [{ key: "lookingAtTarget", value: true }],
      cost: 1,
    });

    // Combat
    this.addPrimitive({
      name: "attack",
      action: { type: "attack" },
      preconditions: [{ key: "hasWeapon", value: true }, { key: "targetInRange", value: true }],
      effects: [{ key: "targetDamaged", value: true }],
      cost: 5,
    });

    // Resource gathering
    this.addPrimitive({
      name: "dig",
      action: { type: "dig", x: 0, y: 0, z: 0 },
      preconditions: [
        { key: "hasTool", value: true },
        { key: "blockInReach", value: true },
        { key: "targetBlockExists", value: true },
      ],
      effects: [{ key: "blockMined", value: true }, { key: "hasResources", value: true }],
      cost: 20,
    });

    // Building
    this.addPrimitive({
      name: "place",
      action: { type: "place", x: 0, y: 0, z: 0, face: 1 },
      preconditions: [
        { key: "hasBlock", value: true },
        { key: "canReachPosition", value: true },
      ],
      effects: [{ key: "blockPlaced", value: true }],
      cost: 10,
    });

    // Inventory / Crafting
    this.addPrimitive({
      name: "craft",
      action: { type: "custom", name: "craft", data: {} },
      preconditions: [{ key: "hasRecipe", value: true }, { key: "hasIngredients", value: true }],
      effects: [{ key: "itemCrafted", value: true }],
      cost: 30,
    });

    this.addPrimitive({
      name: "smelt",
      action: { type: "custom", name: "smelt", data: {} },
      preconditions: [
        { key: "hasFurnace", value: true },
        { key: "hasFuel", value: true },
        { key: "hasOre", value: true },
      ],
      effects: [{ key: "itemSmelted", value: true }],
      cost: 100,
    });

    // Survival
    this.addPrimitive({
      name: "eat",
      action: { type: "eat" },
      preconditions: [{ key: "hasFood", value: true }, { key: "hungry", value: true }],
      effects: [{ key: "hungry", value: false }, { key: "healthRegen", value: true }],
      cost: 5,
    });

    // Social
    this.addPrimitive({
      name: "chat",
      action: { type: "chat", message: "" },
      preconditions: [],
      effects: [{ key: "socialized", value: true }],
      cost: 1,
    });

    // Wait
    this.addPrimitive({
      name: "wait",
      action: { type: "wait", ms: 1000 },
      preconditions: [],
      effects: [{ key: "waited", value: true }],
      cost: 1,
    });
  }

  /** Register compound tasks (high-level goals) with decompositions */
  private registerCompounds() {
    // GATHER WOOD
    this.addCompound({
      name: "gather_wood",
      subtasks: [
        this.createPrimitiveRef("move_to", { goal: { type: "near", x: 0, y: 0, z: 0, range: 3 } }),
        this.createPrimitiveRef("dig", { x: 0, y: 0, z: 0 }), // tree log
      ],
    });

    // MINE IRON
    this.addCompound({
      name: "mine_iron",
      subtasks: [
        this.createPrimitiveRef("move_to", { goal: { type: "near", x: 0, y: 0, z: 0, range: 3 } }),
        this.createPrimitiveRef("dig", { x: 0, y: 0, z: 0 }), // iron ore
      ],
    });

    // BUILD SHELTER (simplified)
    this.addCompound({
      name: "build_shelter",
      subtasks: [
        this.createPrimitiveRef("move_to", { goal: { type: "near", x: 0, y: 0, z: 0, range: 2 } }),
        this.createPrimitiveRef("place", { x: 0, y: 0, z: 0 }), // floor
        this.createPrimitiveRef("place", { x: 1, y: 0, z: 0 }), // wall
        this.createPrimitiveRef("place", { x: 0, y: 1, z: 0 }), // wall
      ],
    });

    // CRAFT IRON PICKAXE
    this.addCompound({
      name: "craft_iron_pickaxe",
      subtasks: [
        this.createPrimitiveRef("craft", { item: "iron_pickaxe" }),
      ],
    });

    // FULL IRON GEAR SET
    this.addCompound({
      name: "full_iron_gear",
      subtasks: [
        { name: "mine_iron", isCompound: true },
        { name: "smelt", isCompound: true },
        { name: "craft_iron_pickaxe", isCompound: true },
        { name: "craft_iron_sword", isCompound: true },
        { name: "craft_iron_armor", isCompound: true },
      ],
    });

    // SURVIVAL PRIORITY
    this.addCompound({
      name: "ensure_survival",
      subtasks: [
        { name: "eat", isCompound: false },
        { name: "move_to", isCompound: false, goal: { type: "near", x: 0, y: 64, z: 0, range: 5 } }, // safe Y
      ],
    });
  }

  private addPrimitive(p: PrimitiveAction) {
    this.primitives.set(p.name, p);
  }

  private addCompound(c: CompoundTask) {
    this.compounds.set(c.name, c);
  }

  private createPrimitiveRef(name: string, overrides: Partial<PrimitiveAction>): PrimitiveAction {
    const base = this.primitives.get(name);
    if (!base) throw new Error(`Unknown primitive: ${name}`);
    return { ...base, ...overrides };
  }

  /** Extract current world state from observation */
  extractWorldState(obs: AgentObservation): WorldState {
    const predicates = new Map<string, any>();

    // Health / survival
    predicates.set("health", obs.health);
    predicates.set("food", obs.food);
    predicates.set("hungry", obs.food < 10);
    predicates.set("criticalHealth", obs.health < 8);

    // Inventory checks
    const inv = obs.inventorySummary ?? [];
    predicates.set("hasFood", inv.some((i) => /food|bread|apple|meat|fish/i.test(i)));
    predicates.set("hasWeapon", inv.some((i) => /sword|axe/i.test(i)));
    predicates.set("hasTool", inv.some((i) => /pickaxe|shovel|axe/i.test(i)));
    predicates.set("hasIronPickaxe", inv.some((i) => /iron_pickaxe/i.test(i)));
    predicates.set("hasBlock", inv.some((i) => /cobblestone|dirt|wood|planks/i.test(i)));
    predicates.set("hasIngredients", inv.length > 0);

    // Position / world
    predicates.set("canWalk", true); // simplified
    predicates.set("atTarget", false);
    predicates.set("targetInRange", obs.nearestEntity ? distance(obs.position!, obs.nearestEntity.position) < 4 : false);
    predicates.set("blockInReach", false); // would need raycast
    predicates.set("targetBlockExists", false);
    predicates.set("canReachPosition", true);

    return { predicates, observation: obs };
  }

  /** Check if all preconditions are satisfied in current state */
  private checkPreconditions(preconditions: WorldStatePredicate[], state: WorldState): boolean {
    for (const p of preconditions) {
      const actual = state.predicates.get(p.key);
      if (actual !== p.value) return false;
    }
    return true;
  }

  /** Apply effects to a world state (returns new state) */
  private applyEffects(effects: WorldStatePredicate[], state: WorldState): WorldState {
    const newPredicates = new Map(state.predicates);
    for (const e of effects) {
      newPredicates.set(e.key, e.value);
    }
    return { predicates: newPredicates, observation: state.observation };
  }

  /** Main planning entry point: find a plan for a high-level goal */
  plan(goalName: string, obs: AgentObservation): PlanResult {
    const compound = this.compounds.get(goalName);
    if (!compound) {
      return { success: false, actions: [], remainingState: this.extractWorldState(obs), failureReason: `Unknown goal: ${goalName}` };
    }

    const initialState = this.extractWorldState(obs);
    const plan: AgentAction[] = [];
    let currentState = initialState;

    // Depth-first decomposition with backtracking
    const result = this.decompose(compound, currentState, plan, 0);
    if (!result.success) {
      return { success: false, actions: [], remainingState: initialState, failureReason: result.failureReason };
    }

    return { success: true, actions: plan, remainingState: currentState };
  }

  /** Recursively decompose compound tasks into primitive actions */
  private decompose(task: Task, state: WorldState, plan: AgentAction[], depth: number): { success: boolean; failureReason?: string } {
    if (depth > 20) return { success: false, failureReason: "Max decomposition depth exceeded" };

    // Primitive action — check preconditions and add to plan
    if ("action" in task) {
      const primitive = task as PrimitiveAction;
      if (!this.checkPreconditions(primitive.preconditions, state)) {
        // Try to satisfy preconditions by planning sub-goals
        const prepPlan = this.satisfyPreconditions(primitive.preconditions, state);
        if (!prepPlan.success) return { success: false, failureReason: `Cannot satisfy preconditions for ${primitive.name}` };
        plan.push(...prepPlan.actions);
        state = prepPlan.remainingState;
      }

      // Add the primitive action
      plan.push(primitive.action);
      state = this.applyEffects(primitive.effects, state);
      return { success: true };
    }

    // Compound task — decompose subtasks in order
    const compound = task as CompoundTask;
    for (const subtask of compound.subtasks) {
      let subTaskObj: Task;
      if (typeof subtask === "object" && "isCompound" in subtask) {
        const name = (subtask as any).name;
        const isCompound = (subtask as any).isCompound;
        if (isCompound) {
          const c = this.compounds.get(name);
          if (!c) return { success: false, failureReason: `Unknown compound: ${name}` };
          subTaskObj = c;
        } else {
          const p = this.primitives.get(name);
          if (!p) return { success: false, failureReason: `Unknown primitive: ${name}` };
          subTaskObj = p;
        }
      } else {
        subTaskObj = subtask;
      }

      const result = this.decompose(subTaskObj, state, plan, depth + 1);
      if (!result.success) {
        // Try alternative decomposition if available
        if (compound.alternatives) {
          for (const alt of compound.alternatives) {
            // Try each alternative as a full replacement
            const altPlan: AgentAction[] = [];
            let altState = state;
            let altOk = true;
            for (const altSub of alt) {
              const altResult = this.decompose(altSub, altState, altPlan, depth + 1);
              if (!altResult.success) { altOk = false; break; }
              altState = altResult.remainingState ?? altState;
            }
            if (altOk) {
              plan.push(...altPlan);
              state = altState;
              return { success: true };
            }
          }
        }
        return { success: false, failureReason: `Failed at ${subtask.name}: ${result.failureReason}` };
      }
    }
    return { success: true };
  }

  /** Attempt to satisfy failed preconditions by planning sub-goals */
  private satisfyPreconditions(preconditions: WorldStatePredicate[], state: WorldState): PlanResult {
    const actions: AgentAction[] = [];
    let currentState = state;

    for (const p of preconditions) {
      if (currentState.predicates.get(p.key) === p.value) continue;

      // Map common preconditions to sub-goals
      let subGoal: string | null = null;
      switch (p.key) {
        case "hasFood": subGoal = "gather_food"; break;
        case "hasWeapon": subGoal = "craft_sword"; break;
        case "hasTool": subGoal = "craft_pickaxe"; break;
        case "hasBlock": subGoal = "gather_blocks"; break;
        case "targetInRange": subGoal = "move_to_target"; break;
      }

      if (subGoal) {
        const result = this.plan(subGoal, currentState.observation);
        if (!result.success) return { success: false, actions: [], remainingState: state, failureReason: `Failed to satisfy ${p.key}` };
        actions.push(...result.actions);
        currentState = result.remainingState;
      }
    }
    return { success: true, actions, remainingState: currentState };
  }

  /** Get available high-level goals */
  getAvailableGoals(): string[] {
    return Array.from(this.compounds.keys());
  }
}

export function createHTNPlanner(bot: Bot) {
  return new HTNPlanner(bot);
}
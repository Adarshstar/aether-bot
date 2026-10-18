/**
 * AI Agent – advanced observe/plan/act with real path following
 */

import type { Bot } from "../core/Bot";
import type { Vec3, Entity } from "../types";
import type { Pathfinder, Goal } from "../pathfinding/Pathfinder";
import { Priority } from "../decision/Arbitration";

export type AgentAction =
  | { type: "chat"; message: string }
  | { type: "move_to"; goal: Goal }
  | { type: "follow_path"; path: Vec3[] }
  | { type: "look_at"; position: Vec3 }
  | { type: "control"; control: "forward" | "back" | "left" | "right" | "jump" | "sneak" | "sprint"; state: boolean }
  | { type: "attack"; targetId?: number }
  | { type: "dig"; x: number; y: number; z: number }
  | { type: "place"; x: number; y: number; z: number; face?: number }
  | { type: "equip"; itemName?: string; slot?: number }
  | { type: "use_item" }
  | { type: "eat" }
  | { type: "follow_entity"; entityId: number; range?: number }
  | { type: "wait"; ms: number }
  | { type: "stop" }
  | { type: "remember"; key: string; value: any }
  | { type: "custom"; name: string; data?: any };

export interface AgentObservation {
  position: Vec3 | null;
  velocity: Vec3 | null;
  yaw: number;
  pitch: number;
  health: number;
  food: number;
  oxygen: number;
  dimension: number;
  time: number;
  raining: boolean;
  nearestPlayer: Entity | null;
  nearestEntity: Entity | null;
  entityCount: number;
  playerCount: number;
  loadedChunks: number;
  heldItem: any;
  /** Short inventory summary for the planner */
  inventorySummary?: string[];
  /** Recent action failures (for planner awareness) */
  recentFailures?: string[];
  timestamp: number;
}

export type PlannerFn = (observation: AgentObservation, bot: Bot) => Promise<AgentAction[]> | AgentAction[];

export class Agent {
  private bot: Bot;
  private pathfinder: Pathfinder | null = null;
  private running = false;
  private planner: PlannerFn | null = null;
  private tickInterval = 400;
  private actionQueue: AgentAction[] = [];
  private memory: Record<string, any> = {};
  private lastObservation: AgentObservation | null = null;

  constructor(bot: Bot) { this.bot = bot; }

  attachPathfinder(pf: Pathfinder) { this.pathfinder = pf; }
  setPlanner(fn: PlannerFn) { this.planner = fn; }
  setTickInterval(ms: number) { this.tickInterval = Math.max(50, ms); }

  remember(key: string, value: any) { this.memory[key] = value; }
  recall<T = any>(key: string): T | undefined { return this.memory[key]; }
  forget(key?: string) { if (key) delete this.memory[key]; else this.memory = {}; }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log("[Agent] Control loop started");

    while (this.running) {
      try {
        const obs = this.observe();
        this.lastObservation = obs;

        if (this.actionQueue.length === 0 && this.planner) {
          const actions = await this.planner(obs, this.bot);
          if (Array.isArray(actions) && actions.length) this.actionQueue.push(...actions);
        }

        const action = this.actionQueue.shift();
        if (action) await this.execute(action);
      } catch (err) {
        console.error("[Agent] Loop error:", err);
      }
      await this.sleep(this.tickInterval);
    }
  }

  stop() {
    this.running = false;
    this.actionQueue = [];
    this.bot.pathFollower.stop();
    console.log("[Agent] Stopped");
  }

  enqueue(...actions: AgentAction[]) { this.actionQueue.push(...actions); }
  clearQueue() { this.actionQueue = []; }

  observe(): AgentObservation {
    const e = this.bot.entity;
    // Build a short inventory summary for the LLM
    let inventorySummary: string[] = [];
    try {
      const inv = this.bot.inventory as any;
      if (inv?.items && typeof inv.items === "function") {
        const items = inv.items();
        inventorySummary = (items ?? []).slice(0, 12).map((it: any) =>
          `${it.name ?? it.displayName ?? "item"} x${it.count ?? 1}`
        );
      } else if (Array.isArray(inv?.slots)) {
        inventorySummary = inv.slots
          .filter((s: any) => s)
          .slice(0, 12)
          .map((s: any) => `${s.name ?? "item"} x${s.count ?? 1}`);
      }
    } catch { /* ignore */ }

    const recentFailures: string[] = this.recall<string[]>("recentFailures") ?? [];

    return {
      position: e?.position ?? null,
      velocity: e?.velocity ?? null,
      yaw: e?.yaw ?? 0,
      pitch: e?.pitch ?? 0,
      health: this.bot.health,
      food: this.bot.food,
      oxygen: this.bot.oxygen,
      dimension: this.bot.game?.dimension ?? 0,
      time: this.bot.game?.time ?? 0,
      raining: this.bot.game?.raining ?? false,
      nearestPlayer: this.bot.nearestEntity((ent) => ent.type === "player") as Entity | null,
      nearestEntity: this.bot.nearestEntity() as Entity | null,
      entityCount: this.bot.entities.size,
      playerCount: this.bot.players.size,
      loadedChunks: this.bot.world.loadedColumns,
      heldItem: this.bot.inventory.heldItem,
      inventorySummary,
      recentFailures: recentFailures.slice(-5),
      timestamp: Date.now(),
    };
  }

  get lastObs() { return this.lastObservation; }

  private recordFailure(msg: string) {
    const list = this.recall<string[]>("recentFailures") ?? [];
    list.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
    if (list.length > 10) list.shift();
    this.remember("recentFailures", list);
  }

  private async execute(action: AgentAction): Promise<void> {
    // V8: before executing an LLM-proposed action, check if it's permitted to claim control.
    // If the arbiter is currently held by a higher-priority task (Survival/Combat), 
    // we back off to avoid disrupting reactive safety.
    if (!this.bot.arbiter.canAct("agent", Priority.LLM_PROPOSAL)) {
      this.recordFailure("preempted by higher priority task");
      return;
    }
    // Claim control for the duration of this action
    if (!this.bot.arbiter.claim("agent", Priority.LLM_PROPOSAL)) {
      this.recordFailure("claim failed");
      return;
    }

    try {
      switch (action.type) {
        case "chat":
          this.bot.chat(action.message);
          break;
        case "move_to":
          if (this.pathfinder && this.bot.entity) {
            const path = this.pathfinder.findPath(this.bot.entity.position, action.goal);
            console.log(`[Agent] Path length ${path.length}`);
            if (path.length) this.bot.pathFollower.follow(path);
            else this.recordFailure(`no path to goal ${JSON.stringify(action.goal)}`);
          }
          break;
        case "follow_path":
          this.bot.pathFollower.follow(action.path);
          break;
        case "look_at":
          this.bot.lookAt(action.position);
          break;
        case "control":
          this.bot.setControlState(action.control, action.state);
          break;
        case "attack":
          this.bot.combat.attack();
          break;
        case "dig":
          if (typeof (this.bot as any).dig === "function") {
            // V8: auto-equip correct tool before digging (integrated from ToolManager)
            try {
              const blockId = this.bot.world.getBlock(action.x, action.y, action.z);
              await this.bot.tools.equipForBlock(blockId);
            } catch (e) {
              console.warn(`[Agent] equip tool failed:`, e);
            }
            await (this.bot as any).dig({ x: action.x, y: action.y, z: action.z });
          } else {
            console.log(`[Agent] dig ${action.x},${action.y},${action.z} (stub)`);
          }
          break;
        case "place":
          if (typeof (this.bot as any).placeBlock === "function") {
            await (this.bot as any).placeBlock({ x: action.x, y: action.y, z: action.z }, action.face ?? 1);
          } else {
            console.log(`[Agent] place ${action.x},${action.y},${action.z} (stub)`);
          }
          break;
        case "equip":
          if (typeof (this.bot as any).equip === "function") {
            await (this.bot as any).equip(action.itemName ?? action.slot);
          } else {
            console.log(`[Agent] equip ${action.itemName ?? action.slot} (stub)`);
          }
          break;
        case "use_item":
          if (typeof this.bot.activateItem === "function") {
            this.bot.activateItem();
          } else {
            this.recordFailure("use_item: activateItem missing");
          }
          break;
        case "eat":
          if (typeof this.bot.eat === "function") {
            const ok = await this.bot.eat(true);
            if (!ok) this.recordFailure("eat: no food or no session");
          } else if (this.bot.autoEat && typeof this.bot.autoEat.eat === "function") {
            await this.bot.autoEat.eat({ force: true });
          } else {
            this.recordFailure("eat: not available");
          }
          break;
        case "follow_entity": {
          const ent = this.bot.entities.get(action.entityId);
          if (ent && this.pathfinder && this.bot.entity) {
            const goal = { type: "near" as const, x: ent.position.x, y: ent.position.y, z: ent.position.z, range: action.range ?? 2 };
            const path = this.pathfinder.findPath(this.bot.entity.position, goal);
            if (path.length) this.bot.pathFollower.follow(path);
          } else {
            this.recordFailure(`follow_entity ${action.entityId} not found`);
          }
          break;
        }
        case "wait":
          await this.sleep(action.ms);
          break;
        case "stop":
          this.clearQueue();
          this.bot.pathFollower.stop();
          break;
        case "remember":
          this.remember(action.key, action.value);
          break;
        case "custom": {
          const name = action.name;
          const data = action.data ?? {};
          const scripts = (this.bot as any).scripts;
          if (scripts && typeof scripts.execCustom === "function") {
            if (scripts.hasCustom(name)) {
              await scripts.execCustom(name, data);
            } else {
              // Unknown custom → post as open/undefined work
              scripts.postWork(`custom:${name}`, data?.resolver);
              console.log(`[Agent] posted undefined work for custom:${name}`);
            }
          } else {
            console.log(`[Agent] custom:${name}`, data);
          }
          break;
        }
      }
    } catch (err: any) {
      this.recordFailure(`${action.type}: ${err?.message ?? err}`);
      console.error(`[Agent] execute ${action.type} failed:`, err);
    } finally {
      // V8: release control after the action finishes (or fails)
      this.bot.arbiter.release("agent");
    }
  }

  private sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
}

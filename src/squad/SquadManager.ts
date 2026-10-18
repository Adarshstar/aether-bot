/**
 * Squad Manager — V9 Multi-Agent Coordination
 *
 * Coordinates multiple bot instances sharing world state, dividing labor,
 * and executing formation movements. Communicates via local pub/sub.
 */

import type { Bot } from "../core/Bot";
import type { Vec3 } from "../types";
import { EventEmitter } from "events";

export type BotRole = "miner" | "builder" | "guard" | "farmer" | "explorer" | "leader";

export interface SquadMember {
  bot: Bot;
  role: BotRole;
  assignedTask: string | null;
  status: "idle" | "working" | "returning" | "combat" | "dead";
  lastSeen: number;
}

export interface SquadTask {
  id: string;
  type: "mine_area" | "build" | "guard" | "farm" | "explore" | "follow";
  target: Vec3 | { entityId: number } | { x: number; y: number; z: number; radius: number };
  priority: number;
  assignedTo: string | null; // bot username
  status: "pending" | "active" | "completed" | "failed";
  createdAt: number;
}

export interface SquadConfig {
  /** Max distance for squad members to stay together */
  cohesionRadius: number;
  /** Share chunk cache and entity data between bots */
  shareWorldState: boolean;
  /** Auto-assign roles based on inventory/skills */
  autoAssignRoles: boolean;
  /** Heartbeat interval for member liveness */
  heartbeatMs: number;
}

const DEFAULT_CONFIG: SquadConfig = {
  cohesionRadius: 50,
  shareWorldState: true,
  autoAssignRoles: true,
  heartbeatMs: 5000,
};

export class SquadManager extends EventEmitter {
  private members = new Map<string, SquadMember>();
  private tasks = new Map<string, SquadTask>();
  private leader: string | null = null;
  private config: SquadConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private taskCounter = 0;

  constructor(config: Partial<SquadConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Register a bot as a squad member */
  addMember(bot: Bot, role: BotRole = "explorer"): void {
    const username = bot.username;
    if (this.members.has(username)) return;

    this.members.set(username, {
      bot,
      role,
      assignedTask: null,
      status: "idle",
      lastSeen: Date.now(),
    });

    // Set up event forwarding
    this.setupBotListeners(bot);

    // Elect leader if none
    if (!this.leader) this.leader = username;

    this.emit("memberJoined", username, role);
    console.log(`[Squad] ${username} joined as ${role} (leader: ${this.leader})`);
  }

  /** Remove a bot from the squad */
  removeMember(username: string): void {
    const member = this.members.get(username);
    if (!member) return;

    if (this.leader === username) this.electNewLeader();
    this.members.delete(username);
    this.emit("memberLeft", username);
    console.log(`[Squad] ${username} left`);
  }

  /** Assign a high-level task to the squad (auto-distributes) */
  assignTask(type: SquadTask["type"], target: SquadTask["target"], priority = 5): string {
    const id = `task_${++this.taskCounter}_${Date.now()}`;
    const task: SquadTask = {
      id,
      type,
      target,
      priority,
      assignedTo: null,
      status: "pending",
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    this.distributeTasks();
    this.emit("taskCreated", task);
    return id;
  }

  /** Distribute pending tasks to available members based on role/priority */
  private distributeTasks(): void {
    const pendingTasks = Array.from(this.tasks.values())
      .filter((t) => t.status === "pending")
      .sort((a, b) => b.priority - a.priority);

    for (const task of pendingTasks) {
      const bestMember = this.findBestMember(task);
      if (bestMember) {
        task.assignedTo = bestMember.bot.username;
        task.status = "active";
        bestMember.assignedTask = task.id;
        bestMember.status = "working";
        this.emit("taskAssigned", task, bestMember.bot.username);
        console.log(`[Squad] Task ${task.id} (${task.type}) assigned to ${bestMember.bot.username}`);
      }
    }
  }

  /** Find the best member for a task based on role and proximity */
  private findBestMember(task: SquadTask): SquadMember | null {
    let best: SquadMember | null = null;
    let bestScore = -Infinity;

    for (const [, member] of this.members) {
      if (member.status !== "idle" && member.status !== "returning") continue;
      if (member.assignedTask) continue;

      let score = 0;

      // Role preference
      const roleMatch = this.roleMatchesTask(member.role, task.type);
      if (roleMatch) score += 100;

      // Proximity to target
      if (member.bot.entity) {
        const dist = this.distanceToTarget(member.bot.entity.position, task.target);
        score += Math.max(0, 50 - dist); // closer = better
      }

      // Leader gets priority for guard/follow tasks
      if (this.leader === member.bot.username && (task.type === "guard" || task.type === "follow")) {
        score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        best = member;
      }
    }

    return best;
  }

  private roleMatchesTask(role: BotRole, taskType: SquadTask["type"]): boolean {
    const matches: Record<BotRole, SquadTask["type"][]> = {
      miner: ["mine_area", "explore"],
      builder: ["build"],
      guard: ["guard", "follow"],
      farmer: ["farm"],
      explorer: ["explore", "mine_area"],
      leader: ["guard", "follow", "explore"],
    };
    return matches[role]?.includes(taskType) ?? false;
  }

  private distanceToTarget(pos: Vec3, target: SquadTask["target"]): number {
    if ("entityId" in target) return 999; // Would need entity lookup
    if ("radius" in target) {
      return Math.sqrt(
        (pos.x - target.x) ** 2 + (pos.y - target.y) ** 2 + (pos.z - target.z) ** 2
      );
    }
    return Math.sqrt(
      (pos.x - target.x) ** 2 + (pos.y - target.y) ** 2 + (pos.z - target.z) ** 2
    );
  }

  /** Elect a new leader (prefer guard, then oldest member) */
  private electNewLeader(): void {
    let newLeader: string | null = null;
    for (const [username, member] of this.members) {
      if (member.role === "guard") {
        newLeader = username;
        break;
      }
      if (!newLeader) newLeader = username;
    }
    this.leader = newLeader;
    if (newLeader) this.emit("leaderChanged", newLeader);
  }

  /** Called each tick to update squad state */
  tick(): void {
    // Update member statuses
    for (const [username, member] of this.members) {
      if (Date.now() - member.lastSeen > this.config.heartbeatMs * 3) {
        member.status = "dead";
        this.emit("memberUnresponsive", username);
      }
    }

    // Check task completion
    for (const [, task] of this.tasks) {
      if (task.status === "active" && task.assignedTo) {
        const member = this.members.get(task.assignedTo);
        if (!member || member.status === "dead") {
          task.status = "pending";
          task.assignedTo = null;
          this.distributeTasks();
        }
      }
    }

    // Maintain formation if guard/follow tasks active
    this.maintainFormation();
  }

  /** Keep guard/follow members in formation around leader/target */
  private maintainFormation(): void {
    if (!this.leader) return;
    const leaderMember = this.members.get(this.leader);
    if (!leaderMember || !leaderMember.bot.entity) return;

    for (const [username, member] of this.members) {
      if (username === this.leader) continue;
      if (member.role !== "guard" && member.assignedTask?.includes("guard") === false) continue;

      const targetPos = leaderMember.bot.entity!.position;
      const dist = Math.sqrt(
        (member.bot.entity?.position.x ?? 0 - targetPos.x) ** 2 +
        (member.bot.entity?.position.z ?? 0 - targetPos.z) ** 2
      );

      if (dist > this.config.cohesionRadius) {
        // Move closer to leader
        member.bot.pathfinder.findPath(member.bot.entity!.position, {
          type: "near",
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z,
          range: this.config.cohesionRadius / 2,
        });
      }
    }
  }

  /** Share world state between all members */
  shareWorldState(): void {
    if (!this.config.shareWorldState) return;

    // Merge chunk data, entity positions, player lists
    // This would sync World.columns, entities, players across all bots
    // Simplified: just emit event for consumers to handle
    this.emit("worldStateSyncRequest", Array.from(this.members.values()).map((m) => m.bot));
  }

  /** Get squad status summary */
  getStatus() {
    return {
      leader: this.leader,
      memberCount: this.members.size,
      members: Array.from(this.members.entries()).map(([username, m]) => ({
        username,
        role: m.role,
        status: m.status,
        assignedTask: m.assignedTask,
      })),
      tasks: Array.from(this.tasks.values()),
    };
  }

  private setupBotListeners(bot: Bot): void {
    bot.on("death", () => {
      const member = this.members.get(bot.username);
      if (member) {
        member.status = "dead";
        this.emit("memberDied", bot.username);
      }
    });

    bot.on("chat", (username, message) => {
      // Allow squad commands via chat
      if (message.startsWith("!squad ")) {
        this.handleSquadCommand(bot.username, message.slice(7));
      }
    });
  }

  private handleSquadCommand(from: string, command: string): void {
    const parts = command.split(" ");
    const sub = parts[0];

    switch (sub) {
      case "guard":
        this.assignTask("guard", { entityId: parts[1] ? parseInt(parts[1]) : 0 }, 10);
        break;
      case "follow":
        // Would need player entity lookup
        break;
      case "mine":
        const x = parseInt(parts[1]), y = parseInt(parts[2]), z = parseInt(parts[3]);
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          this.assignTask("mine_area", { x, y, z, radius: 10 }, 8);
        }
        break;
      case "status":
        // Could send status back via chat
        break;
    }
  }

  start(): void {
    this.heartbeatTimer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
}

export function createSquadManager(config?: Partial<SquadConfig>) {
  return new SquadManager(config);
}
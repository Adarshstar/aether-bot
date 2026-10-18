/**
 * Advanced multi-step task queue — higher-level than single Agent actions.
 */

import type { Bot } from "../core/Bot";
import type { Vec3 } from "../types";

export type Task =
  | { type: "goto"; goal: { x: number; y: number; z: number; range?: number }; priority?: number }
  | { type: "dig"; pos: Vec3; priority?: number }
  | { type: "collect"; blockId: number; count?: number; priority?: number }
  | { type: "chat"; message: string; priority?: number }
  | { type: "wait"; ms: number; priority?: number }
  | { type: "custom"; name: string; run: (bot: Bot) => Promise<void>; priority?: number };

export class TaskQueue {
  private bot: Bot;
  private queue: Task[] = [];
  private running = false;
  private aborted = false;
  private current: Task | null = null;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  get size() {
    return this.queue.length;
  }
  get active() {
    return this.current;
  }

  push(...tasks: Task[]) {
    this.queue.push(...tasks);
    this.queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    if (!this.running) void this.pump();
  }

  clear() {
    this.queue = [];
    this.aborted = true;
    this.bot.stopPath();
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    this.aborted = false;
    while (this.queue.length && !this.aborted) {
      const task = this.queue.shift()!;
      this.current = task;
      try {
        await this.run(task);
      } catch (e) {
        console.warn("[TaskQueue]", task.type, e);
      }
      this.current = null;
    }
    this.running = false;
  }

  private async run(task: Task) {
    switch (task.type) {
      case "goto":
        await this.bot.goTo({
          type: "near",
          x: task.goal.x,
          y: task.goal.y,
          z: task.goal.z,
          range: task.goal.range ?? 2,
        });
        break;
      case "dig":
        await this.bot.dig(task.pos);
        break;
      case "collect":
        await this.bot.collect.collectById(task.blockId, task.count ?? 1);
        break;
      case "chat":
        this.bot.chat(task.message);
        break;
      case "wait":
        await new Promise((r) => setTimeout(r, task.ms));
        break;
      case "custom":
        await task.run(this.bot);
        break;
    }
  }
}

export function createTaskQueue(bot: Bot) {
  return new TaskQueue(bot);
}

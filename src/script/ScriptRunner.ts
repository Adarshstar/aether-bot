/**
 * Advanced script + custom-work runner
 *
 * - Named scripts: !script wave
 * - Dynamic script text: bot.scripts.evalLines([...])
 * - Custom handlers: bot.scripts.define("mine_tree", async (ctx, args) => ...)
 * - Macros: record/play step lists
 * - Undefined work: open jobs that AI or user fills at runtime
 */

import type { Bot } from "../core/Bot";
import type { CommandContext } from "../commands/CommandRouter";

export type ScriptFn = (ctx: CommandContext, args?: string[]) => Promise<void> | void;

export type CustomHandler = (
  bot: Bot,
  data: any,
  ctx?: { signal?: AbortSignal }
) => Promise<any> | any;

export interface MacroStep {
  op: string;
  args?: any;
  waitMs?: number;
}

export interface OpenWork {
  id: string;
  description: string;
  status: "open" | "running" | "done" | "failed" | "cancelled";
  createdAt: number;
  result?: any;
  error?: string;
  /** Optional handler name or inline async fn */
  resolver?: string | CustomHandler;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class ScriptRunner {
  private scripts = new Map<string, ScriptFn>();
  private customs = new Map<string, CustomHandler>();
  private macros = new Map<string, MacroStep[]>();
  private openWork = new Map<string, OpenWork>();
  private bot: Bot;
  private workSeq = 1;
  private vars = new Map<string, any>();

  constructor(bot: Bot) {
    this.bot = bot;
    this.registerBuiltins();
    this.registerBuiltinCustoms();
  }

  // ── Named scripts ──────────────────────────────────────────

  register(name: string, fn: ScriptFn) {
    this.scripts.set(name.toLowerCase(), fn);
  }

  list(): string[] {
    return [...this.scripts.keys()].sort();
  }

  async run(name: string, ctx: CommandContext, args: string[] = []) {
    const fn = this.scripts.get(name.toLowerCase());
    if (!fn) throw new Error(`Unknown script: ${name}. Available: ${this.list().join(", ")}`);
    await fn(ctx, args);
  }

  // ── Custom handlers (Agent action type: "custom") ──────────

  define(name: string, handler: CustomHandler) {
    this.customs.set(name.toLowerCase(), handler);
  }

  listCustoms(): string[] {
    return [...this.customs.keys()].sort();
  }

  async execCustom(name: string, data: any = {}, signal?: AbortSignal): Promise<any> {
    const h = this.customs.get(name.toLowerCase());
    if (!h) throw new Error(`Unknown custom work: ${name}`);
    return h(this.bot, data, { signal });
  }

  hasCustom(name: string) {
    return this.customs.has(name.toLowerCase());
  }

  // ── Variables (shared across scripts) ──────────────────────

  setVar(key: string, value: any) {
    this.vars.set(key, value);
  }
  getVar<T = any>(key: string, fallback?: T): T {
    return (this.vars.has(key) ? this.vars.get(key) : fallback) as T;
  }

  // ── Macros ─────────────────────────────────────────────────

  saveMacro(name: string, steps: MacroStep[]) {
    this.macros.set(name.toLowerCase(), steps);
  }

  listMacros(): string[] {
    return [...this.macros.keys()].sort();
  }

  async playMacro(name: string) {
    const steps = this.macros.get(name.toLowerCase());
    if (!steps) throw new Error(`Unknown macro: ${name}`);
    for (const step of steps) {
      await this.runOp(step.op, step.args ?? {});
      if (step.waitMs) await sleep(step.waitMs);
    }
  }

  // ── Undefined / open work board ────────────────────────────

  /**
   * Post work that is not fully specified yet.
   * Later: resolve with a custom handler, script, or AI-filled plan.
   */
  postWork(description: string, resolver?: string | CustomHandler): OpenWork {
    const id = `work_${this.workSeq++}`;
    const job: OpenWork = {
      id,
      description,
      status: "open",
      createdAt: Date.now(),
      resolver,
    };
    this.openWork.set(id, job);
    console.log(`[Work] Open #${id}: ${description}`);
    return job;
  }

  listOpenWork(): OpenWork[] {
    return [...this.openWork.values()].filter((w) => w.status === "open" || w.status === "running");
  }

  async resolveWork(id: string, data?: any): Promise<OpenWork> {
    const job = this.openWork.get(id);
    if (!job) throw new Error(`No work ${id}`);
    job.status = "running";
    try {
      if (typeof job.resolver === "function") {
        job.result = await job.resolver(this.bot, data ?? { description: job.description });
      } else if (typeof job.resolver === "string") {
        job.result = await this.execCustom(job.resolver, data ?? { description: job.description });
      } else if (data?.script) {
        await this.evalLines(String(data.script).split("\n"));
        job.result = "script_ok";
      } else if (data?.custom) {
        job.result = await this.execCustom(data.custom, data.args ?? {});
      } else {
        // Best-effort: treat description as script lines
        await this.evalLines(job.description.split(/;|\n/).map((s) => s.trim()).filter(Boolean));
        job.result = "interpreted";
      }
      job.status = "done";
    } catch (e: any) {
      job.status = "failed";
      job.error = e?.message ?? String(e);
    }
    return job;
  }

  cancelWork(id: string) {
    const job = this.openWork.get(id);
    if (job && (job.status === "open" || job.status === "running")) {
      job.status = "cancelled";
    }
  }

  // ── Line-oriented mini language ────────────────────────────
  /**
   * Eval simple script lines (safe subset, not full JS):
   *   chat hello world
   *   goto 10 65 10
   *   dig 10 64 10
   *   wait 500
   *   jump
   *   custom mine_area {"r":5}
   *   set home 0 65 0
   *   call wave
   *   macro mymacro
   *   work do something undefined
   */
  async evalLines(lines: string[], ctx?: CommandContext) {
    const reply = ctx?.reply ?? ((m: string) => this.bot.chat(m));
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      const [op, ...rest] = line.split(/\s+/);
      const argStr = rest.join(" ");
      await this.runOp(op.toLowerCase(), argStr, { reply, ctx });
    }
  }

  private async runOp(op: string, args: any, extra?: { reply?: (m: string) => void; ctx?: CommandContext }) {
    const reply = extra?.reply ?? ((m: string) => this.bot.chat(m));
    const a = typeof args === "string" ? args : "";
    const parts = a.trim() ? a.trim().split(/\s+/) : [];

    switch (op) {
      case "chat":
      case "say":
        this.bot.chat(a || "…");
        break;
      case "wait":
      case "sleep":
        await sleep(Number(parts[0]) || 500);
        break;
      case "jump":
        this.bot.setControlState("jump", true);
        await sleep(150);
        this.bot.setControlState("jump", false);
        break;
      case "goto": {
        const [x, y, z] = parts.map(Number);
        if ([x, y, z].some((n) => Number.isNaN(n))) throw new Error("goto needs x y z");
        await this.bot.goTo({ type: "near", x, y, z, range: 2 });
        break;
      }
      case "dig": {
        const [x, y, z] = parts.map(Number);
        await this.bot.dig({ x, y, z });
        break;
      }
      case "look": {
        const [x, y, z] = parts.map(Number);
        this.bot.lookAt({ x, y, z });
        break;
      }
      case "eat":
        await this.bot.eat(true);
        break;
      case "stop":
        this.bot.stopPath();
        break;
      case "equip":
        await this.bot.equip(Number(parts[0]));
        break;
      case "craft":
        this.bot.craft(parts[0]);
        break;
      case "call":
      case "script":
        if (!extra?.ctx) {
          await this.run(parts[0], {
            bot: this.bot,
            username: "script",
            raw: a,
            reply,
          }, parts.slice(1));
        } else {
          await this.run(parts[0], extra.ctx, parts.slice(1));
        }
        break;
      case "custom": {
        const name = parts[0];
        let data = {};
        const json = a.slice(name.length).trim();
        if (json.startsWith("{")) {
          try {
            data = JSON.parse(json);
          } catch {
            data = { raw: json };
          }
        } else if (json) {
          data = { args: json.split(/\s+/) };
        }
        await this.execCustom(name, data);
        break;
      }
      case "macro":
        await this.playMacro(parts[0]);
        break;
      case "set": {
        // set key value...
        const key = parts[0];
        const val = parts.slice(1).join(" ");
        this.setVar(key, val);
        break;
      }
      case "get":
        reply(String(this.getVar(parts[0], "")));
        break;
      case "work":
      case "todo": {
        const job = this.postWork(a);
        reply(`Open work ${job.id}`);
        break;
      }
      case "resolve": {
        const id = parts[0];
        const job = await this.resolveWork(id, { script: parts.slice(1).join(" ") });
        reply(`${job.id} → ${job.status}`);
        break;
      }
      case "farm":
        await this.bot.farm.harvestNearby(Number(parts[0]) || 8);
        break;
      case "explore":
        this.bot.decision?.setMode("explore", { radius: Number(parts[0]) || 48 });
        break;
      default:
        // Unknown op → treat as custom handler name
        if (this.hasCustom(op)) {
          await this.execCustom(op, typeof args === "object" ? args : { args: parts });
        } else {
          throw new Error(`Unknown op: ${op}`);
        }
    }
  }

  private registerBuiltins() {
    this.register("wave", async (ctx) => {
      ctx.bot.chat("o/");
      ctx.bot.setControlState("jump", true);
      await sleep(200);
      ctx.bot.setControlState("jump", false);
    });

    this.register("spin", async (ctx) => {
      if (!ctx.bot.entity) return;
      for (let i = 0; i < 8; i++) {
        ctx.bot.entity.yaw += Math.PI / 4;
        await sleep(100);
      }
    });

    this.register("home", async (ctx) => {
      const spawn = ctx.bot.spawnPoint;
      await ctx.bot.goTo({
        type: "near",
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        range: 2,
      });
      ctx.bot.chat("Back near spawn.");
    });

    this.register("scan", async (ctx) => {
      const n = ctx.bot.entities.size;
      const p = ctx.bot.players.size;
      ctx.reply(`Entities=${n} players=${p} chunks=${ctx.bot.world.loadedColumns}`);
    });

    this.register("status", async (ctx) => {
      const e = ctx.bot.entity;
      ctx.reply(
        `hp=${ctx.bot.health} food=${ctx.bot.food} pos=${e ? `${e.position.x.toFixed(0)},${e.position.y.toFixed(0)},${e.position.z.toFixed(0)}` : "?"} scripts=${this.list().length} customs=${this.listCustoms().length} openWork=${this.listOpenWork().length}`
      );
    });

    // Multi-line style: !script do chat hi | wait 500 | jump
    this.register("do", async (ctx, args = []) => {
      const body = args.join(" ");
      const lines = body.split("|").map((s) => s.trim()).filter(Boolean);
      await this.evalLines(lines, ctx);
    });
  }

  private registerBuiltinCustoms() {
    this.define("say", async (bot, data) => {
      bot.chat(String(data?.message ?? data?.text ?? data ?? "…"));
    });

    this.define("goto", async (bot, data) => {
      const x = Number(data.x), y = Number(data.y), z = Number(data.z);
      await bot.goTo({ type: "near", x, y, z, range: data.range ?? 2 });
    });

    this.define("mine_area", async (bot, data) => {
      const r = Number(data.r ?? data.radius ?? 2);
      if (!bot.entity) return 0;
      const o = bot.entity.position;
      let n = 0;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            const pos = {
              x: Math.floor(o.x) + dx,
              y: Math.floor(o.y) + dy,
              z: Math.floor(o.z) + dz,
            };
            const id = bot.world.getBlock(pos.x, pos.y, pos.z);
            if (id === 0) continue;
            try {
              await bot.dig(pos);
              n++;
            } catch {
              /* */
            }
          }
        }
      }
      return n;
    });

    this.define("collect", async (bot, data) => {
      const id = Number(data.blockId ?? data.id);
      const count = Number(data.count ?? 1);
      await bot.collect.collectById(id, count);
    });

    this.define("undefined", async (bot, data) => {
      // Meta: create open work for something not predefined
      const desc = String(data?.description ?? data?.task ?? data ?? "undefined task");
      const job = bot.scripts.postWork(desc, data?.resolver);
      return job;
    });

    this.define("pipeline", async (bot, data) => {
      const steps: string[] = Array.isArray(data?.steps)
        ? data.steps
        : String(data?.script ?? "").split(/;|\n/).map((s: string) => s.trim()).filter(Boolean);
      await bot.scripts.evalLines(steps);
      return { steps: steps.length };
    });
  }
}

export function createScriptRunner(bot: Bot) {
  return new ScriptRunner(bot);
}

/**
 * In-game and console command router for Aether bots.
 * Players can chat: !goto x y z | !explore | !stop | !eat | !status | !say hi | !script name
 */

import type { Bot } from "../core/Bot";
import type { DecisionEngine } from "../decision/DecisionEngine";
import type { ScriptRunner } from "../script/ScriptRunner";

export type CommandHandler = (args: string[], ctx: CommandContext) => Promise<void> | void;

export interface CommandContext {
  bot: Bot;
  username: string;
  raw: string;
  reply: (msg: string) => void;
}

export interface CommandRouterOptions {
  prefix?: string;
  /** Only respond to these usernames (empty = anyone) */
  allowUsers?: string[];
  decision?: DecisionEngine | null;
  scripts?: ScriptRunner | null;
}

export class CommandRouter {
  private handlers = new Map<string, CommandHandler>();
  private prefix: string;
  private allowUsers: Set<string> | null;
  private bot: Bot;
  private decision: DecisionEngine | null;
  private scripts: ScriptRunner | null;
  private bound = false;

  constructor(bot: Bot, opts: CommandRouterOptions = {}) {
    this.bot = bot;
    this.prefix = opts.prefix ?? "!";
    this.allowUsers = opts.allowUsers?.length ? new Set(opts.allowUsers.map((u) => u.toLowerCase())) : null;
    this.decision = opts.decision ?? null;
    this.scripts = opts.scripts ?? null;
    this.registerDefaults();
  }

  setDecision(d: DecisionEngine) { this.decision = d; }
  setScripts(s: ScriptRunner) { this.scripts = s; }

  register(name: string, handler: CommandHandler) {
    this.handlers.set(name.toLowerCase(), handler);
  }

  /** Listen to bot chat for prefixed commands */
  attach() {
    if (this.bound) return;
    this.bound = true;
    this.bot.on("chat", (username, message) => {
      this.handleChat(username, message).catch((e) =>
        console.error("[Commands]", e)
      );
    });
  }

  async handleChat(username: string, message: string) {
    if (!message.startsWith(this.prefix)) return;
    if (this.allowUsers && !this.allowUsers.has(username.toLowerCase())) return;
    const body = message.slice(this.prefix.length).trim();
    if (!body) return;
    const parts = body.split(/\s+/);
    const cmd = (parts.shift() ?? "").toLowerCase();
    const args = parts;
    const handler = this.handlers.get(cmd);
    const reply = (msg: string) => {
      try { this.bot.chat(msg); } catch { /* */ }
    };
    if (!handler) {
      reply(`Unknown command: ${cmd}. Try ${this.prefix}help`);
      return;
    }
    await handler(args, { bot: this.bot, username, raw: message, reply });
  }

  /** Parse a console-style line without chat prefix */
  async runLine(line: string, username = "console") {
    const parts = line.trim().split(/\s+/);
    const cmd = (parts.shift() ?? "").toLowerCase().replace(/^\//, "");
    const handler = this.handlers.get(cmd);
    if (!handler) throw new Error(`Unknown command: ${cmd}`);
    await handler(parts, {
      bot: this.bot,
      username,
      raw: line,
      reply: (m) => console.log(`[cmd→] ${m}`),
    });
  }

  private registerDefaults() {
    this.register("help", (_args, ctx) => {
      const list = [...this.handlers.keys()].sort().join(", ");
      ctx.reply(`Commands: ${list}`);
    });

    this.register("status", (_args, ctx) => {
      const e = ctx.bot.entity;
      const pos = e?.position;
      ctx.reply(
        `hp=${ctx.bot.health} food=${ctx.bot.food} pos=${pos ? `${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}` : "?"} entities=${ctx.bot.entities.size}`
      );
    });

    this.register("say", (args, ctx) => {
      ctx.bot.chat(args.join(" ") || "…");
    });

    this.register("stop", async (_args, ctx) => {
      ctx.bot.stopPath();
      ctx.bot.agent?.stop?.();
      this.decision?.setMode("idle");
      ctx.reply("Stopped.");
    });

    this.register("eat", async (_args, ctx) => {
      const ok = await ctx.bot.eat(true);
      ctx.reply(ok ? "Eating…" : "No food or no session.");
    });

    this.register("goto", async (args, ctx) => {
      if (args.length < 3) {
        ctx.reply("Usage: !goto <x> <y> <z>");
        return;
      }
      const x = Number(args[0]), y = Number(args[1]), z = Number(args[2]);
      if ([x, y, z].some((n) => Number.isNaN(n))) {
        ctx.reply("Invalid coords");
        return;
      }
      this.decision?.setMode("goto", { x, y, z });
      await ctx.bot.goTo({ type: "near", x, y, z, range: 2 });
      ctx.reply(`Pathing to ${x} ${y} ${z}`);
    });

    this.register("explore", async (args, ctx) => {
      const radius = Number(args[0]) || 48;
      this.decision?.setMode("explore", { radius });
      ctx.reply(`Exploring radius ${radius}`);
    });

    this.register("follow", async (args, ctx) => {
      const name = args[0];
      if (!name) {
        ctx.reply("Usage: !follow <player>");
        return;
      }
      this.decision?.setMode("follow", { player: name });
      ctx.reply(`Following ${name}`);
    });

    this.register("come", async (_args, ctx) => {
      this.decision?.setMode("follow", { player: ctx.username });
      ctx.reply(`Coming to ${ctx.username}`);
    });

    this.register("guard", async (_args, ctx) => {
      this.decision?.setMode("guard");
      ctx.reply("Guard mode.");
    });

    this.register("work", async (args, ctx) => {
      if (!this.scripts) return ctx.reply("Scripts not loaded");
      if (!args.length) {
        const open = this.scripts.listOpenWork();
        return ctx.reply(open.length ? open.map(w => `${w.id}:${w.status}`).join(" | ") : "No open work");
      }
      const job = this.scripts.postWork(args.join(" "));
      ctx.reply(`Posted ${job.id}`);
    });

    this.register("resolve", async (args, ctx) => {
      if (!this.scripts || !args[0]) return ctx.reply("Usage: !resolve work_id [script...]");
      const job = await this.scripts.resolveWork(args[0], { script: args.slice(1).join(" ") });
      ctx.reply(`${job.id} ${job.status}${job.error ? " " + job.error : ""}`);
    });

    this.register("custom", async (args, ctx) => {
      if (!this.scripts || !args[0]) {
        return ctx.reply(this.scripts ? `Customs: ${this.scripts.listCustoms().join(", ")}` : "No scripts");
      }
      const name = args[0];
      let data: any = { args: args.slice(1) };
      const joined = args.slice(1).join(" ");
      if (joined.startsWith("{")) {
        try { data = JSON.parse(joined); } catch { /* */ }
      }
      const result = await this.scripts.execCustom(name, data);
      ctx.reply(`custom ${name} ok ${result != null ? JSON.stringify(result).slice(0, 80) : ""}`);
    });

    this.register("eval", async (args, ctx) => {
      if (!this.scripts) return ctx.reply("Scripts not loaded");
      const body = args.join(" ");
      const lines = body.split("|").map(s => s.trim()).filter(Boolean);
      await this.scripts.evalLines(lines, ctx);
      ctx.reply("eval done");
    });

    this.register("macro", async (args, ctx) => {
      if (!this.scripts) return ctx.reply("Scripts not loaded");
      if (!args[0]) return ctx.reply(`Macros: ${this.scripts.listMacros().join(", ") || "(none)"}`);
      await this.scripts.playMacro(args[0]);
      ctx.reply(`macro ${args[0]} done`);
    });

    this.register("script", async (args, ctx) => {
      const name = args[0];
      if (!name || !this.scripts) {
        ctx.reply(this.scripts ? `Scripts: ${this.scripts.list().join(", ")}` : "Scripts not loaded");
        return;
      }
      await this.scripts.run(name, ctx, args.slice(1));
      ctx.reply(`Script ${name} done`);
    });

    this.register("ai", async (args, ctx) => {
      const prompt = args.join(" ");
      if (!prompt) {
        ctx.reply("Usage: !ai <instruction>");
        return;
      }
      this.decision?.setMode("ai", { prompt });
      ctx.reply("AI mode: " + prompt.slice(0, 40));
    });
  }
}

export function createCommandRouter(bot: Bot, opts?: CommandRouterOptions) {
  const r = new CommandRouter(bot, opts);
  r.attach();
  return r;
}

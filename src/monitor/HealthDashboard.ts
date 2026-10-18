/**
 * Aether V7 — Phase 3: Local Health Dashboard
 *
 * Tiny dependency-free HTTP server exposing a JSON status endpoint for the
 * running bot: HP, food, position, decision mode, uptime, LLM provider
 * health, and recent failures. Meant to be polled by an external monitor
 * (or just curled by a human) — it does not control the bot, only reports.
 */

import { createServer, type Server } from "http";
import type { Bot } from "../core/Bot";
import type { FallbackLLMClient } from "../ai/FallbackLLM";
import { globalPerf } from "../core/PerfMonitor";

export interface HealthDashboardOptions {
  port?: number;
  /** Bind address; default 127.0.0.1 (not exposed publicly) */
  host?: string;
  llmFallback?: FallbackLLMClient | null;
}

export class HealthDashboard {
  private server: Server | null = null;
  private bot: Bot;
  private opts: Required<Omit<HealthDashboardOptions, "llmFallback">> & { llmFallback: FallbackLLMClient | null };
  private startedAt = Date.now();

  constructor(bot: Bot, opts: HealthDashboardOptions = {}) {
    this.bot = bot;
    this.opts = {
      port: opts.port ?? 8787,
      host: opts.host ?? "127.0.0.1",
      llmFallback: opts.llmFallback ?? null,
    };
  }

  private snapshot() {
    const e = this.bot.entity;
    return {
      ok: true,
      engine: "Aether V8-Alpha",
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      username: this.bot.username,
      health: this.bot.health,
      food: this.bot.food,
      oxygen: this.bot.oxygen,
      position: e?.position ?? null,
      dimension: this.bot.game?.dimension ?? null,
      decisionMode: (this.bot as any).decision?.getMode?.() ?? null,
      entities: this.bot.entities.size,
      players: this.bot.players.size,
      llmProviders: this.opts.llmFallback?.status() ?? null,
      perf: globalPerf.snapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  start(): void {
    if (this.server) return;
    this.server = createServer((req, res) => {
      if (req.url === "/status" || req.url === "/") {
        const body = JSON.stringify(this.snapshot(), null, 2);
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(body);
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not found. try /status" }));
    });
    this.server.listen(this.opts.port, this.opts.host, () => {
      console.log(`[HealthDashboard] listening on http://${this.opts.host}:${this.opts.port}/status`);
    });
    this.server.on("error", (err) => {
      console.warn("[HealthDashboard] server error (continuing without dashboard):", (err as Error).message);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}

export function createHealthDashboard(bot: Bot, opts?: HealthDashboardOptions) {
  return new HealthDashboard(bot, opts);
}

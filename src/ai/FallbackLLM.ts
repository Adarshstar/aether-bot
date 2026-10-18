/**
 * Aether V7 — Phase 1: Multi-Model Fallback Chain
 *
 * Wraps several LLMClient instances (different providers/models) and tries
 * them in priority order. On failure (HTTP error, timeout, rate-limit) it
 * marks that provider "cooling down" with exponential backoff and moves to
 * the next one, instead of letting the whole brain die on a single 503.
 *
 * If every provider is unavailable, callers get a clear error so they can
 * fall back to a safe non-LLM heuristic instead of crashing the agent loop.
 */

import { LLMClient, type LLMClientOptions, type LLMMessage, type LLMResponse } from "./LLMClient";

export interface ProviderSpec extends LLMClientOptions {
  /** Human-readable id used in logs and backoff bookkeeping */
  name: string;
}

export interface FallbackLLMOptions {
  providers: ProviderSpec[];
  /** Initial cooldown after a failure, doubles each consecutive failure (ms) */
  baseCooldownMs?: number;
  /** Cap on cooldown growth (ms) */
  maxCooldownMs?: number;
}

export interface FallbackResponse extends LLMResponse {
  providerUsed: string;
}

interface ProviderState {
  name: string;
  client: LLMClient;
  cooldownUntil: number;
  currentCooldown: number;
  consecutiveFailures: number;
  lastError?: string;
}

export class FallbackLLMClient {
  private providers: ProviderState[];
  private baseCooldownMs: number;
  private maxCooldownMs: number;
  /** Last response that actually succeeded — used as an emergency cache */
  private lastGoodResponse: FallbackResponse | null = null;

  constructor(opts: FallbackLLMOptions) {
    if (!opts.providers?.length) throw new Error("FallbackLLMClient: at least one provider is required");
    this.baseCooldownMs = opts.baseCooldownMs ?? 15_000;
    this.maxCooldownMs = opts.maxCooldownMs ?? 5 * 60_000;
    this.providers = opts.providers.map((p) => ({
      name: p.name,
      client: new LLMClient(p),
      cooldownUntil: 0,
      currentCooldown: this.baseCooldownMs,
      consecutiveFailures: 0,
    }));
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  /** Current health snapshot for a status dashboard */
  status() {
    const now = Date.now();
    return this.providers.map((p) => ({
      name: p.name,
      healthy: now >= p.cooldownUntil,
      cooldownRemainingMs: Math.max(0, p.cooldownUntil - now),
      consecutiveFailures: p.consecutiveFailures,
      lastError: p.lastError,
    }));
  }

  async chat(messages: LLMMessage[], overrides: Partial<LLMClientOptions> = {}): Promise<FallbackResponse> {
    const now = Date.now();
    let lastErr: any = null;

    // Try healthy providers first, in configured priority order.
    const ordered = [...this.providers].sort((a, b) => {
      const aReady = now >= a.cooldownUntil ? 0 : 1;
      const bReady = now >= b.cooldownUntil ? 0 : 1;
      return aReady - bReady;
    });

    for (const p of ordered) {
      if (Date.now() < p.cooldownUntil) continue;
      try {
        const res = await p.client.chat(messages, overrides);
        // success: reset backoff
        p.consecutiveFailures = 0;
        p.currentCooldown = this.baseCooldownMs;
        p.cooldownUntil = 0;
        p.lastError = undefined;
        const out: FallbackResponse = { ...res, providerUsed: p.name };
        this.lastGoodResponse = out;
        return out;
      } catch (err: any) {
        lastErr = err;
        p.consecutiveFailures++;
        p.lastError = err?.message ?? String(err);
        p.cooldownUntil = Date.now() + p.currentCooldown;
        p.currentCooldown = Math.min(p.currentCooldown * 2, this.maxCooldownMs);
        console.warn(`[FallbackLLM] ${p.name} failed (streak ${p.consecutiveFailures}): ${p.lastError} — cooling down ${Math.round(p.currentCooldown / 1000)}s`);
      }
    }

    throw lastErr ?? new Error("[FallbackLLM] all providers unavailable");
  }

  async complete(system: string, user: string): Promise<string> {
    const r = await this.chat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    return r.content;
  }

  /** Last response that worked, usable as an emergency cache when everything is down */
  getLastGood(): FallbackResponse | null {
    return this.lastGoodResponse;
  }
}

export function createFallbackLLM(opts: FallbackLLMOptions) {
  return new FallbackLLMClient(opts);
}

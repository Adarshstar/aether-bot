/**
 * Aether V9 — Phase 4: Resource Vein Tracker
 *
 * Persistent memory of ore vein locations, farm yields, chest inventories, and
 * other resource data across bot sessions. Integrated with AetherMemory so
 * veins survive restarts.
 */

import type { Vec3 } from "../types";

type VeinType =
  | "coal"
  | "iron"
  | "copper"
  | "gold"
  | "redstone"
  | "lapis"
  | "diamond"
  | "emerald"
  | "ancient_debris"
  | "amethyst"
  | "crop"
  | "animal"
  | "chest";

interface VeinRecord {
  id: string;
  type: VeinType;
  pos: Vec3;
  /** Estimated remaining yield (blocks/entities) */
  yield: number;
  /** Last confirmed yield */
  lastYield: number;
  /** Discovery timestamp */
  discoveredAt: number;
  /** Last visit timestamp */
  lastVisited: number;
  /** Visit count */
  visits: number;
  /** Confidence 0-1 (1 = directly observed) */
  confidence: number;
  /** Optional dimension */
  dimension?: number;
}

interface VeinTrackerOptions {
  /** Max records before eviction (default 10000) */
  maxRecords?: number;
  /** Auto-save interval ms (default 60s) */
  autosaveMs?: number;
  /** Memory file path */
  file?: string;
}

export interface VeinQuery {
  /** Nearby veins within radius, sorted by yield */
  veins: VeinRecord[];
  /** Best vein of given type */
  bestOfType: (type: VeinType, radius?: number) => VeinRecord | null;
}

/**
 * Tracks resource veins with persistence.
 */
export class VeinTracker {
  private veins: Map<string, VeinRecord> = new Map();
  private maxRecords: number;
  private file: string | null;
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: VeinTrackerOptions = {}) {
    this.maxRecords = opts.maxRecords ?? 10000;
    this.file = opts.file ?? null;
    if (opts.autosaveMs && opts.autosaveMs > 0 && this.file) {
      this.timer = setInterval(() => this.flush(), opts.autosaveMs);
    }
    if (this.file) this.load();
    process.on("exit", () => this.flush());
  }

  /** Record or update a vein */
  record(type: VeinType, pos: Vec3, yieldAmt: number, confidence: number = 1, dimension?: number) {
    const key = `${dimension ?? 0}:${Math.round(pos.x)}:${Math.round(pos.y)}:${Math.round(pos.z)}`;
    const now = Date.now();
    const existing = this.veins.get(key);

    if (existing) {
      existing.lastYield = yieldAmt;
      existing.yield = Math.max(existing.yield, yieldAmt);
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.visits++;
      existing.lastVisited = now;
    } else {
      this.veins.set(key, {
        id: key,
        type,
        pos: { ...pos },
        yield: yieldAmt,
        lastYield: yieldAmt,
        discoveredAt: now,
        lastVisited: now,
        visits: 1,
        confidence,
        dimension,
      });
      this.dirty = true;
      this._evict();
    }
  }

  /** Consume yield from a vein (after mining/harvesting) */
  consume(keyOrPos: string | Vec3, amount: number) {
    const key = typeof keyOrPos === "string" ? keyOrPos : this._posKey(keyOrPos);
    const v = this.veins.get(key);
    if (!v) return;
    v.yield = Math.max(0, v.yield - amount);
    v.lastVisited = Date.now();
    v.visits++;
    this.dirty = true;
  }

  /** Query veins near a position */
  query(pos: Vec3, radius: number = 64, type?: VeinType): VeinRecord[] {
    const r2 = radius * radius;
    const results: VeinRecord[] = [];
    for (const v of this.veins.values()) {
      if (type && v.type !== type) continue;
      if (this._dist2(v.pos, pos) > r2) continue;
      results.push(v);
    }
    results.sort((a, b) => b.yield - a.yield);
    return results;
  }

  /** Get best vein of a type within radius */
  bestOfType(type: VeinType, radius: number = 128): VeinRecord | null {
    let best: VeinRecord | null = null;
    let bestScore = -1;
    for (const v of this.veins.values()) {
      if (v.type !== type) continue;
      // Score = yield * confidence, prefer higher yield
      const score = v.yield * v.confidence;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }

  /** Mark a vein as visited (bot physically reached it) */
  visit(keyOrPos: string | Vec3) {
    const key = typeof keyOrPos === "string" ? keyOrPos : this._posKey(keyOrPos);
    const v = this.veins.get(key);
    if (v) {
      v.visits++;
      v.lastVisited = Date.now();
      this.dirty = true;
    }
  }

  all(): VeinRecord[] {
    return Array.from(this.veins.values()).sort((a, b) => b.yield - a.yield);
  }

  stats(): { total: number; byType: Record<VeinType, number>; totalYield: number } {
    const byType: Record<VeinType, number> = {} as Record<VeinType, number>;
    let totalYield = 0;
    for (const v of this.veins.values()) {
      byType[v.type] = (byType[v.type] ?? 0) + 1;
      totalYield += v.yield;
    }
    return { total: this.veins.size, byType, totalYield };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }

  private flush() {
    if (!this.dirty || !this.file) return;
    try {
      const { dirname } = require("path");
      const { existsSync, mkdirSync, writeFileSync } = require("fs");
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(
        this.file,
        JSON.stringify({ veins: Array.from(this.veins.values()), version: 1 }, null, 2)
      );
      this.dirty = false;
    } catch (err: any) {
      console.warn("[VeinTracker] failed to save:", err?.message ?? err);
    }
  }

  private load() {
    try {
      const { existsSync, readFileSync } = require("fs");
      if (existsSync(this.file!)) {
        const raw = readFileSync(this.file, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.veins)) {
          for (const v of parsed.veins) {
            this.veins.set(v.id, v as VeinRecord);
          }
        }
      }
    } catch (err: any) {
      console.warn("[VeinTracker] failed to load, starting fresh:", err?.message ?? err);
    }
  }

  private _evict() {
    if (this.veins.size <= this.maxRecords) return;
    const entries = Array.from(this.veins.entries()).sort(
      (a, b) => b[1].lastVisited - a[1].lastVisited
    );
    this.veins = new Map(entries.slice(0, this.maxRecords));
    this.dirty = true;
  }

  private _posKey(pos: Vec3): string {
    return `0:${Math.round(pos.x)}:${Math.round(pos.y)}:${Math.round(pos.z)}`;
  }
}

export function createVeinTracker(opts?: VeinTrackerOptions) {
  return new VeinTracker(opts);
}

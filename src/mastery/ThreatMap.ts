/**
 * Aether V9 — Phase 4: Dynamic Threat Map
 *
 * Tracks hostile mob spawns, player PvP zones, lava/void hazards, and other
 * environmental dangers as a decaying heatmap. The HTN planner and combat
 * arbiter consult this before committing to risky actions.
 */

import type { Vec3 } from "../types";

type ThreatType =
  | "hostile_mob"
  | "player_pvp"
  | "lava"
  | "void"
  | "explosion"
  | "fall"
  | "drowning";

interface ThreatPoint {
  type: ThreatType;
  pos: Vec3;
  /** Severity 0-1 */
  severity: number;
  /** Timestamp of last update */
  ts: number;
  /** Decay per ms (0 = permanent) */
  decayMs: number;
}

interface ThreatMapOptions {
  /** Max points before eviction (default 5000) */
  maxPoints?: number;
  /** Default decay in ms (default 5 minutes) */
  defaultDecayMs?: number;
  /** Grid cell size for heatmap queries (default 16 blocks) */
  cellSize?: number;
}

/**
 * Query result for a given region.
 */
export interface ThreatQuery {
  /** Average threat intensity 0-1 in this region */
  intensity: number;
  /** Count of active threat points */
  count: number;
  /** Dominant threat type */
  dominantType: ThreatType | null;
  /** Most severe single point */
  maxSeverity: number;
}

export class ThreatMap {
  private points: ThreatPoint[] = [];
  private maxPoints: number;
  private defaultDecayMs: number;
  private cellSize: number;

  constructor(opts: ThreatMapOptions = {}) {
    this.maxPoints = opts.maxPoints ?? 5000;
    this.defaultDecayMs = opts.defaultDecayMs ?? 5 * 60 * 1000;
    this.cellSize = opts.cellSize ?? 16;
  }

  /** Record a threat observation */
  add(type: ThreatType, pos: Vec3, severity: number, decayMs?: number) {
    this.points.push({
      type,
      pos: { ...pos },
      severity: Math.max(0, Math.min(1, severity)),
      ts: Date.now(),
      decayMs: decayMs ?? this.defaultDecayMs,
    });
    this._evict();
  }

  /** Record multiple threats at once (batch from entity scan) */
  addBatch(threats: { type: ThreatType; pos: Vec3; severity: number; decayMs?: number }[]) {
    const now = Date.now();
    for (const t of threats) {
      this.points.push({
        type: t.type,
        pos: { ...t.pos },
        severity: Math.max(0, Math.min(1, t.severity)),
        ts: now,
        decayMs: t.decayMs ?? this.defaultDecayMs,
      });
    }
    this._evict();
  }

  /** Query threat level in a region around a position */
  query(pos: Vec3, radius: number = 32): ThreatQuery {
    const now = Date.now();
    const r2 = radius * radius;
    let totalIntensity = 0;
    let count = 0;
    let maxSeverity = 0;
    const typeCounts: Record<ThreatType, number> = {} as Record<ThreatType, number>;

    for (const p of this.points) {
      if (this._isExpired(p, now)) continue;
      const d2 = this._dist2(p.pos, pos);
      if (d2 > r2) continue;
      const age = now - p.ts;
      const ageFactor = Math.max(0, 1 - age / p.decayMs);
      const intensity = p.severity * ageFactor;
      totalIntensity += intensity;
      count++;
      maxSeverity = Math.max(maxSeverity, p.severity * ageFactor);
      typeCounts[p.type] = (typeCounts[p.type] ?? 0) + 1;
    }

    if (count === 0) {
      return { intensity: 0, count: 0, dominantType: null, maxSeverity: 0 };
    }

    const dominantType = Object.entries(typeCounts).reduce(
      (a, b) => (b[1] > a[1] ? (b[0] as ThreatType) : a[0]),
      Object.entries(typeCounts)[0][0] as ThreatType
    );

    return {
      intensity: Math.min(1, totalIntensity / Math.max(1, count)),
      count,
      dominantType,
      maxSeverity,
    };
  }

  /** Is a position safe enough to build/travel? Returns true if threat is low */
  isSafe(pos: Vec3, radius: number = 16, maxIntensity: number = 0.3): boolean {
    return this.query(pos, radius).intensity < maxIntensity;
  }

  /** Get all active threat points (for rendering/debug) */
  active(): ThreatPoint[] {
    const now = Date.now();
    return this.points.filter((p) => !this._isExpired(p, now));
  }

  /** Clear all threats */
  clear() {
    this.points = [];
  }

  private _evict() {
    const now = Date.now();
    this.points = this.points.filter((p) => !this._isExpired(p, now));
    if (this.points.length > this.maxPoints) {
      this.points.sort((a, b) => b.ts - a.ts);
      this.points.length = this.maxPoints;
    }
  }

  private _isExpired(p: ThreatPoint, now: number): boolean {
    if (p.decayMs <= 0) return false;
    return now - p.ts > p.decayMs;
  }

  private _dist2(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
  }
}

export function createThreatMap(opts?: ThreatMapOptions) {
  return new ThreatMap(opts);
}

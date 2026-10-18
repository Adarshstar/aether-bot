/**
 * Lightweight exploration — pick walkable targets in a radius and path there.
 */

import type { Bot } from "../core/Bot";

export class ExploreModule {
  private bot: Bot;
  private busy = false;
  private visited = new Set<string>();
  private lastTargetAt = 0;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  private key(x: number, z: number) {
    return `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  }

  /** One exploration step toward an unvisited area */
  async step(radius = 48): Promise<boolean> {
    if (this.busy || !this.bot.entity) return false;
    const now = Date.now();
    if (now - this.lastTargetAt < 3000) return false;

    const origin = this.bot.entity.position;
    let best: { x: number; y: number; z: number; score: number } | null = null;

    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * radius;
      const tx = origin.x + Math.cos(angle) * dist;
      const tz = origin.z + Math.sin(angle) * dist;
      const ty = origin.y;
      const k = this.key(tx, tz);
      const seen = this.visited.has(k) ? 1 : 0;
      const score = dist * (seen ? 0.3 : 1) + Math.random();
      if (!best || score > best.score) {
        best = { x: tx, y: ty, z: tz, score };
      }
    }

    if (!best) return false;
    this.busy = true;
    this.lastTargetAt = now;
    this.visited.add(this.key(best.x, best.z));
    // Cap visited set
    if (this.visited.size > 400) {
      const first = this.visited.values().next().value;
      if (first) this.visited.delete(first);
    }

    try {
      console.log(`[Explore] → ${best.x.toFixed(0)}, ${best.y.toFixed(0)}, ${best.z.toFixed(0)}`);
      await this.bot.goTo({
        type: "near",
        x: best.x,
        y: best.y,
        z: best.z,
        range: 3,
      });
      return true;
    } catch {
      return false;
    } finally {
      this.busy = false;
    }
  }

  clearMemory() {
    this.visited.clear();
  }
}

export function createExplore(bot: Bot) {
  return new ExploreModule(bot);
}

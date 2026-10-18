/**
 * PvP / combat companion – mineflayer-pvp inspired
 * V7: adds kiting (back off when too close) and threat-priority targeting
 */

import type { Bot } from "../core/Bot";
import type { Entity } from "../types";
import { distance } from "../types";

export class PvP {
  private bot: Bot;
  private target: Entity | null = null;
  private active = false;
  private range = 3.5;
  /** V7: if the enemy gets closer than this, back off instead of standing still */
  private kiteDistance = 2.2;
  private kiting = false;
  private tickHandler: (() => void) | null = null;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  /** V7: enable/disable kiting behavior (default on) */
  setKiting(enabled: boolean) {
    this.kiting = enabled;
  }

  attack(entity: Entity) {
    this.target = entity;
    this.active = true;
    if (!this.tickHandler) {
      this.tickHandler = () => this.onTick();
      this.bot.on("physicsTick", this.tickHandler);
    }
  }

  stop() {
    this.active = false;
    this.target = null;
    this.bot.setControlState("back", false);
    this.bot.setControlState("forward", false);
    if (this.tickHandler) {
      this.bot.removeListener("physicsTick", this.tickHandler);
      this.tickHandler = null;
    }
  }

  /** V7: pick the best target from a list — closest low-HP threat first */
  static pickPriorityTarget(candidates: Entity[], origin: { x: number; y: number; z: number }): Entity | null {
    if (!candidates.length) return null;
    let best: Entity | null = null;
    let bestScore = -Infinity;
    for (const e of candidates) {
      const d = distance(origin, e.position);
      const hp = (e as any).health ?? 20;
      // Prefer closer + lower HP (easier/urgent kills), heavily penalize far targets
      const score = -d * 1.5 - hp * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private onTick() {
    if (!this.active || !this.target || !this.bot.entity) return;
    const d = distance(this.bot.entity.position, this.target.position);
    if (d > 16) {
      this.stop();
      return;
    }
    this.bot.lookAt(this.target.position);

    if (this.kiting && d < this.kiteDistance) {
      // Too close — back off one tick, then re-approach via the else branch
      this.bot.setControlState("forward", false);
      this.bot.setControlState("back", true);
      this.bot.combat.attack(this.target);
      return;
    }
    this.bot.setControlState("back", false);

    if (d <= this.range) {
      this.bot.combat.attack(this.target);
    } else {
      this.bot.setControlState("forward", true);
      this.bot.setControlState("sprint", true);
    }
  }

  get isFighting() { return this.active; }
}

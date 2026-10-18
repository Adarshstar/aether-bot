/**
 * CombatController – V8 Merge: Combat + PvP
 * Now a single controller for target-lock, attack-cooldown, shield-timing,
 * and kiting behavior.
 */

import type { Bot } from "../core/Bot";
import type { Entity } from "../types";
import { distance } from "../types";

const SHIELD_NETWORK_ID = 513;

export class CombatController {
  private bot: Bot;
  private target: Entity | null = null;
  private active = false;
  private range = 3.5;
  private kiteDistance = 2.2;
  private kiting = true;
  private attackCooldownMs = 500;
  private lastAttack = 0;
  private blocking = false;
  private tickHandler: (() => void) | null = null;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  // --- Attack / PvP Logic ---

  setKiting(enabled: boolean) { this.kiting = enabled; }

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
    this.blocking = false;
    this.bot.setControlState("back", false);
    this.bot.setControlState("forward", false);
    if (this.tickHandler) {
      this.bot.removeListener("physicsTick", this.tickHandler);
      this.tickHandler = null;
    }
  }

  // --- Shield Logic ---

  async raiseShield(): Promise<boolean> {
    const found = this.bot.inventory.findItem((i) => i.networkId === SHIELD_NETWORK_ID);
    if (!found) return false;
    try {
      await this.bot.equip(found.item.networkId, "off-hand");
      if (typeof this.bot.activateItem === "function") this.bot.activateItem();
      this.blocking = true;
      return true;
    } catch { return false; }
  }

  lowerShield() { this.blocking = false; }
  get isBlocking() { return this.blocking; }

  // --- Internal Tick Loop ---

  private onTick() {
    if (!this.active || !this.target || !this.bot.entity) return;
    const d = distance(this.bot.entity.position, this.target.position);
    if (d > 16) {
      this.stop();
      return;
    }

    this.bot.lookAt(this.target.position);

    // Combat logic: kite or attack
    if (this.kiting && d < this.kiteDistance) {
      this.bot.setControlState("forward", false);
      this.bot.setControlState("back", true);
      this.tryAttack();
    } else {
      this.bot.setControlState("back", false);
      if (d <= this.range) {
        this.tryAttack();
      } else {
        this.bot.setControlState("forward", true);
        this.bot.setControlState("sprint", true);
      }
    }
  }

  private tryAttack() {
    const now = Date.now();
    if (now - this.lastAttack < this.attackCooldownMs) return;
    if (!this.target || !this.bot.entity) return;
    if (distance(this.bot.entity.position, this.target.position) > 4.5) return;

    this.bot.session?.attackEntity(this.target.id);
    this.lastAttack = now;
  }

  /** Static utility for finding threats */
  static pickPriorityTarget(candidates: Entity[], origin: { x: number; y: number; z: number }): Entity | null {
    if (!candidates.length) return null;
    let best: Entity | null = null;
    let bestScore = -Infinity;
    for (const e of candidates) {
      const d = distance(origin, e.position);
      const hp = (e as any).health ?? 20;
      const score = -d * 1.5 - hp * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }
}


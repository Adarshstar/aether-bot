/**
 * Auto-eat — selects food and sends real InventoryTransaction UseItem (click air)
 * for BDS 1.26.52.3 / protocol 2193.
 */

import type { Bot } from "../core/Bot";

/** Common Bedrock food network IDs (legacy + name fallback) */
const FOOD_IDS = new Set([
  260, 297, 319, 320, 350, 357, 360, 364, 366, 391, 392, 393, 400, 412, 413, 423, 424, 463,
]);

const FOOD_NAME_RE =
  /apple|bread|cooked|beef|pork|chicken|mutton|fish|salmon|potato|carrot|pie|stew|berry|melon|cookie|golden/i;

export class AutoEat {
  private bot: Bot;
  private enabled = false;
  private foodThreshold = 14;
  private eating = false;
  private lastEat = 0;
  private cooldownMs = 2200;
  private tickHandler: (() => void) | null = null;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  enable(threshold = 14) {
    this.foodThreshold = threshold;
    this.enabled = true;
    if (!this.tickHandler) {
      this.tickHandler = () => {
        this.check().catch(() => {});
      };
      this.bot.on("health", this.tickHandler);
      this.bot.on("physicsTick", this.tickHandler);
    }
  }

  disable() {
    this.enabled = false;
    if (this.tickHandler) {
      this.bot.removeListener("health", this.tickHandler);
      this.bot.removeListener("physicsTick", this.tickHandler);
      this.tickHandler = null;
    }
  }

  /** Find a food item in inventory */
  findFood(): { slot: number; networkId: number; count: number; name?: string } | null {
    const found = this.bot.inventory.findItem(
      (i) =>
        FOOD_IDS.has(i.networkId) ||
        (typeof i.name === "string" && FOOD_NAME_RE.test(i.name))
    );
    if (!found) return null;
    return {
      slot: found.slot,
      networkId: found.item.networkId,
      count: found.item.count,
      name: found.item.name,
    };
  }

  /**
   * Eat once: select hotbar slot if possible, send UseItem (click air) + delayed ReleaseItem.
   * Returns true if a packet was sent.
   */
  async eat(options?: { force?: boolean; releaseAfterMs?: number }): Promise<boolean> {
    if (this.eating) return false;
    const now = Date.now();
    if (!options?.force && now - this.lastEat < this.cooldownMs) return false;

    const food = this.findFood();
    if (!food) {
      console.log("[AutoEat] no food in inventory");
      return false;
    }

    // Prefer hotbar 0–8; if food is in hotbar, select it
    const hotbarSlot = food.slot >= 0 && food.slot < 9 ? food.slot : this.bot.inventory.selectedSlot;
    if (food.slot < 9) {
      this.bot.inventory.selectHotbar(food.slot);
    }

    const itemInHand = {
      networkId: food.networkId,
      count: food.count,
      name: food.name,
    };

    const session = this.bot.session;
    if (!session || typeof session.useItem !== "function") {
      console.warn("[AutoEat] no live session — cannot send UseItem");
      return false;
    }

    this.eating = true;
    this.lastEat = now;
    console.log(
      `[AutoEat] UseItem eat networkId=${food.networkId} slot=${hotbarSlot} name=${food.name ?? "?"}`
    );

    try {
      session.useItem({
        hotbarSlot,
        itemInHand,
        releaseAfterMs: options?.releaseAfterMs ?? 1600,
      });
      // Brief lock so we don't spam
      await new Promise((r) => setTimeout(r, 400));
      return true;
    } catch (err: any) {
      console.error("[AutoEat] useItem failed:", err?.message ?? err);
      return false;
    } finally {
      this.eating = false;
    }
  }

  private async check() {
    if (!this.enabled || this.eating) return;
    if (this.bot.food > this.foodThreshold) return;
    await this.eat();
  }
}

/**
 * Collect block/items – mineflayer-collectblock inspired
 */

import type { Bot } from "../core/Bot";
import type { Vec3 } from "../types";
import { GoalNear } from "../goals";

export class CollectBlock {
  constructor(private bot: Bot) {}

  async collect(pos: Vec3): Promise<void> {
    await this.bot.goTo(new GoalNear(pos.x, pos.y, pos.z, 3));
    if (this.bot.canDigBlock(this.bot.world.getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)))) {
      await this.bot.dig(pos);
    }
  }

  async collectById(blockId: number, count = 1, maxDistance = 32): Promise<number> {
    let got = 0;
    while (got < count) {
      const pos = this.bot.findBlock({ matching: blockId, maxDistance });
      if (!pos) break;
      await this.collect(pos);
      got++;
    }
    return got;
  }
}

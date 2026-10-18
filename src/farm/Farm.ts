/**
 * Farming helper — find mature crops, harvest, replant when seeds available.
 */

import type { Bot } from "../core/Bot";
import { BlockRegistry } from "../registry/blocks";

/** Logical crop names we understand from registry */
const CROP_BLOCKS = new Set(["wheat", "carrots", "potatoes", "beetroots"]);
const SEED_ITEMS: Record<string, number> = {
  wheat: 295,
  carrot: 391,
  potato: 392,
};

export class Farm {
  constructor(private bot: Bot) {}

  /** Find nearby farmland or crop blocks */
  findCrops(maxDistance = 16): { x: number; y: number; z: number; id: number; name: string }[] {
    if (!this.bot.entity) return [];
    const origin = this.bot.entity.position;
    const out: { x: number; y: number; z: number; id: number; name: string }[] = [];
    const r = Math.floor(maxDistance);
    const ox = Math.floor(origin.x);
    const oy = Math.floor(origin.y);
    const oz = Math.floor(origin.z);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -2; dy <= 2; dy++) {
          const x = ox + dx, y = oy + dy, z = oz + dz;
          const id = this.bot.world.getBlock(x, y, z);
          const def = BlockRegistry.get(id);
          if (def.tags?.includes("crop") || CROP_BLOCKS.has(def.name)) {
            out.push({ x, y, z, id, name: def.name });
          }
        }
      }
    }
    return out;
  }

  /** Harvest one crop block (dig) and optionally path near it */
  async harvestAt(pos: { x: number; y: number; z: number }): Promise<void> {
    await this.bot.goTo({ type: "near", x: pos.x, y: pos.y, z: pos.z, range: 3 });
    await this.bot.dig(pos);
  }

  /** Harvest up to N crops in range */
  async harvestNearby(maxCount = 8, maxDistance = 16): Promise<number> {
    const crops = this.findCrops(maxDistance).slice(0, maxCount);
    let n = 0;
    for (const c of crops) {
      try {
        await this.harvestAt(c);
        n++;
      } catch {
        /* skip */
      }
    }
    return n;
  }

  /** Place seeds on farmland if held */
  async plantSeed(farmland: { x: number; y: number; z: number }, seedId = 295): Promise<boolean> {
    const found = this.bot.inventory.findItem((i) => i.networkId === seedId);
    if (!found) return false;
    this.bot.inventory.selectHotbar(Math.min(8, found.slot));
    await this.bot.goTo({
      type: "near",
      x: farmland.x,
      y: farmland.y,
      z: farmland.z,
      range: 3,
    });
    // place on top of farmland
    await this.bot.placeBlock(
      { x: farmland.x, y: farmland.y, z: farmland.z },
      { x: 0, y: 1, z: 0 }
    );
    return true;
  }
}

export function createFarm(bot: Bot) {
  return new Farm(bot);
}

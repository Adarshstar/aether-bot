/**
 * Best tool selection – mineflayer-tool inspired
 */

import type { Bot } from "../core/Bot";
import { BlockRegistry } from "../registry/blocks";

const TOOL_MAP: Record<string, number[]> = {
  pickaxe: [257, 270, 274, 278, 285], // illustrative item ids
  shovel: [256, 269, 273, 277, 284],
  axe: [258, 271, 275, 279, 286],
  shears: [359],
  sword: [267, 268, 272, 276, 283],
};

export class ToolManager {
  constructor(private bot: Bot) {}

  /** Equip best available tool for block */
  async equipForBlock(blockId: number): Promise<boolean> {
    const def = BlockRegistry.get(blockId);
    const tool = def.tool ?? "none";
    if (tool === "none") return false;
    const candidates = TOOL_MAP[tool] ?? [];
    for (const id of candidates) {
      const found = this.bot.inventory.findItem((i) => i.networkId === id);
      if (found) {
        await this.bot.equip(id, "hand");
        return true;
      }
    }
    return false;
  }
}

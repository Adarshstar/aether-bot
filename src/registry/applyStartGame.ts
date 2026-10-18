/**
 * Merge StartGame / CreativeContent / item-block palette info into registries.
 * BDS may send runtime ids that differ from our seed table — this keeps names working.
 */

import { BlockRegistry, type BlockDef } from "./blocks";
import { ItemRegistry, type ItemDef } from "./items";

export interface PaletteEntry {
  name?: string;
  runtimeId?: number;
  networkId?: number;
  state?: Record<string, unknown>;
}

/**
 * Apply block palette entries: name → register/override runtime id.
 */
export function applyBlockPalette(entries: PaletteEntry[]) {
  let n = 0;
  for (const e of entries) {
    const name = (e.name ?? "").replace(/^minecraft:/, "");
    const id = e.runtimeId ?? e.networkId;
    if (!name || id == null) continue;
    const existing = BlockRegistry.getByName(name);
    if (existing) {
      // Re-register under server runtime id if different
      if (existing.id !== id) {
        BlockRegistry.register({ ...existing, id });
        n++;
      }
    } else {
      const def: BlockDef = {
        id,
        name,
        solid: true,
        passable: false,
        hardness: 1,
        tool: "none",
        harvestable: true,
        displayName: name.replace(/_/g, " "),
      };
      BlockRegistry.register(def);
      n++;
    }
  }
  return n;
}

export function applyItemPalette(entries: PaletteEntry[]) {
  let n = 0;
  for (const e of entries) {
    const name = (e.name ?? "").replace(/^minecraft:/, "");
    const id = e.networkId ?? e.runtimeId;
    if (!name || id == null) continue;
    const existing = ItemRegistry.getByName(name);
    if (existing) {
      if (existing.networkId !== id) {
        ItemRegistry.register({ ...existing, networkId: id });
        n++;
      }
    } else {
      const def: ItemDef = {
        networkId: id,
        name,
        stackSize: 64,
        displayName: name.replace(/_/g, " "),
        category: "items",
      };
      ItemRegistry.register(def);
      n++;
    }
  }
  return n;
}

/** Best-effort extract palettes from a StartGame decoded object */
export function applyStartGameData(data: any): { blocks: number; items: number } {
  let blocks = 0;
  let items = 0;
  const blockList =
    data?.blockPalette ??
    data?.blocks ??
    data?.blockStates ??
    data?.runtimeBlockStates ??
    [];
  const itemList =
    data?.itemPalette ??
    data?.items ??
    data?.itemStates ??
    data?.runtimeItems ??
    [];
  if (Array.isArray(blockList)) blocks = applyBlockPalette(blockList);
  if (Array.isArray(itemList)) items = applyItemPalette(itemList);
  if (blocks || items) {
    console.log(`[Registry] StartGame palette merged blocks=+${blocks} items=+${items}`);
  }
  return { blocks, items };
}

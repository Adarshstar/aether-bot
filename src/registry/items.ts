/**
 * Expanded item registry — Bedrock-oriented network ids (seed palette).
 * Production: merge StartGame item states when available.
 */

export interface ItemDef {
  networkId: number;
  name: string;
  displayName?: string;
  stackSize: number;
  maxDurability?: number;
  category?: "building" | "nature" | "equipment" | "items" | "food" | "none";
  foodPoints?: number;
  tags?: string[];
}

const byId = new Map<number, ItemDef>();
const byName = new Map<string, ItemDef>();

function add(d: ItemDef) {
  byId.set(d.networkId, d);
  byName.set(d.name, d);
}

function I(id: number, name: string, stack = 64, extra: Partial<ItemDef> = {}) {
  add({
    networkId: id,
    name,
    stackSize: stack,
    displayName: name.replace(/_/g, " "),
    category: "items",
    ...extra,
  });
}

function seed() {
  I(0, "air", 0, { category: "none" });
  I(1, "stone", 64, { category: "building", tags: ["building"] });
  I(2, "grass_block", 64, { category: "nature" });
  I(3, "dirt", 64, { category: "nature" });
  I(4, "cobblestone", 64, { category: "building" });
  I(5, "oak_planks", 64, { category: "building", tags: ["planks"] });
  I(17, "oak_log", 64, { category: "nature", tags: ["log"] });
  I(54, "chest", 64, { category: "building", tags: ["container"] });
  I(58, "crafting_table", 64, { category: "building", tags: ["crafting"] });
  I(61, "furnace", 64, { category: "building" });
  I(263, "coal", 64, { tags: ["fuel"] });
  I(264, "diamond", 64, { tags: ["gem"] });
  I(265, "iron_ingot", 64, { tags: ["ingot"] });
  I(266, "gold_ingot", 64, { tags: ["ingot"] });
  I(280, "stick", 64, { tags: ["stick"] });
  // Tools / weapons
  I(268, "wooden_sword", 1, { maxDurability: 59, category: "equipment", tags: ["sword", "weapon"] });
  I(269, "wooden_shovel", 1, { maxDurability: 59, category: "equipment", tags: ["shovel", "tool"] });
  I(270, "wooden_pickaxe", 1, { maxDurability: 59, category: "equipment", tags: ["pickaxe", "tool"] });
  I(271, "wooden_axe", 1, { maxDurability: 59, category: "equipment", tags: ["axe", "tool"] });
  I(272, "stone_sword", 1, { maxDurability: 131, category: "equipment", tags: ["sword"] });
  I(273, "stone_shovel", 1, { maxDurability: 131, category: "equipment", tags: ["shovel"] });
  I(274, "stone_pickaxe", 1, { maxDurability: 131, category: "equipment", tags: ["pickaxe"] });
  I(275, "stone_axe", 1, { maxDurability: 131, category: "equipment", tags: ["axe"] });
  I(267, "iron_sword", 1, { maxDurability: 250, category: "equipment", tags: ["sword"] });
  I(256, "iron_shovel", 1, { maxDurability: 250, category: "equipment", tags: ["shovel"] });
  I(257, "iron_pickaxe", 1, { maxDurability: 250, category: "equipment", tags: ["pickaxe"] });
  I(258, "iron_axe", 1, { maxDurability: 250, category: "equipment", tags: ["axe"] });
  I(276, "diamond_sword", 1, { maxDurability: 1561, category: "equipment", tags: ["sword"] });
  I(277, "diamond_shovel", 1, { maxDurability: 1561, category: "equipment", tags: ["shovel"] });
  I(278, "diamond_pickaxe", 1, { maxDurability: 1561, category: "equipment", tags: ["pickaxe"] });
  I(279, "diamond_axe", 1, { maxDurability: 1561, category: "equipment", tags: ["axe"] });
  I(359, "shears", 1, { maxDurability: 238, category: "equipment" });
  // Food
  I(260, "apple", 64, { category: "food", foodPoints: 4, tags: ["food"] });
  I(297, "bread", 64, { category: "food", foodPoints: 5, tags: ["food"] });
  I(319, "raw_porkchop", 64, { category: "food", foodPoints: 3, tags: ["food", "raw"] });
  I(320, "cooked_porkchop", 64, { category: "food", foodPoints: 8, tags: ["food"] });
  I(357, "cookie", 64, { category: "food", foodPoints: 2, tags: ["food"] });
  I(360, "melon_slice", 64, { category: "food", foodPoints: 2, tags: ["food"] });
  I(364, "cooked_beef", 64, { category: "food", foodPoints: 8, tags: ["food"] });
  I(366, "cooked_chicken", 64, { category: "food", foodPoints: 6, tags: ["food"] });
  I(391, "carrot", 64, { category: "food", foodPoints: 3, tags: ["food"] });
  I(392, "potato", 64, { category: "food", foodPoints: 1, tags: ["food"] });
  I(393, "baked_potato", 64, { category: "food", foodPoints: 5, tags: ["food"] });
  I(400, "pumpkin_pie", 64, { category: "food", foodPoints: 8, tags: ["food"] });
  I(322, "golden_apple", 64, { category: "food", foodPoints: 4, tags: ["food"] });
  // Materials
  I(331, "redstone", 64, { tags: ["redstone"] });
  I(348, "glowstone_dust", 64);
  I(318, "flint", 64);
  I(289, "gunpowder", 64);
  I(287, "string", 64);
  I(288, "feather", 64);
  I(334, "leather", 64);
  I(341, "slime_ball", 64);
  I(388, "emerald", 64, { tags: ["gem"] });
  I(409, "prismarine_shard", 64);
  I(452, "iron_nugget", 64);
  I(371, "gold_nugget", 64);
  I(345, "compass", 64);
  I(347, "clock", 64);
  I(295, "wheat_seeds", 64, { category: "nature" });
  I(296, "wheat", 64, { category: "nature" });
  I(338, "sugar_cane", 64, { category: "nature" });
  I(353, "sugar", 64);
  I(336, "brick", 64);
  I(337, "clay_ball", 64);
  I(405, "nether_brick", 64);
  I(406, "nether_quartz", 64);
  I(340, "book", 64);
  I(339, "paper", 64);
  I(352, "bone", 64);
  I(351, "dye", 64);
}

seed();

export const ItemRegistry = {
  get(id: number): ItemDef {
    return (
      byId.get(id) ?? {
        networkId: id,
        name: `unknown_${id}`,
        stackSize: 64,
        category: "items" as const,
      }
    );
  },
  getByName(name: string): ItemDef | undefined {
    return byName.get(name);
  },
  isFood(id: number) {
    const d = this.get(id);
    return d.category === "food" || (d.foodPoints ?? 0) > 0;
  },
  size() {
    return byId.size;
  },
  get length() {
    return byId.size;
  },
  register(d: ItemDef) {
    add(d);
  },
  all(): ItemDef[] {
    return [...byId.values()];
  },
};

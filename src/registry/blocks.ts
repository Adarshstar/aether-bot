/**
 * @aether/registry — Expanded Bedrock-oriented block definitions
 * Runtime IDs are approximate vanilla-style seeds; servers may remap via StartGame palette.
 */

export interface BlockDef {
  id: number;
  name: string;
  displayName?: string;
  solid: boolean;
  passable: boolean;
  liquid?: boolean;
  hardness: number;
  resistance?: number;
  tool?: "none" | "pickaxe" | "shovel" | "axe" | "hoe" | "shears" | "sword";
  light?: number;
  transparent?: boolean;
  replaceable?: boolean;
  harvestable?: boolean;
  /** Semantic tags for AI / pathfinding */
  tags?: string[];
}

const byId = new Map<number, BlockDef>();
const byName = new Map<string, BlockDef>();
const byTag = new Map<string, Set<number>>();

function add(def: BlockDef) {
  byId.set(def.id, def);
  byName.set(def.name, def);
  for (const t of def.tags ?? []) {
    let s = byTag.get(t);
    if (!s) {
      s = new Set();
      byTag.set(t, s);
    }
    s.add(def.id);
  }
}

function S(
  id: number,
  name: string,
  solid: boolean,
  hardness: number,
  extra: Partial<BlockDef> = {}
) {
  add({
    id,
    name,
    solid,
    passable: !solid,
    hardness,
    displayName: name.replace(/_/g, " "),
    tool: "none",
    harvestable: solid && isFinite(hardness),
    ...extra,
  });
}

function seed() {
  // Core terrain
  S(0, "air", false, 0, { passable: true, transparent: true, replaceable: true, harvestable: false, tags: ["air"] });
  S(1, "stone", true, 1.5, { tool: "pickaxe", resistance: 6, tags: ["stone", "mineable_pickaxe"] });
  S(2, "grass_block", true, 0.6, { tool: "shovel", tags: ["dirt", "mineable_shovel"] });
  S(3, "dirt", true, 0.5, { tool: "shovel", tags: ["dirt", "mineable_shovel"] });
  S(4, "cobblestone", true, 2, { tool: "pickaxe", resistance: 6, tags: ["stone", "mineable_pickaxe"] });
  S(5, "planks", true, 2, { tool: "axe", tags: ["wood", "planks", "mineable_axe"] });
  S(6, "sapling", false, 0, { passable: true, replaceable: true, transparent: true, tags: ["plant"] });
  S(7, "bedrock", true, Infinity, { resistance: 3600000, harvestable: false, tags: ["unbreakable"] });
  S(8, "flowing_water", false, 100, { passable: true, liquid: true, transparent: true, tags: ["water", "liquid"] });
  S(9, "water", false, 100, { passable: true, liquid: true, transparent: true, tags: ["water", "liquid"] });
  S(10, "flowing_lava", false, 100, { passable: false, liquid: true, tags: ["lava", "liquid", "hazard"] });
  S(11, "lava", false, 100, { passable: false, liquid: true, tags: ["lava", "liquid", "hazard"] });
  S(12, "sand", true, 0.5, { tool: "shovel", tags: ["sand", "gravity", "mineable_shovel"] });
  S(13, "gravel", true, 0.6, { tool: "shovel", tags: ["gravity", "mineable_shovel"] });
  S(14, "gold_ore", true, 3, { tool: "pickaxe", tags: ["ore", "mineable_pickaxe"] });
  S(15, "iron_ore", true, 3, { tool: "pickaxe", tags: ["ore", "mineable_pickaxe"] });
  S(16, "coal_ore", true, 3, { tool: "pickaxe", tags: ["ore", "mineable_pickaxe"] });
  S(17, "log", true, 2, { tool: "axe", tags: ["wood", "log", "mineable_axe"] });
  S(18, "leaves", true, 0.2, { tool: "shears", transparent: true, tags: ["leaves"] });
  S(19, "sponge", true, 0.6, { tool: "hoe" });
  S(20, "glass", true, 0.3, { transparent: true, tags: ["glass"] });
  S(21, "lapis_ore", true, 3, { tool: "pickaxe", tags: ["ore"] });
  S(22, "lapis_block", true, 3, { tool: "pickaxe" });
  S(23, "dispenser", true, 3.5, { tool: "pickaxe", tags: ["container", "redstone"] });
  S(24, "sandstone", true, 0.8, { tool: "pickaxe", tags: ["stone"] });
  S(25, "note_block", true, 0.8, { tool: "axe", tags: ["redstone"] });
  S(26, "bed", true, 0.2, { tags: ["bed"] });
  S(27, "golden_rail", false, 0.7, { passable: true, tags: ["rail"] });
  S(28, "detector_rail", false, 0.7, { passable: true, tags: ["rail", "redstone"] });
  S(29, "sticky_piston", true, 1.5, { tags: ["piston", "redstone"] });
  S(30, "web", false, 4, { passable: true, tags: ["slow"] });
  S(31, "tallgrass", false, 0, { passable: true, replaceable: true, transparent: true, tags: ["plant"] });
  S(32, "deadbush", false, 0, { passable: true, replaceable: true, transparent: true, tags: ["plant"] });
  S(33, "piston", true, 1.5, { tags: ["piston", "redstone"] });
  S(35, "wool", true, 0.8, { tool: "shears", tags: ["wool"] });
  S(37, "yellow_flower", false, 0, { passable: true, replaceable: true, transparent: true, tags: ["plant", "flower"] });
  S(38, "red_flower", false, 0, { passable: true, replaceable: true, transparent: true, tags: ["plant", "flower"] });
  S(39, "brown_mushroom", false, 0, { passable: true, transparent: true, tags: ["plant"] });
  S(40, "red_mushroom", false, 0, { passable: true, transparent: true, tags: ["plant"] });
  S(41, "gold_block", true, 3, { tool: "pickaxe", tags: ["metal"] });
  S(42, "iron_block", true, 5, { tool: "pickaxe", tags: ["metal"] });
  S(43, "double_stone_slab", true, 2, { tool: "pickaxe" });
  S(44, "stone_slab", true, 2, { tool: "pickaxe", tags: ["slab"] });
  S(45, "brick_block", true, 2, { tool: "pickaxe" });
  S(46, "tnt", true, 0, { tags: ["explosive", "hazard"] });
  S(47, "bookshelf", true, 1.5, { tool: "axe" });
  S(48, "mossy_cobblestone", true, 2, { tool: "pickaxe" });
  S(49, "obsidian", true, 50, { tool: "pickaxe", resistance: 1200, tags: ["obsidian"] });
  S(50, "torch", false, 0, { passable: true, transparent: true, light: 14, tags: ["light"] });
  S(51, "fire", false, 0, { passable: true, light: 15, tags: ["hazard", "fire"] });
  S(52, "mob_spawner", true, 5, { tool: "pickaxe", tags: ["spawner"] });
  S(53, "oak_stairs", true, 2, { tool: "axe", tags: ["stairs", "wood"] });
  S(54, "chest", true, 2.5, { tool: "axe", tags: ["container", "chest"] });
  S(56, "diamond_ore", true, 3, { tool: "pickaxe", tags: ["ore"] });
  S(57, "diamond_block", true, 5, { tool: "pickaxe" });
  S(58, "crafting_table", true, 2.5, { tool: "axe", tags: ["crafting", "container"] });
  S(59, "wheat", false, 0, { passable: true, tags: ["crop"] });
  S(60, "farmland", true, 0.6, { tool: "shovel", tags: ["farm"] });
  S(61, "furnace", true, 3.5, { tool: "pickaxe", tags: ["container", "furnace"] });
  S(62, "lit_furnace", true, 3.5, { tool: "pickaxe", light: 13, tags: ["container", "furnace"] });
  S(63, "standing_sign", false, 1, { passable: true, tool: "axe" });
  S(64, "wooden_door", true, 3, { tool: "axe", tags: ["door"] });
  S(65, "ladder", false, 0.4, { passable: true, tags: ["climb"] });
  S(66, "rail", false, 0.7, { passable: true, tags: ["rail"] });
  S(67, "stone_stairs", true, 2, { tool: "pickaxe", tags: ["stairs"] });
  S(68, "wall_sign", false, 1, { passable: true, tool: "axe" });
  S(69, "lever", false, 0.5, { passable: true, tags: ["redstone"] });
  S(70, "stone_pressure_plate", false, 0.5, { passable: true, tags: ["redstone"] });
  S(71, "iron_door", true, 5, { tool: "pickaxe", tags: ["door"] });
  S(72, "wooden_pressure_plate", false, 0.5, { passable: true, tags: ["redstone"] });
  S(73, "redstone_ore", true, 3, { tool: "pickaxe", tags: ["ore", "redstone"] });
  S(74, "lit_redstone_ore", true, 3, { tool: "pickaxe", light: 9, tags: ["ore"] });
  S(75, "unlit_redstone_torch", false, 0, { passable: true, tags: ["redstone"] });
  S(76, "redstone_torch", false, 0, { passable: true, light: 7, tags: ["redstone", "light"] });
  S(77, "stone_button", false, 0.5, { passable: true, tags: ["redstone"] });
  S(78, "snow_layer", false, 0.1, { passable: true, tool: "shovel", tags: ["snow"] });
  S(79, "ice", true, 0.5, { transparent: true, tags: ["ice"] });
  S(80, "snow", true, 0.2, { tool: "shovel", tags: ["snow"] });
  S(81, "cactus", true, 0.4, { tags: ["hazard", "plant"] });
  S(82, "clay", true, 0.6, { tool: "shovel" });
  S(83, "reeds", false, 0, { passable: true, tags: ["plant"] });
  S(84, "jukebox", true, 2, { tool: "axe" });
  S(85, "fence", true, 2, { tool: "axe", tags: ["fence", "wood"] });
  S(86, "pumpkin", true, 1, { tool: "axe", tags: ["gourd"] });
  S(87, "netherrack", true, 0.4, { tool: "pickaxe", tags: ["nether"] });
  S(88, "soul_sand", true, 0.5, { tool: "shovel", tags: ["nether", "slow"] });
  S(89, "glowstone", true, 0.3, { light: 15, tags: ["light", "nether"] });
  S(90, "portal", false, -1, { passable: true, light: 11, tags: ["portal"] });
  S(91, "lit_pumpkin", true, 1, { light: 15, tool: "axe" });
  S(98, "stonebrick", true, 1.5, { tool: "pickaxe" });
  S(103, "melon_block", true, 1, { tool: "axe" });
  // Deepslate / modern-ish aliases (logical ids for AI — remap from StartGame in production)
  S(1000, "deepslate", true, 3, { tool: "pickaxe", tags: ["stone", "mineable_pickaxe"] });
  S(1001, "deepslate_iron_ore", true, 4.5, { tool: "pickaxe", tags: ["ore"] });
  S(1002, "deepslate_diamond_ore", true, 4.5, { tool: "pickaxe", tags: ["ore"] });
  S(1003, "copper_ore", true, 3, { tool: "pickaxe", tags: ["ore"] });
  S(1004, "amethyst_block", true, 1.5, { tool: "pickaxe" });
  S(1005, "moss_block", true, 0.1, { tool: "hoe", tags: ["dirt"] });
  S(1006, "scaffolding", false, 0, { passable: true, tags: ["climb"] });
  S(1007, "barrel", true, 2.5, { tool: "axe", tags: ["container"] });
  S(1008, "smoker", true, 3.5, { tool: "pickaxe", tags: ["container", "furnace"] });
  S(1009, "blast_furnace", true, 3.5, { tool: "pickaxe", tags: ["container", "furnace"] });
  S(1010, "cartography_table", true, 2.5, { tool: "axe", tags: ["container"] });
  S(1011, "fletching_table", true, 2.5, { tool: "axe" });
  S(1012, "smithing_table", true, 2.5, { tool: "axe", tags: ["container"] });
  S(1013, "loom", true, 2.5, { tool: "axe", tags: ["container"] });
  S(1014, "stonecutter", true, 3.5, { tool: "pickaxe", tags: ["container"] });
  S(1015, "lectern", true, 2.5, { tool: "axe" });
  S(1016, "composter", true, 0.6, { tool: "axe", tags: ["container"] });
  S(1017, "target", true, 0.5, { tags: ["redstone"] });
  S(1018, "bee_nest", true, 0.3, { tool: "axe", tags: ["container"] });
  S(1019, "honey_block", true, 0, { tags: ["slow"] });
  S(1020, "ancient_debris", true, 30, { tool: "pickaxe", tags: ["nether", "ore"] });
}

seed();

export const BlockRegistry = {
  get(id: number): BlockDef {
    return (
      byId.get(id) ?? {
        id,
        name: `unknown_${id}`,
        solid: id !== 0,
        passable: id === 0,
        hardness: 1,
        tool: "none" as const,
        harvestable: id !== 0,
      }
    );
  },
  getByName(name: string): BlockDef | undefined {
    return byName.get(name);
  },
  isSolid(id: number) {
    return this.get(id).solid;
  },
  isPassable(id: number) {
    return this.get(id).passable;
  },
  isLiquid(id: number) {
    return !!this.get(id).liquid;
  },
  digTimeMs(id: number) {
    const h = this.get(id).hardness;
    if (!isFinite(h)) return Infinity;
    return Math.max(50, h * 1000);
  },
  hasTag(id: number, tag: string) {
    return !!this.get(id).tags?.includes(tag);
  },
  idsWithTag(tag: string): number[] {
    return [...(byTag.get(tag) ?? [])];
  },
  size() {
    return byId.size;
  },
  get length() {
    return byId.size;
  },
  register(def: BlockDef) {
    add(def);
  },
  all(): BlockDef[] {
    return [...byId.values()];
  },
};

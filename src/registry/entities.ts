/**
 * Entity registry – Bedrock-oriented
 * Type id / string name → dimensions, category, metadata defaults
 */

export type EntityCategory =
  | "player"
  | "hostile"
  | "passive"
  | "neutral"
  | "ambient"
  | "water"
  | "projectile"
  | "item"
  | "vehicle"
  | "other";

export interface EntityDef {
  /** Numeric type / network type id (simplified) */
  id: number;
  name: string;
  displayName?: string;
  category: EntityCategory;
  width: number;
  height: number;
  /** Can be attacked */
  attackable: boolean;
  /** Default max health */
  maxHealth?: number;
  /** Movement speed hint */
  speed?: number;
}

const byId = new Map<number, EntityDef>();
const byName = new Map<string, EntityDef>();

function add(def: EntityDef) {
  byId.set(def.id, def);
  byName.set(def.name, def);
}

function seed() {
  const E = (
    id: number, name: string, category: EntityCategory,
    width: number, height: number, extra: Partial<EntityDef> = {}
  ) => add({
    id, name, category, width, height,
    attackable: category === "hostile" || category === "neutral" || category === "passive" || category === "player",
    displayName: name.replace(/_/g, " "),
    ...extra,
  });

  E(63, "player", "player", 0.6, 1.8, { maxHealth: 20, speed: 0.1 });
  E(64, "item", "item", 0.25, 0.25, { attackable: false });
  E(65, "xp_orb", "other", 0.25, 0.25, { attackable: false });

  // Hostiles
  E(32, "zombie", "hostile", 0.6, 1.95, { maxHealth: 20, speed: 0.23 });
  E(33, "creeper", "hostile", 0.6, 1.7, { maxHealth: 20, speed: 0.25 });
  E(34, "skeleton", "hostile", 0.6, 1.99, { maxHealth: 20, speed: 0.25 });
  E(35, "spider", "hostile", 1.4, 0.9, { maxHealth: 16, speed: 0.3 });
  E(36, "enderman", "hostile", 0.6, 2.9, { maxHealth: 40, speed: 0.3 });
  E(37, "slime", "hostile", 0.51, 0.51, { maxHealth: 16 });
  E(38, "blaze", "hostile", 0.6, 1.8, { maxHealth: 20 });
  E(39, "ghast", "hostile", 4, 4, { maxHealth: 10 });
  E(40, "piglin", "hostile", 0.6, 1.95, { maxHealth: 16 });
  E(41, "hoglin", "hostile", 1.4, 1.4, { maxHealth: 40 });
  E(42, "warden", "hostile", 0.9, 2.9, { maxHealth: 500 });
  E(43, "breeze", "hostile", 0.6, 1.77, { maxHealth: 30 });
  E(44, "bogged", "hostile", 0.6, 1.99, { maxHealth: 16 });
  E(45, "creaking", "hostile", 0.6, 2.7, { maxHealth: 1 });
  E(17, "cat", "passive", 0.6, 0.7, { maxHealth: 10 });
  E(18, "horse", "passive", 1.4, 1.6, { maxHealth: 30 });
  E(19, "axolotl", "passive", 0.75, 0.42, { maxHealth: 14 });

  // Passive
  E(10, "chicken", "passive", 0.4, 0.7, { maxHealth: 4 });
  E(11, "cow", "passive", 0.9, 1.4, { maxHealth: 10 });
  E(12, "pig", "passive", 0.9, 0.9, { maxHealth: 10 });
  E(13, "sheep", "passive", 0.9, 1.3, { maxHealth: 8 });
  E(14, "wolf", "neutral", 0.6, 0.85, { maxHealth: 8 });
  E(15, "villager", "passive", 0.6, 1.95, { maxHealth: 20 });
  E(16, "iron_golem", "neutral", 1.4, 2.7, { maxHealth: 100 });

  // Vehicles / other
  E(84, "boat", "vehicle", 1.4, 0.45, { attackable: false });
  E(90, "minecart", "vehicle", 0.98, 0.7, { attackable: false });
  E(70, "falling_block", "other", 0.98, 0.98, { attackable: false });
  E(71, "tnt", "other", 0.98, 0.98, { attackable: false });
  E(80, "arrow", "projectile", 0.5, 0.5, { attackable: false });
}

seed();

export const EntityRegistry = {
  get(id: number): EntityDef {
    return byId.get(id) ?? {
      id, name: `unknown_${id}`, category: "other",
      width: 0.6, height: 1.8, attackable: true,
    };
  },

  getByName(name: string): EntityDef | undefined {
    return byName.get(name) ?? byName.get(name.toLowerCase());
  },

  register(def: EntityDef) {
    add(def);
  },

  loadJSON(defs: EntityDef[]) {
    for (const d of defs) add(d);
  },

  isHostile(id: number): boolean {
    return this.get(id).category === "hostile";
  },

  isPassive(id: number): boolean {
    const c = this.get(id).category;
    return c === "passive" || c === "ambient";
  },

  dimensions(id: number): { width: number; height: number } {
    const d = this.get(id);
    return { width: d.width, height: d.height };
  },

  list(): EntityDef[] {
    return [...byId.values()];
  },

  listByCategory(category: EntityCategory): EntityDef[] {
    return this.list().filter((e) => e.category === category);
  },

  get size() {
    return byId.size;
  },
};

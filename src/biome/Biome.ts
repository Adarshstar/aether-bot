/**
 * Biome registry – prismarine-biome inspired
 */

export interface BiomeDef {
  id: number;
  name: string;
  temperature: number;
  humidity: number;
  displayName?: string;
}

const biomes = new Map<number, BiomeDef>();
const byName = new Map<string, BiomeDef>();

function add(b: BiomeDef) {
  biomes.set(b.id, b);
  byName.set(b.name, b);
}

[
  { id: 0, name: "ocean", temperature: 0.5, humidity: 0.5 },
  { id: 1, name: "plains", temperature: 0.8, humidity: 0.4 },
  { id: 2, name: "desert", temperature: 2.0, humidity: 0.0 },
  { id: 3, name: "windswept_hills", temperature: 0.2, humidity: 0.3 },
  { id: 4, name: "forest", temperature: 0.7, humidity: 0.8 },
  { id: 5, name: "taiga", temperature: 0.25, humidity: 0.8 },
  { id: 6, name: "swamp", temperature: 0.8, humidity: 0.9 },
  { id: 7, name: "river", temperature: 0.5, humidity: 0.5 },
  { id: 8, name: "nether_wastes", temperature: 2.0, humidity: 0.0 },
  { id: 9, name: "the_end", temperature: 0.5, humidity: 0.5 },
  { id: 12, name: "snowy_plains", temperature: 0.0, humidity: 0.5 },
  { id: 14, name: "mushroom_fields", temperature: 0.9, humidity: 1.0 },
  { id: 21, name: "jungle", temperature: 0.95, humidity: 0.9 },
].forEach((b) => add({ ...b, displayName: b.name.replace(/_/g, " ") }));

export const BiomeRegistry = {
  get(id: number): BiomeDef {
    return biomes.get(id) ?? { id, name: `biome_${id}`, temperature: 0.5, humidity: 0.5 };
  },
  getByName(name: string) { return byName.get(name); },
  register(b: BiomeDef) { add(b); },
  list() { return [...biomes.values()]; },
};

/**
 * World Knowledge Extension — V9 Persistent World Memory
 *
 * Extends AetherMemory with world-level knowledge: ore veins, bases, danger zones,
 * farm locations, player-built structures. Survives restarts and syncs across squad.
 */

import { AetherMemory, createMemory, type PlayerMemoryEntry } from "../memory/Memory";

export interface OreVein {
  id: string;
  blockId: number;
  blockName: string;
  position: { x: number; y: number; z: number };
  dimension: number;
  estimatedCount: number;
  discoveredAt: number;
  lastMinedAt?: number;
  depleted: boolean;
}

export interface BaseLocation {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  dimension: number;
  owner: string; // player username or "squad"
  type: "shelter" | "base" | "farm" | "vault" | "outpost" | "trap";
  size: "tiny" | "small" | "medium" | "large" | "massive";
  discoveredAt: number;
  lastVisitedAt: number;
  notes: string[];
  defenses: string[]; // "walls", "iron_golems", "lighting", "traps"
}

export interface DangerZone {
  id: string;
  type: "hostile_spawn" | "pvp_hotspot" | "environmental" | "void" | "lava_pool" | "warden";
  position: { x: number; y: number; z: number };
  radius: number;
  dimension: number;
  severity: 1 | 2 | 3 | 4 | 5; // 5 = lethal
  discoveredAt: number;
  lastTriggeredAt?: number;
  description: string;
  avoidUntil?: number; // timestamp
}

export interface FarmLocation {
  id: string;
  type: "crop" | "animal" | "iron_golem" | "villager_trader" | "mob_grinder" | "tree_farm";
  position: { x: number; y: number; z: number };
  dimension: number;
  owner: string;
  yieldPerHour?: Record<string, number>;
  lastHarvestedAt?: number;
  status: "active" | "needs_maintenance" | "broken" | "full";
  notes: string[];
}

export interface WorldKnowledgeData {
  version: number;
  oreVeins: Record<string, OreVein>;
  bases: Record<string, BaseLocation>;
  dangerZones: Record<string, DangerZone>;
  farms: Record<string, FarmLocation>;
  /** Chunk-level notes: "diamonds at Y=-50", "stronghold nearby" */
  chunkNotes: Record<string, string[]>;
}

const DEFAULT_DATA: WorldKnowledgeData = {
  version: 1,
  oreVeins: {},
  bases: {},
  dangerZones: {},
  farms: {},
  chunkNotes: {},
};

export class WorldKnowledge {
  private data: WorldKnowledgeData = { ...DEFAULT_DATA };
  private file: string;
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private playerMemory: AetherMemory;

  constructor(file: string = ".aether-memory/world.json", playerMemory?: AetherMemory) {
    this.file = file;
    this.playerMemory = playerMemory ?? createMemory();
    this.load();
    this.timer = setInterval(() => this.flush(), 60_000);
    process.on("exit", () => this.flush());
  }

  private load() {
    try {
      const fs = require("fs");
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this.data = { ...DEFAULT_DATA, ...parsed };
        }
      }
    } catch (err: any) {
      console.warn("[WorldKnowledge] failed to load:", err?.message ?? err);
    }
  }

  flush() {
    if (!this.dirty) return;
    try {
      const fs = require("fs");
      const path = require("path");
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch (err: any) {
      console.warn("[WorldKnowledge] failed to save:", err?.message ?? err);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }

  // --- Ore Veins ---

  recordOreVein(vein: Omit<OreVein, "id" | "discoveredAt">): string {
    const id = `vein_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.data.oreVeins[id] = { ...vein, id, discoveredAt: Date.now() };
    this.dirty = true;
    return id;
  }

  updateOreVein(id: string, updates: Partial<OreVein>): boolean {
    const vein = this.data.oreVeins[id];
    if (!vein) return false;
    Object.assign(vein, updates);
    this.dirty = true;
    return true;
  }

  getOreVein(id: string): OreVein | undefined {
    return this.data.oreVeins[id];
  }

  findNearbyVeins(pos: { x: number; y: number; z: number }, radius: number, dimension: number): OreVein[] {
    const results: OreVein[] = [];
    const r2 = radius * radius;
    for (const vein of Object.values(this.data.oreVeins)) {
      if (vein.dimension !== dimension || vein.depleted) continue;
      const dx = vein.position.x - pos.x;
      const dy = vein.position.y - pos.y;
      const dz = vein.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= r2) results.push(vein);
    }
    return results.sort((a, b) => b.estimatedCount - a.estimatedCount);
  }

  getAllVeins(): OreVein[] {
    return Object.values(this.data.oreVeins).filter(v => !v.depleted);
  }

  // --- Bases ---

  recordBase(base: Omit<BaseLocation, "id" | "discoveredAt" | "lastVisitedAt">): string {
    const id = `base_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.data.bases[id] = { ...base, id, discoveredAt: Date.now(), lastVisitedAt: Date.now() };
    this.dirty = true;
    return id;
  }

  visitBase(id: string): boolean {
    const base = this.data.bases[id];
    if (!base) return false;
    base.lastVisitedAt = Date.now();
    this.dirty = true;
    return true;
  }

  getBase(id: string): BaseLocation | undefined {
    return this.data.bases[id];
  }

  findNearbyBases(pos: { x: number; y: number; z: number }, radius: number, dimension: number): BaseLocation[] {
    const results: BaseLocation[] = [];
    const r2 = radius * radius;
    for (const base of Object.values(this.data.bases)) {
      if (base.dimension !== dimension) continue;
      const dx = base.position.x - pos.x;
      const dy = base.position.y - pos.y;
      const dz = base.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= r2) results.push(base);
    }
    return results;
  }

  // --- Danger Zones ---

  recordDangerZone(zone: Omit<DangerZone, "id" | "discoveredAt">): string {
    const id = `danger_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.data.dangerZones[id] = { ...zone, id, discoveredAt: Date.now() };
    this.dirty = true;
    return id;
  }

  triggerDangerZone(id: string): boolean {
    const zone = this.data.dangerZones[id];
    if (!zone) return false;
    zone.lastTriggeredAt = Date.now();
    // Auto-set avoid timer based on severity (1min * severity)
    zone.avoidUntil = Date.now() + zone.severity * 60_000;
    this.dirty = true;
    return true;
  }

  isDangerous(pos: { x: number; y: number; z: number }, dimension: number): DangerZone | null {
    const now = Date.now();
    for (const zone of Object.values(this.data.dangerZones)) {
      if (zone.dimension !== dimension) continue;
      if (zone.avoidUntil && now < zone.avoidUntil) continue; // still avoiding
      const dx = zone.position.x - pos.x;
      const dy = zone.position.y - pos.y;
      const dz = zone.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= zone.radius * zone.radius) return zone;
    }
    return null;
  }

  // --- Farms ---

  recordFarm(farm: Omit<FarmLocation, "id" | "discoveredAt">): string {
    const id = `farm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.data.farms[id] = { ...farm, id, discoveredAt: Date.now() };
    this.dirty = true;
    return id;
  }

  harvestFarm(id: string, yields: Record<string, number>): boolean {
    const farm = this.data.farms[id];
    if (!farm) return false;
    farm.lastHarvestedAt = Date.now();
    farm.yieldPerHour = yields;
    farm.status = "active";
    this.dirty = true;
    return true;
  }

  getFarm(id: string): FarmLocation | undefined {
    return this.data.farms[id];
  }

  // --- Chunk Notes ---

  addChunkNote(cx: number, cz: number, note: string): void {
    const key = `${cx},${cz}`;
    if (!this.data.chunkNotes[key]) this.data.chunkNotes[key] = [];
    this.data.chunkNotes[key].push(`[${new Date().toISOString().slice(0,16)}] ${note}`);
    // Keep last 10 notes per chunk
    if (this.data.chunkNotes[key].length > 10) this.data.chunkNotes[key].shift();
    this.dirty = true;
  }

  getChunkNotes(cx: number, cz: number): string[] {
    return this.data.chunkNotes[`${cx},${cz}`] ?? [];
  }

  // --- Summary for LLM ---

  /** Generate a compact summary for LLM system prompt injection */
  generateSummary(pos: { x: number; y: number; z: number }, dimension: number, radius = 200): string {
    const parts: string[] = [];

    const veins = this.findNearbyVeins(pos, radius, dimension);
    if (veins.length) {
      parts.push(`Ore veins nearby: ${veins.slice(0,5).map(v => `${v.blockName}(${v.estimatedCount})`).join(", ")}`);
    }

    const bases = this.findNearbyBases(pos, radius, dimension);
    if (bases.length) {
      parts.push(`Known bases: ${bases.slice(0,3).map(b => `${b.name}(${b.type})`).join(", ")}`);
    }

    const danger = this.isDangerous(pos, dimension);
    if (danger) {
      parts.push(`⚠ DANGER: ${danger.type} (severity ${danger.severity}/5) at distance ~${Math.round(Math.sqrt(
        (danger.position.x - pos.x)**2 + (danger.position.z - pos.z)**2
      ))} blocks`);
    }

    const farms = Object.values(this.data.farms).filter(f => f.dimension === dimension);
    const nearbyFarms = farms.filter(f => {
      const dx = f.position.x - pos.x, dz = f.position.z - pos.z;
      return dx*dx + dz*dz <= radius*radius;
    });
    if (nearbyFarms.length) {
      parts.push(`Farms: ${nearbyFarms.map(f => f.type).join(", ")}`);
    }

    return parts.length ? parts.join(" | ") : "No significant world knowledge in range.";
  }

  /** Export for squad sync */
  exportForSync(): WorldKnowledgeData {
    return { ...this.data };
  }

  /** Import from another WorldKnowledge (squad merge) */
  importFromSync(other: WorldKnowledgeData): number {
    let merged = 0;
    for (const [id, vein] of Object.entries(other.oreVeins)) {
      if (!this.data.oreVeins[id] || vein.lastMinedAt > (this.data.oreVeins[id].lastMinedAt ?? 0)) {
        this.data.oreVeins[id] = vein;
        merged++;
      }
    }
    for (const [id, base] of Object.entries(other.bases)) {
      if (!this.data.bases[id] || base.lastVisitedAt > (this.data.bases[id].lastVisitedAt ?? 0)) {
        this.data.bases[id] = base;
        merged++;
      }
    }
    for (const [id, zone] of Object.entries(other.dangerZones)) {
      if (!this.data.dangerZones[id] || zone.lastTriggeredAt > (this.data.dangerZones[id].lastTriggeredAt ?? 0)) {
        this.data.dangerZones[id] = zone;
        merged++;
      }
    }
    for (const [id, farm] of Object.entries(other.farms)) {
      if (!this.data.farms[id] || farm.lastHarvestedAt > (this.data.farms[id].lastHarvestedAt ?? 0)) {
        this.data.farms[id] = farm;
        merged++;
      }
    }
    for (const [key, notes] of Object.entries(other.chunkNotes)) {
      if (!this.data.chunkNotes[key]) this.data.chunkNotes[key] = [];
      for (const n of notes) {
        if (!this.data.chunkNotes[key].includes(n)) this.data.chunkNotes[key].push(n);
      }
    }
    this.dirty = true;
    return merged;
  }
}

export function createWorldKnowledge(file?: string, playerMemory?: AetherMemory) {
  return new WorldKnowledge(file, playerMemory);
}
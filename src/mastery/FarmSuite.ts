/**
 * Aether V9 — Phase 4: Automated Farming Suite
 *
 * Manages crop rotation, animal breeding, villager trading halls, and
 * iron/gold farm maintenance. Coordinates with VeinTracker and ThreatMap
 * to choose safe farm locations and schedule maintenance.
 */

import type { Vec3 } from "../types";

type CropType = "wheat" | "potato" | "carrot" | "beetroot" | "melon" | "pumpkin" | "sugar_cane" | "cocoa";
type AnimalType = "cow" | "pig" | "sheep" | "chicken" | "rabbit";

interface FarmPlot {
  id: string;
  type: CropType;
  pos: Vec3;
  /** Blocks in this plot */
  size: number;
  /** Last planted timestamp */
  plantedAt: number | null;
  /** Last harvested timestamp */
  harvestedAt: number | null;
  /** Is fully grown */
  ready: boolean;
}

interface AnimalPen {
  id: string;
  type: AnimalType;
  pos: Vec3;
  /** Animal count */
  count: number;
  /** Can breed (has food) */
  canBreed: boolean;
  /** Last breed timestamp */
  lastBreed: number | null;
}

interface VillagerTrade {
  villagerId: number;
  profession: string;
  pos: Vec3;
  /** Trades offered */
  trades: { buy: string; sell: string; count: number }[];
  /** Last trade timestamp */
  lastTrade: number | null;
}

interface FarmSuiteOptions {
  /** Auto-harvest when crops ready (default true) */
  autoHarvest?: boolean;
  /** Auto-breed animals when possible (default true) */
  autoBreed?: boolean;
  /** Auto-trade with villagers (default false) */
  autoTrade?: boolean;
  /** Min food level before auto-eat from farm (default 14) */
  minFoodLevel?: number;
}

export interface FarmSuiteStatus {
  plots: FarmPlot[];
  pens: AnimalPen[];
  traders: VillagerTrade[];
  totalCrops: number;
  totalAnimals: number;
  readyToHarvest: number;
}

export class FarmSuite {
  private plots: Map<string, FarmPlot> = new Map();
  private pens: Map<string, AnimalPen> = new Map();
  private traders: Map<number, VillagerTrade> = new Map();
  private opts: Required<FarmSuiteOptions>;
  private dirty = false;

  constructor(opts: FarmSuiteOptions = {}) {
    this.opts = {
      autoHarvest: opts.autoHarvest ?? true,
      autoBreed: opts.autoBreed ?? true,
      autoTrade: opts.autoTrade ?? false,
      minFoodLevel: opts.minFoodLevel ?? 14,
    };
  }

  /** Register a crop plot */
  registerPlot(id: string, type: CropType, pos: Vec3, size: number) {
    this.plots.set(id, { id, type, pos: { ...pos }, size, plantedAt: null, harvestedAt: null, ready: false });
    this.dirty = true;
  }

  /** Mark plot as planted */
  plant(id: string) {
    const p = this.plots.get(id);
    if (p) { p.plantedAt = Date.now(); p.ready = false; this.dirty = true; }
  }

  /** Mark plot as ready to harvest */
  readyToHarvestPlot(id: string) {
    const p = this.plots.get(id);
    if (p) { p.ready = true; this.dirty = true; }
  }

  /** Mark plot as harvested */
  harvest(id: string) {
    const p = this.plots.get(id);
    if (p) { p.harvestedAt = Date.now(); p.ready = false; p.plantedAt = null; this.dirty = true; }
  }

  /** Register an animal pen */
  registerPen(id: string, type: AnimalType, pos: Vec3, count: number) {
    this.pens.set(id, { id, type, pos: { ...pos }, count, canBreed: false, lastBreed: null });
    this.dirty = true;
  }

  /** Update pen animal count */
  updatePen(id: string, count: number, canBreed: boolean) {
    const p = this.pens.get(id);
    if (p) { p.count = count; p.canBreed = canBreed; this.dirty = true; }
  }

  /** Register a villager trader */
  registerTrader(villagerId: number, profession: string, pos: Vec3, trades: { buy: string; sell: string; count: number }[]) {
    this.traders.set(villagerId, { villagerId, profession, pos: { ...pos }, trades, lastTrade: null });
    this.dirty = true;
  }

  /** Record a villager trade */
  trade(villagerId: number) {
    const t = this.traders.get(villagerId);
    if (t) { t.lastTrade = Date.now(); this.dirty = true; }
  }

  /** Get plots ready for harvest */
  getReadyHarvests(): FarmPlot[] {
    return Array.from(this.plots.values()).filter((p) => p.ready);
  }

  /** Get pens ready for breeding */
  getReadyBreed(): AnimalPen[] {
    return Array.from(this.pens.values()).filter((p) => p.canBreed);
  }

  /** Get traders who haven't traded recently (cooldown reset) */
  getTradeReady(cooldownMs: number = 120_000): VillagerTrade[] {
    const now = Date.now();
    return Array.from(this.traders.values()).filter(
      (t) => !t.lastTrade || now - t.lastTrade > cooldownMs
    );
  }

  /** Get overall farm status */
  status(): FarmSuiteStatus {
    const plots = Array.from(this.plots.values());
    const pens = Array.from(this.pens.values());
    const traders = Array.from(this.traders.values());
    return {
      plots,
      pens,
      traders,
      totalCrops: plots.length,
      totalAnimals: pens.reduce((s, p) => s + p.count, 0),
      readyToHarvest: plots.filter((p) => p.ready).length,
    };
  }

  /** Find nearest crop plot of a type */
  nearestPlot(type: CropType, pos: Vec3): FarmPlot | null {
    let nearest: FarmPlot | null = null;
    let nearestD = Infinity;
    for (const p of this.plots.values()) {
      if (p.type !== type) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y, p.pos.z - pos.z);
      if (d < nearestD) { nearestD = d; nearest = p; }
    }
    return nearest;
  }

  /** Find nearest pen of a type */
  nearestPen(type: AnimalType, pos: Vec3): AnimalPen | null {
    let nearest: AnimalPen | null = null;
    let nearestD = Infinity;
    for (const p of this.pens.values()) {
      if (p.type !== type) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y, p.pos.z - pos.z);
      if (d < nearestD) { nearestD = d; nearest = p; }
    }
    return nearest;
  }

  shouldAutoHarvest(): boolean { return this.opts.autoHarvest; }
  shouldAutoBreed(): boolean { return this.opts.autoBreed; }
  shouldAutoTrade(): boolean { return this.opts.autoTrade; }
  getMinFoodLevel(): number { return this.opts.minFoodLevel; }
}

export function createFarmSuite(opts?: FarmSuiteOptions) {
  return new FarmSuite(opts);
}

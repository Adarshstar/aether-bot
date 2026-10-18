/**
 * Aether V9 — Phase 4: Economy & Trading
 *
 * Villager trade optimization, auto-sell/buy based on resource deficits,
 * and price tracking across trading sessions. Integrates with VeinTracker
 * to know what resources are abundant vs scarce.
 */

import type { Vec3 } from "../types";

interface TradeOffer {
  villagerId: number;
  profession: string;
  pos: Vec3;
  /** What you give */
  buy: { item: string; count: number };
  /** What you get */
  sell: { item: string; count: number };
  /** Max trades per day */
  maxUses?: number;
  /** Uses so far */
  uses: number;
  /** Last trade timestamp */
  lastTrade: number | null;
  /** Priority 1-10 (higher = trade first) */
  priority: number;
}

interface MarketPrice {
  item: string;
  /** Emeralds per unit */
  emeraldsPerUnit: number;
  /** Last observed */
  lastObserved: number;
  /** Trend: -1 = dropping, 0 = stable, 1 = rising */
  trend: number;
}

interface ResourceDeficit {
  item: string;
  /** How many needed */
  needed: number;
  /** Priority 1-10 */
  priority: number;
  /** Reason for deficit */
  reason: string;
}

interface EconomyOptions {
  /** Auto-trade when profitable (default false) */
  autoTrade?: boolean;
  /** Min emeralds to keep in reserve (default 16) */
  emeraldReserve?: number;
  /** Max trades per session (default 50) */
  maxTradesPerSession?: number;
}

export interface EconomyStatus {
  offers: TradeOffer[];
  prices: MarketPrice[];
  deficits: ResourceDeficit[];
  emeralds: number;
  tradesToday: number;
  recommendedTrade: TradeOffer | null;
}

export class Economy {
  private offers: Map<number, TradeOffer> = new Map();
  private prices: Map<string, MarketPrice> = new Map();
  private deficits: Map<string, ResourceDeficit> = new Map();
  private opts: Required<EconomyOptions>;
  private emeralds = 0;
  private tradesToday = 0;
  private dirty = false;

  constructor(opts: EconomyOptions = {}) {
    this.opts = {
      autoTrade: opts.autoTrade ?? false,
      emeraldReserve: opts.emeraldReserve ?? 16,
      maxTradesPerSession: opts.maxTradesPerSession ?? 50,
    };
  }

  /** Register a villager trade offer */
  registerOffer(offer: TradeOffer) {
    this.offers.set(offer.villagerId, { ...offer, uses: 0, lastTrade: null });
    this.dirty = true;
  }

  /** Record that a trade was executed */
  executeTrade(villagerId: number, item: string, emeraldsDelta: number) {
    const offer = this.offers.get(villagerId);
    if (offer) {
      offer.uses++;
      offer.lastTrade = Date.now();
    }
    this.emeralds += emeraldsDelta;
    this.tradesToday++;
    this._updatePrice(item, emeraldsDelta);
    this.dirty = true;
  }

  /** Update market price for an item */
  _updatePrice(item: string, emeraldsDelta: number) {
    const now = Date.now();
    const existing = this.prices.get(item);
    if (existing) {
      const delta = emeraldsDelta / 100; // normalize
      existing.emeraldsPerUnit = Math.max(0.1, existing.emeraldsPerUnit + delta * 0.1);
      existing.trend = delta > 0 ? 1 : delta < 0 ? -1 : 0;
      existing.lastObserved = now;
    } else {
      this.prices.set(item, { item, emeraldsPerUnit: 1, lastObserved: now, trend: 0 });
    }
  }

  /** Set emerald balance */
  setEmeralds(amount: number) {
    this.emeralds = amount;
    this.dirty = true;
  }

  /** Record a resource deficit (from build planner or survival) */
  recordDeficit(item: string, needed: number, priority: number, reason: string) {
    this.deficits.set(item, { item, needed, priority, reason });
    this.dirty = true;
  }

  /** Clear a deficit once fulfilled */
  clearDeficit(item: string) {
    this.deficits.delete(item);
    this.dirty = true;
  }

  /** Get recommended trade: highest priority offer we can afford */
  getRecommendedTrade(): TradeOffer | null {
    if (this.emeralds < this.opts.emeraldReserve) return null;
    if (this.tradesToday >= this.opts.maxTradesPerSession) return null;

    let best: TradeOffer | null = null;
    let bestScore = -1;
    for (const offer of this.offers.values()) {
      if (offer.lastTrade && Date.now() - offer.lastTrade < 120_000) continue; // cooldown
      if (offer.maxUses && offer.uses >= offer.maxUses) continue;
      // Score = priority * affordability
      const affordability = this.emeralds >= offer.buy.count ? 1 : 0.5;
      const score = offer.priority * affordability;
      if (score > bestScore) {
        bestScore = score;
        best = offer;
      }
    }
    return best;
  }

  /** Can we afford a trade? */
  canAfford(offer: TradeOffer): boolean {
    return this.emeralds >= Math.max(this.opts.emeraldReserve, offer.buy.count);
  }

  /** Get price for an item */
  getPrice(item: string): MarketPrice | null {
    return this.prices.get(item) ?? null;
  }

  /** Get all deficits sorted by priority */
  getDeficits(): ResourceDeficit[] {
    return Array.from(this.deficits.values()).sort((a, b) => b.priority - a.priority);
  }

  status(): EconomyStatus {
    return {
      offers: Array.from(this.offers.values()),
      prices: Array.from(this.prices.values()),
      deficits: this.getDeficits(),
      emeralds: this.emeralds,
      tradesToday: this.tradesToday,
      recommendedTrade: this.getRecommendedTrade(),
    };
  }

  getEmeralds(): number { return this.emeralds; }
  getTradesToday(): number { return this.tradesToday; }
  shouldAutoTrade(): boolean { return this.opts.autoTrade; }
}

export function createEconomy(opts?: EconomyOptions) {
  return new Economy(opts);
}

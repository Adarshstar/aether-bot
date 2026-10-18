/**
 * Modern Item model – inspired by prismarine-item, Bedrock-oriented
 */

export interface ItemData {
  networkId: number;
  name?: string;
  displayName?: string;
  stackSize?: number;
  maxDurability?: number;
}

export class Item {
  networkId: number;
  count: number;
  metadata: number;
  name: string;
  displayName: string;
  stackSize: number;
  maxDurability: number;
  stackId: number | null;
  nbt: any | null;
  durabilityUsed: number;

  private static nextId = 1;

  constructor(
    networkId: number,
    count = 1,
    metadata = 0,
    opts: Partial<ItemData> & { nbt?: any; stackId?: number | null; durabilityUsed?: number } = {}
  ) {
    this.networkId = networkId;
    this.count = count;
    this.metadata = metadata;
    this.name = opts.name ?? `item_${networkId}`;
    this.displayName = opts.displayName ?? this.name;
    this.stackSize = opts.stackSize ?? 64;
    this.maxDurability = opts.maxDurability ?? 0;
    this.stackId = opts.stackId !== undefined ? opts.stackId : Item.nextId++;
    this.nbt = opts.nbt ?? null;
    this.durabilityUsed = opts.durabilityUsed ?? 0;
  }

  get isAir() { return this.networkId === 0 || this.count <= 0; }

  clone(): Item {
    return new Item(this.networkId, this.count, this.metadata, {
      name: this.name,
      displayName: this.displayName,
      stackSize: this.stackSize,
      maxDurability: this.maxDurability,
      nbt: this.nbt,
      stackId: this.stackId,
      durabilityUsed: this.durabilityUsed,
    });
  }

  equals(other: Item | null, ignoreCount = false): boolean {
    if (!other) return false;
    return this.networkId === other.networkId &&
      this.metadata === other.metadata &&
      (ignoreCount || this.count === other.count);
  }

  toJSON() {
    return {
      networkId: this.networkId,
      count: this.count,
      metadata: this.metadata,
      name: this.name,
      stackId: this.stackId,
    };
  }

  static air() { return new Item(0, 0); }
}

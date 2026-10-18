/**
 * Simple but fast inventory tracker
 */

export interface Item {
  networkId: number;
  count: number;
  metadata?: number;
  name?: string;
  slot?: number;
}

export class Inventory {
  private slots: (Item | null)[] = new Array(36).fill(null);
  private hotbarSelected = 0;
  private armor: (Item | null)[] = new Array(4).fill(null);
  private offhand: Item | null = null;

  setSlot(slot: number, item: Item | null) {
    if (slot >= 0 && slot < this.slots.length) this.slots[slot] = item;
  }

  getSlot(slot: number): Item | null {
    return this.slots[slot] ?? null;
  }

  get hotbar(): (Item | null)[] {
    return this.slots.slice(0, 9);
  }

  get selectedSlot() { return this.hotbarSelected; }
  selectHotbar(slot: number) {
    if (slot >= 0 && slot < 9) this.hotbarSelected = slot;
  }

  get heldItem(): Item | null {
    return this.slots[this.hotbarSelected];
  }

  findItem(predicate: (item: Item) => boolean): { slot: number; item: Item } | null {
    for (let i = 0; i < this.slots.length; i++) {
      const it = this.slots[i];
      if (it && predicate(it)) return { slot: i, item: it };
    }
    return null;
  }

  count(networkId: number): number {
    let total = 0;
    for (const it of this.slots) {
      if (it && it.networkId === networkId) total += it.count;
    }
    return total;
  }

  clear() {
    this.slots.fill(null);
    this.armor.fill(null);
    this.offhand = null;
  }

  get items(): Item[] {
    return this.slots.filter((x): x is Item => x !== null);
  }
}

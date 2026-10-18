/**
 * Container / Window system — chests, crafting, furnace, player inventory
 */

import { Item } from "../item/Item";

export type WindowType =
  | "inventory"
  | "chest"
  | "double_chest"
  | "furnace"
  | "hopper"
  | "crafting"
  | "anvil"
  | "enchant"
  | "generic";

export class Window {
  readonly id: number;
  readonly type: WindowType;
  readonly title: string;
  readonly slots: (Item | null)[];
  private inventoryStart: number;

  constructor(
    id: number,
    type: WindowType,
    title: string,
    slotCount: number,
    inventoryStart?: number
  ) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.slots = new Array(slotCount).fill(null);
    this.inventoryStart = inventoryStart ?? Math.max(0, slotCount - 36);
  }

  get size() {
    return this.slots.length;
  }
  get containerSize() {
    return this.inventoryStart;
  }

  setSlot(slot: number, item: Item | null) {
    if (slot < 0 || slot >= this.slots.length) return;
    this.slots[slot] = item;
  }

  getSlot(slot: number): Item | null {
    return this.slots[slot] ?? null;
  }

  firstEmptyContainerSlot(): number {
    for (let i = 0; i < this.inventoryStart; i++) {
      if (!this.slots[i]) return i;
    }
    return -1;
  }

  count(networkId: number): number {
    let n = 0;
    for (const s of this.slots) {
      if (s && (s as any).networkId === networkId) n += (s as any).count ?? 1;
      else if (s && (s as any).type === networkId) n += (s as any).count ?? 1;
    }
    return n;
  }

  findInContainer(pred: (item: Item) => boolean): { slot: number; item: Item } | null {
    for (let i = 0; i < this.inventoryStart; i++) {
      const it = this.slots[i];
      if (it && pred(it)) return { slot: i, item: it };
    }
    return null;
  }

  /** Move item between container slot and player-inv region (local UI model) */
  clickSwap(a: number, b: number) {
    if (a < 0 || b < 0 || a >= this.slots.length || b >= this.slots.length) return;
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }
}

export class WindowManager {
  private windows = new Map<number, Window>();
  private activeId: number | null = null;
  private nextId = 1;

  get active(): Window | null {
    return this.activeId != null ? this.windows.get(this.activeId) ?? null : null;
  }

  open(type: WindowType, title: string, slotCount: number): Window {
    const id = this.nextId++;
    const invStart =
      type === "chest"
        ? 27
        : type === "double_chest"
          ? 54
          : type === "furnace"
            ? 3
            : type === "crafting"
              ? 10
              : Math.max(0, slotCount - 36);
    const w = new Window(id, type, title, slotCount, invStart);
    this.windows.set(id, w);
    this.activeId = id;
    return w;
  }

  openChest(title = "Chest", double = false): Window {
    return this.open(double ? "double_chest" : "chest", title, double ? 90 : 63);
  }

  openCrafting(title = "Crafting"): Window {
    return this.open("crafting", title, 46);
  }

  openFurnace(title = "Furnace"): Window {
    return this.open("furnace", title, 39);
  }

  close(id?: number) {
    const target = id ?? this.activeId;
    if (target == null) return;
    this.windows.delete(target);
    if (this.activeId === target) this.activeId = null;
  }

  get(id: number) {
    return this.windows.get(id);
  }
}

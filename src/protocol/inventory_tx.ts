/**
 * Full InventoryTransaction body structures (Protocol 2193)
 */

import { BinaryWriter } from "./binary";
import { PacketId } from "./packets";

export enum InventoryTransactionType {
  Normal = 0,
  MisMatch = 1,
  UseItem = 2,
  UseItemOnEntity = 3,
  ReleaseItem = 4,
}

export enum InventoryActionSource {
  Container = 0,
  World = 2,
  Creative = 3,
  TODO = 99999,
}

export interface ItemStack {
  networkId: number;
  count: number;
  metadata?: number;
  blockRuntimeId?: number;
  extra?: Buffer;
}

export interface InventoryAction {
  sourceType: number;
  windowId?: number;
  sourceFlags?: number;
  inventorySlot: number;
  oldItem: ItemStack;
  newItem: ItemStack;
}

function writeItem(w: BinaryWriter, item: ItemStack) {
  w.writeVarInt(item.networkId);
  if (item.networkId === 0) return; // air
  w.writeU16(item.count);
  w.writeVarInt(item.metadata ?? 0);
  w.writeVarInt(item.blockRuntimeId ?? 0);
  const extra = item.extra ?? Buffer.alloc(0);
  w.writeU16(extra.length);
  if (extra.length) {
    // canPlaceOn / canDestroy counts = 0 for simple items
    w.writeU32(0); // has nbt?
    // simplified
  }
}

function writeAction(w: BinaryWriter, a: InventoryAction) {
  w.writeVarInt(a.sourceType);
  if (a.sourceType === InventoryActionSource.Container) {
    w.writeVarInt(a.windowId ?? 0);
  } else if (a.sourceType === InventoryActionSource.World) {
    w.writeVarInt(a.sourceFlags ?? 0);
  } else if (a.sourceType === InventoryActionSource.Creative) {
    // none
  } else {
    w.writeVarInt(a.windowId ?? 0);
  }
  w.writeVarInt(a.inventorySlot);
  writeItem(w, a.oldItem);
  writeItem(w, a.newItem);
}

export function encodeInventoryTransaction(opts: {
  legacyRequestId?: number;
  transactionType: InventoryTransactionType;
  actions: InventoryAction[];
  /** UseItem */
  actionType?: number;
  triggerType?: number;
  blockPos?: { x: number; y: number; z: number };
  face?: number;
  hotbarSlot?: number;
  itemInHand?: ItemStack;
  playerPos?: { x: number; y: number; z: number };
  clickPos?: { x: number; y: number; z: number };
  blockRuntimeId?: number;
  /** UseItemOnEntity */
  entityRuntimeId?: bigint;
}): Buffer {
  const w = new BinaryWriter();
  w.writeVarInt(opts.legacyRequestId ?? 0);
  // legacy request changed slots – empty
  if ((opts.legacyRequestId ?? 0) !== 0) {
    w.writeVarInt(0);
  }
  w.writeVarInt(opts.transactionType);
  w.writeVarInt(opts.actions.length);
  for (const a of opts.actions) writeAction(w, a);

  switch (opts.transactionType) {
    case InventoryTransactionType.UseItem:
      w.writeVarInt(opts.actionType ?? 0);
      w.writeVarInt(opts.triggerType ?? 0);
      w.writeVarInt(opts.blockPos?.x ?? 0);
      w.writeVarInt(opts.blockPos?.y ?? 0);
      w.writeVarInt(opts.blockPos?.z ?? 0);
      w.writeVarInt(opts.face ?? 0);
      w.writeVarInt(opts.hotbarSlot ?? 0);
      writeItem(w, opts.itemInHand ?? { networkId: 0, count: 0 });
      w.writeVec3f(opts.playerPos?.x ?? 0, opts.playerPos?.y ?? 0, opts.playerPos?.z ?? 0);
      w.writeVec3f(opts.clickPos?.x ?? 0, opts.clickPos?.y ?? 0, opts.clickPos?.z ?? 0);
      w.writeVarInt(opts.blockRuntimeId ?? 0);
      w.writeVarInt(0); // client prediction
      break;
    case InventoryTransactionType.UseItemOnEntity:
      w.writeVarLong(opts.entityRuntimeId ?? 0n);
      w.writeVarInt(opts.actionType ?? 1); // attack
      w.writeVarInt(opts.hotbarSlot ?? 0);
      writeItem(w, opts.itemInHand ?? { networkId: 0, count: 0 });
      w.writeVec3f(opts.playerPos?.x ?? 0, opts.playerPos?.y ?? 0, opts.playerPos?.z ?? 0);
      w.writeVec3f(opts.clickPos?.x ?? 0, opts.clickPos?.y ?? 0, opts.clickPos?.z ?? 0);
      break;
    case InventoryTransactionType.ReleaseItem:
      w.writeVarInt(opts.actionType ?? 0);
      w.writeVarInt(opts.hotbarSlot ?? 0);
      writeItem(w, opts.itemInHand ?? { networkId: 0, count: 0 });
      w.writeVec3f(opts.playerPos?.x ?? 0, opts.playerPos?.y ?? 0, opts.playerPos?.z ?? 0);
      break;
    default:
      break;
  }

  return w.toBuffer();
}

export function buildAttackEntityPacket(opts: {
  entityRuntimeId: bigint;
  hotbarSlot?: number;
  itemInHand?: ItemStack;
  playerPos: { x: number; y: number; z: number };
}): { id: number; payload: Buffer } {
  const payload = encodeInventoryTransaction({
    transactionType: InventoryTransactionType.UseItemOnEntity,
    actions: [],
    entityRuntimeId: opts.entityRuntimeId,
    actionType: 1,
    hotbarSlot: opts.hotbarSlot ?? 0,
    itemInHand: opts.itemInHand,
    playerPos: opts.playerPos,
    clickPos: opts.playerPos,
  });
  return { id: PacketId.InventoryTransaction, payload };
}

/** UseItem actionType: 0 = click block, 1 = click air / consume (eat, potion, …) */
export const UseItemAction = {
  ClickBlock: 0,
  ClickAir: 1,
} as const;

/**
 * InventoryTransaction UseItem for eating / activating held item in air.
 * BDS 1.26.52.3 — transaction type UseItem (2), actionType ClickAir (1).
 */
export function buildUseItemPacket(opts: {
  hotbarSlot?: number;
  itemInHand: ItemStack;
  playerPos: { x: number; y: number; z: number };
  actionType?: number;
}): { id: number; payload: Buffer } {
  const payload = encodeInventoryTransaction({
    transactionType: InventoryTransactionType.UseItem,
    actions: [],
    actionType: opts.actionType ?? UseItemAction.ClickAir,
    triggerType: 0,
    blockPos: { x: 0, y: 0, z: 0 },
    face: 0xff,
    hotbarSlot: opts.hotbarSlot ?? 0,
    itemInHand: opts.itemInHand,
    playerPos: opts.playerPos,
    clickPos: opts.playerPos,
    blockRuntimeId: 0,
  });
  return { id: PacketId.InventoryTransaction, payload };
}

/** ReleaseItem — finish consuming. actionType 0 = release. */
export function buildReleaseItemPacket(opts: {
  hotbarSlot?: number;
  itemInHand: ItemStack;
  playerPos: { x: number; y: number; z: number };
  actionType?: number;
}): { id: number; payload: Buffer } {
  const payload = encodeInventoryTransaction({
    transactionType: InventoryTransactionType.ReleaseItem,
    actions: [],
    actionType: opts.actionType ?? 0,
    hotbarSlot: opts.hotbarSlot ?? 0,
    itemInHand: opts.itemInHand,
    playerPos: opts.playerPos,
  });
  return { id: PacketId.InventoryTransaction, payload };
}

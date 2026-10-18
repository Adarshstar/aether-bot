/**
 * Network item stack (InventoryContent / InventorySlot / MobEquipment)
 * Protocol 2193 simplified network instance:
 *   signed varint networkId; 0 = empty
 *   u16 count
 *   varint metadata
 *   u8 hasNetId  + optional varint netId (server authoritative)
 *   varint blockRuntimeId
 *   byte-array extra (NBT / canPlace / canDestroy) — stored raw
 */

import { BinaryReader, BinaryWriter } from "./binary";

export interface NetworkItem {
  networkId: number;
  count: number;
  metadata?: number;
  blockRuntimeId?: number;
  netId?: number;
  extra?: Buffer;
  name?: string;
  slot?: number;
}

export function encodeNetworkItem(item: NetworkItem | null | undefined): Buffer {
  const w = new BinaryWriter();
  if (!item || !item.networkId) {
    w.writeZigZag32(0);
    return w.toBuffer();
  }
  w.writeZigZag32(item.networkId);
  w.writeU16(item.count ?? 1);
  w.writeVarInt(item.metadata ?? 0);
  if (item.netId != null) {
    w.writeU8(1);
    w.writeZigZag32(item.netId);
  } else {
    w.writeU8(0);
  }
  w.writeZigZag32(item.blockRuntimeId ?? 0);
  const extra = item.extra ?? Buffer.alloc(0);
  w.writeVarInt(extra.length);
  if (extra.length) w.writeRaw(extra);
  return w.toBuffer();
}

export function decodeNetworkItem(r: BinaryReader): NetworkItem | null {
  if (r.remaining <= 0) return null;
  const networkId = r.readZigZag32();
  if (networkId === 0) return null;
  const count = r.remaining >= 2 ? r.readU16() : 1;
  const metadata = r.remaining ? r.readVarInt() : 0;
  let netId: number | undefined;
  if (r.remaining) {
    const hasNet = r.readU8();
    if (hasNet && r.remaining) netId = r.readZigZag32();
  }
  const blockRuntimeId = r.remaining ? r.readZigZag32() : 0;
  let extra: Buffer | undefined;
  if (r.remaining) {
    const n = r.readVarInt();
    extra = n > 0 && n <= r.remaining ? r.readBuffer(n) : undefined;
  }
  return { networkId, count, metadata, netId, blockRuntimeId, extra };
}

export function encodeItemList(items: Array<NetworkItem | null>): Buffer {
  const w = new BinaryWriter();
  w.writeVarInt(items.length);
  const parts = [w.toBuffer()];
  for (const it of items) parts.push(encodeNetworkItem(it));
  return Buffer.concat(parts);
}

export function decodeItemList(r: BinaryReader): Array<NetworkItem | null> {
  const n = r.remaining ? r.readVarInt() : 0;
  const out: Array<NetworkItem | null> = [];
  for (let i = 0; i < n && r.remaining > 0; i++) {
    out.push(decodeNetworkItem(r));
  }
  return out;
}

/** Container / window ids used by InventoryContent */
export const ContainerId = {
  Inventory: 0,
  Offhand: 119,
  Armor: 120,
  Creative: 121,
  Hotbar: 122,
  FixedInventory: 123,
  Cursor: 124,
} as const;

import { describe, test, expect } from "bun:test";
import {
  encodeGamePacket, decodeGamePacket, PacketId,
  encodeNetworkItem, ContainerId, Inventory,
} from "../index";
import { BinaryReader } from "../src/protocol/binary";
import { decodeNetworkItem } from "../src/protocol/itemStack";

describe("Network item", () => {
  test("empty is zigzag 0", () => {
    const buf = encodeNetworkItem(null);
    expect(decodeNetworkItem(new BinaryReader(buf))).toBeNull();
  });

  test("diamond stack roundtrip", () => {
    const buf = encodeNetworkItem({ networkId: 264, count: 12, metadata: 0 });
    const item = decodeNetworkItem(new BinaryReader(buf));
    expect(item?.networkId).toBe(264);
    expect(item?.count).toBe(12);
  });
});

describe("InventoryContent packet", () => {
  test("hotbar slots populate Inventory", () => {
    const items = [
      { networkId: 1, count: 64 },
      { networkId: 264, count: 3 },
      null,
    ];
    const f = encodeGamePacket(PacketId.InventoryContent, {
      windowId: ContainerId.Inventory,
      items,
    });
    const { data } = decodeGamePacket(f);
    expect(data.windowId).toBe(0);
    expect(data.items[0].networkId).toBe(1);
    expect(data.items[1].count).toBe(3);
    expect(data.items[2]).toBeNull();

    const inv = new Inventory();
    data.items.forEach((it: any, slot: number) => {
      inv.setSlot(slot, it ? { networkId: it.networkId, count: it.count, slot } : null);
    });
    expect(inv.heldItem?.networkId).toBe(1);
    expect(inv.count(264)).toBe(3);
  });

  test("InventorySlot", () => {
    const f = encodeGamePacket(PacketId.InventorySlot, {
      windowId: 0, slot: 8, item: { networkId: 50, count: 16 },
    });
    const { data } = decodeGamePacket(f);
    expect(data.slot).toBe(8);
    expect(data.item.networkId).toBe(50);
  });
});

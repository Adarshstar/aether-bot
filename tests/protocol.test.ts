import { describe, test, expect } from "bun:test";
import { BinaryWriter, BinaryReader, encodePacket, decodePacketHeader } from "../src/protocol/binary";
import { encodeInventoryTransaction, InventoryTransactionType } from "../src/protocol/inventory_tx";
import { XboxAuth } from "../src/auth/XboxAuth";

describe("Binary codec", () => {
  test("varint roundtrip", () => {
    const w = new BinaryWriter();
    w.writeVarInt(0);
    w.writeVarInt(127);
    w.writeVarInt(128);
    w.writeVarInt(300);
    const r = new BinaryReader(w.toBuffer());
    expect(r.readVarInt()).toBe(0);
    expect(r.readVarInt()).toBe(127);
    expect(r.readVarInt()).toBe(128);
    expect(r.readVarInt()).toBe(300);
  });

  test("string roundtrip", () => {
    const w = new BinaryWriter();
    w.writeString("Bedrock");
    const r = new BinaryReader(w.toBuffer());
    expect(r.readString()).toBe("Bedrock");
  });

  test("packet frame", () => {
    const payload = Buffer.from([1, 2, 3]);
    const framed = encodePacket(0x09, payload);
    const { id, payload: p } = decodePacketHeader(framed);
    expect(id).toBe(0x09);
    expect([...p]).toEqual([1, 2, 3]);
  });
});

describe("Inventory transaction", () => {
  test("encodes attack body", () => {
    const buf = encodeInventoryTransaction({
      transactionType: InventoryTransactionType.UseItemOnEntity,
      actions: [],
      entityRuntimeId: 42n,
      actionType: 1,
      playerPos: { x: 1, y: 2, z: 3 },
      clickPos: { x: 1, y: 2, z: 3 },
    });
    expect(buf.length).toBeGreaterThan(8);
  });
});

describe("XboxAuth offline", () => {
  test("offline auth", async () => {
    const auth = new XboxAuth({ username: "Test", offline: true });
    const r = await auth.authenticate();
    expect(r.offline).toBe(true);
    expect(r.username).toBe("Test");
  });
});

import { describe, test, expect } from "bun:test";
import { createBot, PacketId, encodeGamePacket, decodeGamePacket } from "../index";
import { NetherNetTransport } from "../src/transport/nethernet";

describe("NetherNet signaling API", () => {
  test("constructs with host/port", () => {
    const t = new NetherNetTransport({ host: "127.0.0.1", port: 19132 });
    expect(t.isConnected).toBe(false);
  });
});

describe("BDS session path on bot", () => {
  test("bot exposes session after construct", () => {
    const bot = createBot({ host: "127.0.0.1", username: "Sess", offline: true });
    expect(bot.session).toBeNull(); // until connect
  });
});

describe("PlayerAuthInput packet", () => {
  test("encodes movement fields", () => {
    const f = encodeGamePacket(PacketId.PlayerAuthInput, {
      pitch: 0.1,
      yaw: 1.5,
      position: { x: 1, y: 64, z: 2 },
      moveVecX: 0,
      moveVecZ: 1,
      tick: 10,
    });
    const { id, data } = decodeGamePacket(f);
    expect(id).toBe(PacketId.PlayerAuthInput);
    expect(data.position.y).toBeCloseTo(64, 0);
  });
});

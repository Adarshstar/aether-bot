import { describe, test, expect } from "bun:test";
import {
  PacketId, encodeGamePacket, decodeGamePacket, getRegisteredCodecIds,
  hasCodec, getCodecCoverage,
} from "../index";

describe("Full codec coverage", () => {
  test("every PacketId has a codec", () => {
    const ids = Object.values(PacketId).filter((v) => typeof v === "number") as number[];
    expect(ids.length).toBeGreaterThan(50);
    for (const id of ids) {
      expect(hasCodec(id)).toBe(true);
    }
    const cov = getCodecCoverage();
    expect(cov.total).toBeGreaterThanOrEqual(ids.length);
  });

  test("play status roundtrip", () => {
    const f = encodeGamePacket(PacketId.PlayStatus, { status: "player_spawn" });
    const { data } = decodeGamePacket(f);
    expect(data.status).toBe(3);
  });

  test("start game encode", () => {
    const f = encodeGamePacket(PacketId.StartGame, {
      runtimeEntityId: 1,
      gamemode: 0,
      spawn: { x: 1, y: 64, z: 2 },
    });
    expect(f.length).toBeGreaterThan(8);
    const { id } = decodeGamePacket(f);
    expect(id).toBe(PacketId.StartGame);
  });

  test("update block roundtrip", () => {
    const f = encodeGamePacket(PacketId.UpdateBlock, {
      position: { x: 1, y: 2, z: 3 },
      blockRuntimeId: 1,
      flags: 0,
    });
    const { data } = decodeGamePacket(f);
    expect(data.position.x).toBe(1);
    expect(data.blockRuntimeId).toBe(1);
  });

  test("player action encode", () => {
    const f = encodeGamePacket(PacketId.PlayerAction, {
      runtimeEntityId: 1,
      action: 0,
      position: { x: 0, y: 64, z: 0 },
    });
    expect(f.length).toBeGreaterThan(5);
  });
});

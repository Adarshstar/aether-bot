import { describe, test, expect } from "bun:test";
import {
  InputFlag, encodeBitset, decodeBitset, flagsFromControls,
  moveVectorFromControls, PLAYER_AUTH_INPUT_BITS,
  encodeGamePacket, decodeGamePacket, PacketId,
} from "../index";

describe("PlayerAuthInput bitset", () => {
  test("fixed width is 10 bytes for 67 flags", () => {
    const buf = encodeBitset(0n);
    expect(buf.length).toBe(Math.ceil(PLAYER_AUTH_INPUT_BITS / 7));
    expect(buf.length).toBe(10);
  });

  test("sprint/sneak/jump bits roundtrip", () => {
    let bits = 0n;
    bits |= 1n << BigInt(InputFlag.Sprinting);
    bits |= 1n << BigInt(InputFlag.Sneaking);
    bits |= 1n << BigInt(InputFlag.Jumping);
    const { value } = decodeBitset(encodeBitset(bits));
    expect((value >> BigInt(InputFlag.Sprinting)) & 1n).toBe(1n);
    expect((value >> BigInt(InputFlag.Sneaking)) & 1n).toBe(1n);
    expect((value >> BigInt(InputFlag.Jumping)) & 1n).toBe(1n);
    expect((value >> BigInt(InputFlag.StartFlying)) & 1n).toBe(0n);
  });

  test("controls map to Up + Sprinting", () => {
    const bits = flagsFromControls({ forward: true, sprint: true });
    expect((bits >> BigInt(InputFlag.Up)) & 1n).toBe(1n);
    expect((bits >> BigInt(InputFlag.Sprinting)) & 1n).toBe(1n);
    const v = moveVectorFromControls({ forward: true, sprint: true });
    expect(v.z).toBe(1);
    expect(v.x).toBe(0);
  });

  test("packet roundtrip preserves flags and tick", () => {
    const bits = flagsFromControls({ forward: true, jump: true, sneak: true });
    const f = encodeGamePacket(PacketId.PlayerAuthInput, {
      pitch: 0.25,
      yaw: 1.2,
      position: { x: 10, y: 64, z: -4 },
      moveVecX: 0,
      moveVecZ: 1,
      inputData: bits,
      tick: 42,
    });
    const { data } = decodeGamePacket(f);
    expect(data.position.y).toBeCloseTo(64, 4);
    expect(data.tick).toBe(42);
    expect(typeof data.inputData === "bigint" || typeof data.inputData === "number").toBe(true);
    const v = typeof data.inputData === "bigint" ? data.inputData : BigInt(data.inputData);
    expect((v >> BigInt(InputFlag.Up)) & 1n).toBe(1n);
    expect((v >> BigInt(InputFlag.Jumping)) & 1n).toBe(1n);
    expect((v >> BigInt(InputFlag.Sneaking)) & 1n).toBe(1n);
  });
});

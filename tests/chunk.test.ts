import { describe, test, expect } from "bun:test";
import {
  encodePalettedStorage, decodePalettedStorage,
  encodeSubChunk, decodeSubChunk,
  makeFlatChunk, applyLevelChunkToWorld,
  encodeLevelChunkBody, decodeLevelChunkBody,
  encodeGamePacket, decodeGamePacket, PacketId,
  World,
} from "../index";
import { BinaryReader as BR } from "../src/protocol/binary";

describe("Paletted storage", () => {
  test("single-value air roundtrip", () => {
    const ids = new Uint32Array(4096);
    const buf = encodePalettedStorage(ids);
    const out = decodePalettedStorage(new BR(buf));
    expect(out[0]).toBe(0);
    expect(out[4095]).toBe(0);
  });

  test("mixed palette roundtrip", () => {
    const ids = new Uint32Array(4096);
    for (let i = 0; i < 4096; i++) ids[i] = i % 3 === 0 ? 1 : (i % 3 === 1 ? 2 : 0);
    const buf = encodePalettedStorage(ids);
    const out = decodePalettedStorage(new BR(buf));
    expect([...out.slice(0, 16)]).toEqual([...ids.slice(0, 16)]);
    expect(out[100]).toBe(ids[100]);
  });
});

describe("Subchunk v9", () => {
  test("roundtrip yIndex and blocks", () => {
    const blocks = new Uint32Array(4096);
    blocks[0] = 1;
    blocks[1] = 2;
    const encoded = encodeSubChunk({ yIndex: -4, version: 9, blocks });
    const decoded = decodeSubChunk(new BR(encoded));
    expect(decoded?.yIndex).toBe(-4);
    expect(decoded?.blocks[0]).toBe(1);
    expect(decoded?.blocks[1]).toBe(2);
  });
});

describe("LevelChunk", () => {
  test("flat chunk paints grass at y=63", () => {
    const world = new World();
    const flat = makeFlatChunk(2, -3);
    applyLevelChunkToWorld(world, flat);
    expect(world.getBlock(32, 63, -48)).toBe(2);
    expect(world.getBlock(32, 60, -48)).toBe(1);
    expect(world.getBlock(32, 70, -48)).toBe(0);
    expect(world.loadedColumns).toBe(1);
  });

  test("packet codec roundtrip coords", () => {
    const payload = makeFlatChunk(4, 5).payload;
    const f = encodeGamePacket(PacketId.LevelChunk, {
      x: 4, z: 5, dimension: 0, subChunkCount: 24, payload,
    });
    const { id, data } = decodeGamePacket(f);
    expect(id).toBe(PacketId.LevelChunk);
    expect(data.x).toBe(4);
    expect(data.z).toBe(5);
    expect(data.subchunks.length).toBeGreaterThan(0);
  });

  test("negative chunk coords zigzag", () => {
    const body = encodeLevelChunkBody({ x: -12, z: -8, dimension: 0, subChunkCount: 0 });
    const d = decodeLevelChunkBody(body);
    expect(d.x).toBe(-12);
    expect(d.z).toBe(-8);
  });
});

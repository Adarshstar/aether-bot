import { describe, test, expect } from "bun:test";
import {
  encodeSubChunkRequest, decodeSubChunkRequest,
  encodeSubChunkPacket, decodeSubChunkPacket,
  buildColumnRequest, applySubChunkPacketToWorld,
  SubChunkRequestMode, SubChunkResult, HeightMapType,
  encodeGamePacket, decodeGamePacket, PacketId,
  encodeSubChunk, World, encodeLevelChunkBody, decodeLevelChunkBody,
} from "../index";

describe("SubChunkRequest", () => {
  test("column request covers overworld Y range", () => {
    const req = buildColumnRequest(3, -2);
    expect(req.origin).toEqual({ x: 3, y: 0, z: -2 });
    expect(req.offsets[0]).toEqual({ x: 0, y: -4, z: 0 });
    expect(req.offsets.at(-1)).toEqual({ x: 0, y: 19, z: 0 });
    expect(req.offsets).toHaveLength(24);
  });

  test("negative origin and offsets roundtrip", () => {
    const body = encodeSubChunkRequest({
      dimension: 0,
      origin: { x: -8, y: 0, z: 12 },
      offsets: [{ x: 0, y: -4, z: 0 }, { x: 1, y: 2, z: -1 }],
    });
    const d = decodeSubChunkRequest(body);
    expect(d.origin.x).toBe(-8);
    expect(d.origin.z).toBe(12);
    expect(d.offsets[0].y).toBe(-4);
    expect(d.offsets[1]).toEqual({ x: 1, y: 2, z: -1 });
  });

  test("packet codec", () => {
    const f = encodeGamePacket(PacketId.SubChunkRequest, buildColumnRequest(1, 1));
    const { id, data } = decodeGamePacket(f);
    expect(id).toBe(PacketId.SubChunkRequest);
    expect(data.offsets.length).toBe(24);
    expect(data.origin.x).toBe(1);
  });
});

describe("SubChunk response", () => {
  test("success entry paints world", () => {
    const blocks = new Uint32Array(4096);
    blocks[0] = 1;
    const payload = encodeSubChunk({ yIndex: 4, version: 9, blocks });
    const pkt = encodeSubChunkPacket({
      cacheEnabled: false,
      dimension: 0,
      origin: { x: 2, y: 0, z: 3 },
      entries: [{
        offset: { x: 0, y: 4, z: 0 },
        result: SubChunkResult.Success,
        payload,
        heightMapType: HeightMapType.None,
        renderHeightMapType: HeightMapType.AllCopied,
      }],
    });
    const decoded = decodeSubChunkPacket(pkt);
    expect(decoded.entries).toHaveLength(1);
    expect(decoded.entries[0].offset.y).toBe(4);
    const world = new World();
    const painted = applySubChunkPacketToWorld(world, decoded);
    expect(painted).toBeGreaterThan(0);
    expect(world.getBlock(32, 64, 48)).toBe(1);
  });

  test("all-air + cache skips payload", () => {
    const pkt = encodeSubChunkPacket({
      cacheEnabled: true,
      dimension: 0,
      origin: { x: 0, y: 0, z: 0 },
      entries: [{
        offset: { x: 0, y: 0, z: 0 },
        result: SubChunkResult.SuccessAllAir,
        payload: Buffer.alloc(0),
        heightMapType: HeightMapType.None,
        renderHeightMapType: HeightMapType.AllCopied,
        blobHash: 99n,
      }],
    });
    const d = decodeSubChunkPacket(pkt);
    expect(d.entries[0].result).toBe(SubChunkResult.SuccessAllAir);
    expect(d.entries[0].blobHash).toBe(99n);
  });
});

describe("LevelChunk request mode", () => {
  test("limitless count is 0xFFFFFFFF", () => {
    const body = encodeLevelChunkBody({
      x: 4, z: 5, dimension: 0, subChunkCount: SubChunkRequestMode.Limitless,
    });
    const d = decodeLevelChunkBody(body);
    expect(d.requestMode).toBe(true);
    expect(d.subChunkCount).toBe(SubChunkRequestMode.Limitless);
    expect(d.subchunks).toHaveLength(0);
  });

  test("limited mode carries highestSubChunk", () => {
    const body = encodeLevelChunkBody({
      x: 0, z: 0, subChunkCount: SubChunkRequestMode.Limited, highestSubChunk: 12,
    });
    const d = decodeLevelChunkBody(body);
    expect(d.requestMode).toBe(true);
    expect(d.highestSubChunk).toBe(12);
  });
});

/**
 * SubChunkRequest (0xAF) + SubChunk (0xAE) — protocol 2193
 *
 * Layout matches PocketMine BedrockProtocol (vanilla BDS):
 *   Request:  zigzag32 dimension, varuint count, i8 triples, i32LE origin xyz
 *   Response: bool cache, zigzag32 dimension, zigzag32 origin xyz,
 *             u32LE count, then entries
 *
 * LevelChunk subChunkCount 0xFFFFFFFF = limitless request mode
 *                        0xFFFFFFFE = limited (HighestSubChunk u16 follows)
 */

import { BinaryReader, BinaryWriter } from "./binary";
import { decodeSubChunk } from "../world/levelChunk";
import type { World } from "../world/World";

export const SubChunkRequestMode = {
  Limitless: 0xffffffff,
  Limited: 0xfffffffe,
} as const;

export const SubChunkResult = {
  Undefined: 0,
  Success: 1,
  ChunkNotFound: 2,
  InvalidDimension: 3,
  PlayerNotFound: 4,
  IndexOutOfBounds: 5,
  SuccessAllAir: 6,
} as const;

export const HeightMapType = {
  None: 0,
  HasData: 1,
  TooHigh: 2,
  TooLow: 3,
  AllCopied: 4,
} as const;

export interface SubChunkOffset {
  x: number;
  y: number;
  z: number;
}

export interface SubChunkPos {
  x: number;
  y: number;
  z: number;
}

export interface SubChunkRequestBody {
  dimension: number;
  origin: SubChunkPos;
  offsets: SubChunkOffset[];
}

export interface SubChunkEntry {
  offset: SubChunkOffset;
  result: number;
  payload: Buffer;
  heightMapType: number;
  heightMap?: Buffer;
  renderHeightMapType: number;
  renderHeightMap?: Buffer;
  blobHash?: bigint;
}

export interface SubChunkBody {
  cacheEnabled: boolean;
  dimension: number;
  origin: SubChunkPos;
  entries: SubChunkEntry[];
}

function writeI8(w: BinaryWriter, n: number) {
  w.writeU8(n & 0xff);
}

function readI8(r: BinaryReader): number {
  const v = r.readU8();
  return v > 127 ? v - 256 : v;
}

function writeOffset(w: BinaryWriter, o: SubChunkOffset) {
  writeI8(w, o.x);
  writeI8(w, o.y);
  writeI8(w, o.z);
}

function readOffset(r: BinaryReader): SubChunkOffset {
  return { x: readI8(r), y: readI8(r), z: readI8(r) };
}

export function encodeSubChunkRequest(data: SubChunkRequestBody): Buffer {
  const w = new BinaryWriter();
  w.writeZigZag32(data.dimension ?? 0);
  const offsets = data.offsets ?? [];
  w.writeVarInt(offsets.length);
  for (const o of offsets) writeOffset(w, o);
  w.writeI32(data.origin?.x ?? 0);
  w.writeI32(data.origin?.y ?? 0);
  w.writeI32(data.origin?.z ?? 0);
  return w.toBuffer();
}

export function decodeSubChunkRequest(buf: Buffer): SubChunkRequestBody {
  const r = new BinaryReader(buf);
  const dimension = r.readZigZag32();
  const n = r.readVarInt();
  const offsets: SubChunkOffset[] = [];
  for (let i = 0; i < n && r.remaining >= 3; i++) offsets.push(readOffset(r));
  const origin: SubChunkPos = {
    x: r.remaining >= 4 ? r.readI32() : 0,
    y: r.remaining >= 4 ? r.readI32() : 0,
    z: r.remaining >= 4 ? r.readI32() : 0,
  };
  return { dimension, origin, offsets };
}

function writeHeightMap(w: BinaryWriter, type: number, data?: Buffer) {
  w.writeU8(type);
  if (type === HeightMapType.HasData) {
    w.writeRaw(data && data.length >= 256 ? data.subarray(0, 256) : Buffer.alloc(256));
  }
}

function readHeightMap(r: BinaryReader): { type: number; data?: Buffer } {
  if (!r.remaining) return { type: HeightMapType.None };
  const type = r.readU8();
  if (type === HeightMapType.HasData && r.remaining >= 256) {
    return { type, data: r.readBuffer(256) };
  }
  return { type };
}

function writeEntry(w: BinaryWriter, e: SubChunkEntry, cacheEnabled: boolean) {
  writeOffset(w, e.offset);
  w.writeU8(e.result);
  const skipPayload = cacheEnabled && e.result === SubChunkResult.SuccessAllAir;
  if (!skipPayload) w.writeBuffer(e.payload ?? Buffer.alloc(0));
  writeHeightMap(w, e.heightMapType ?? HeightMapType.None, e.heightMap);
  writeHeightMap(w, e.renderHeightMapType ?? HeightMapType.AllCopied, e.renderHeightMap);
  if (cacheEnabled) w.writeI64(e.blobHash ?? 0n);
}

function readEntry(r: BinaryReader, cacheEnabled: boolean): SubChunkEntry {
  const offset = readOffset(r);
  const result = r.remaining ? r.readU8() : 0;
  const skipPayload = cacheEnabled && result === SubChunkResult.SuccessAllAir;
  let payload = Buffer.alloc(0);
  if (!skipPayload && r.remaining) {
    try {
      payload = Buffer.from(r.readBuffer());
    } catch {
      payload = Buffer.alloc(0);
    }
  }
  const hm = readHeightMap(r);
  const rhm = readHeightMap(r);
  let blobHash: bigint | undefined;
  if (cacheEnabled && r.remaining >= 8) blobHash = r.readI64();
  return {
    offset,
    result,
    payload,
    heightMapType: hm.type,
    heightMap: hm.data,
    renderHeightMapType: rhm.type,
    renderHeightMap: rhm.data,
    blobHash,
  };
}

export function encodeSubChunkPacket(data: SubChunkBody): Buffer {
  const w = new BinaryWriter();
  w.writeBool(!!data.cacheEnabled);
  w.writeZigZag32(data.dimension ?? 0);
  w.writeZigZag32(data.origin?.x ?? 0);
  w.writeZigZag32(data.origin?.y ?? 0);
  w.writeZigZag32(data.origin?.z ?? 0);
  const entries = data.entries ?? [];
  w.writeU32(entries.length);
  for (const e of entries) writeEntry(w, e, !!data.cacheEnabled);
  return w.toBuffer();
}

export function decodeSubChunkPacket(buf: Buffer): SubChunkBody {
  const r = new BinaryReader(buf);
  const cacheEnabled = r.remaining ? r.readBool() : false;
  const dimension = r.remaining ? r.readZigZag32() : 0;
  const origin: SubChunkPos = {
    x: r.remaining ? r.readZigZag32() : 0,
    y: r.remaining ? r.readZigZag32() : 0,
    z: r.remaining ? r.readZigZag32() : 0,
  };
  const n = r.remaining >= 4 ? r.readU32() : 0;
  const entries: SubChunkEntry[] = [];
  for (let i = 0; i < n && r.remaining > 0; i++) {
    entries.push(readEntry(r, cacheEnabled));
  }
  return { cacheEnabled, dimension, origin, entries };
}

/** Offsets covering one column (overworld default Y -64…319 → indices -4…19). */
export function columnOffsets(minIndex = -4, maxIndex = 19): SubChunkOffset[] {
  const out: SubChunkOffset[] = [];
  for (let y = minIndex; y <= maxIndex; y++) out.push({ x: 0, y, z: 0 });
  return out;
}

export function buildColumnRequest(
  cx: number,
  cz: number,
  opts?: { dimension?: number; minIndex?: number; maxIndex?: number }
): SubChunkRequestBody {
  return {
    dimension: opts?.dimension ?? 0,
    origin: { x: cx, y: 0, z: cz },
    offsets: columnOffsets(opts?.minIndex ?? -4, opts?.maxIndex ?? 19),
  };
}

export function applySubChunkPacketToWorld(world: World, pkt: SubChunkBody): number {
  let painted = 0;
  for (const e of pkt.entries) {
    if (e.result === SubChunkResult.SuccessAllAir) continue;
    if (!e.payload?.length) continue;
    const cx = pkt.origin.x + e.offset.x;
    const sy = pkt.origin.y + e.offset.y;
    const cz = pkt.origin.z + e.offset.z;
    try {
      const sc = decodeSubChunk(new BinaryReader(e.payload), sy);
      if (!sc) continue;
      sc.yIndex = sy;
      const col = world.getOrCreateColumn(cx, cz);
      const baseY = sc.yIndex * 16;
      for (let ly = 0; ly < 16; ly++) {
        const y = baseY + ly;
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            const id = sc.blocks[(lx & 15) | ((lz & 15) << 4) | ((ly & 15) << 8)] ?? 0;
            if (id) {
              col.setBlock(lx, y, lz, id & 0xffff);
              painted++;
            }
          }
        }
      }
    } catch {
      /* skip corrupt subchunk */
    }
  }
  return painted;
}

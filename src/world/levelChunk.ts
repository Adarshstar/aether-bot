/**
 * LevelChunk + paletted subchunk codec (network runtime IDs)
 *
 * Subchunk version 8/9:
 *   [version u8][storageCount u8][yIndex i8 if v9][storages…]
 *
 * Each paletted storage:
 *   header = (bitsPerBlock << 1) | 1   // LSB = network runtime
 *   if bitsPerBlock == 0: single palette varint, no words
 *   else: uint32 LE words, then varint palette count + varint runtime IDs
 *
 * Block index is XZY: x + 16*z + 256*y  (X fastest, Y slowest)
 */

import { BinaryReader, BinaryWriter } from "../protocol/binary";
import { Chunk } from "./Chunk";
import type { World } from "./World";

export const SUBCHUNK_SIZE = 16;
export const BLOCKS_PER_SUBCHUNK = 4096;
export const OVERWORLD_MIN_Y = -64;
export const OVERWORLD_MAX_Y = 320;
export const OVERWORLD_SUBCHUNKS = 24; // (-64 … 319) / 16

export interface DecodedSubChunk {
  yIndex: number; // subchunk Y (e.g. -4 for y=-64)
  version: number;
  /** Layer 0 runtime IDs, length 4096, XZY */
  blocks: Uint32Array;
  waterlogged?: Uint32Array;
}

export interface DecodedLevelChunk {
  x: number;
  z: number;
  dimension: number;
  subChunkCount: number;
  cacheEnabled: boolean;
  payload: Buffer;
  subchunks: DecodedSubChunk[];
  requestMode: boolean;
  highestSubChunk?: number;
}

export function subchunkIndex(lx: number, ly: number, lz: number): number {
  return (lx & 15) | ((lz & 15) << 4) | ((ly & 15) << 8);
}

function bitsPerBlockFor(paletteSize: number): number {
  if (paletteSize <= 1) return 0;
  let bits = 1;
  while (1 << bits < paletteSize) bits++;
  if (bits === 7) bits = 8;
  if (bits > 8 && bits < 16) bits = 16;
  return bits;
}

function wordCount(bitsPerBlock: number): number {
  if (bitsPerBlock <= 0) return 0;
  const blocksPerWord = Math.floor(32 / bitsPerBlock);
  return Math.ceil(BLOCKS_PER_SUBCHUNK / blocksPerWord);
}

export function encodePalettedStorage(ids: ArrayLike<number>): Buffer {
  const palette: number[] = [];
  const indexOf = new Map<number, number>();
  const indices = new Uint16Array(BLOCKS_PER_SUBCHUNK);
  for (let i = 0; i < BLOCKS_PER_SUBCHUNK; i++) {
    const id = ids[i] ?? 0;
    let p = indexOf.get(id);
    if (p === undefined) {
      p = palette.length;
      indexOf.set(id, p);
      palette.push(id);
    }
    indices[i] = p;
  }

  const bits = bitsPerBlockFor(palette.length);
  const w = new BinaryWriter();
  w.writeU8((bits << 1) | 1);

  if (bits === 0) {
    w.writeVarInt(palette[0] ?? 0);
    return w.toBuffer();
  }

  const bpw = Math.floor(32 / bits);
  const words = new Uint32Array(wordCount(bits));
  const mask = (1 << bits) - 1;
  for (let i = 0; i < BLOCKS_PER_SUBCHUNK; i++) {
    const word = Math.floor(i / bpw);
    const offset = (i % bpw) * bits;
    words[word] |= (indices[i] & mask) << offset;
  }
  for (const word of words) w.writeU32(word);
  w.writeVarInt(palette.length);
  for (const id of palette) w.writeVarInt(id);
  return w.toBuffer();
}

export function decodePalettedStorage(r: BinaryReader): Uint32Array {
  const out = new Uint32Array(BLOCKS_PER_SUBCHUNK);
  if (r.remaining <= 0) return out;
  const header = r.readU8();
  const bits = header >> 1;
  const network = (header & 1) !== 0;

  if (bits === 0) {
    const id = network ? r.readVarInt() : r.readI32();
    out.fill(id >>> 0);
    return out;
  }

  const bpw = Math.max(1, Math.floor(32 / bits));
  const nWords = wordCount(bits);
  const words: number[] = [];
  for (let i = 0; i < nWords && r.remaining >= 4; i++) words.push(r.readU32());

  const paletteSize = network ? r.readVarInt() : r.readI32();
  const palette: number[] = [];
  for (let i = 0; i < paletteSize && r.remaining > 0; i++) {
    palette.push(network ? r.readVarInt() : r.readI32());
  }

  const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1;
  for (let i = 0; i < BLOCKS_PER_SUBCHUNK; i++) {
    const word = Math.floor(i / bpw);
    const offset = (i % bpw) * bits;
    const palIdx = ((words[word] ?? 0) >>> offset) & mask;
    out[i] = (palette[palIdx] ?? 0) >>> 0;
  }
  return out;
}

export function encodeSubChunk(sub: DecodedSubChunk): Buffer {
  const w = new BinaryWriter();
  const version = sub.version || 9;
  w.writeU8(version);
  const layers = sub.waterlogged ? 2 : 1;
  w.writeU8(layers);
  if (version >= 9) w.writeU8(sub.yIndex & 0xff);
  const parts = [w.toBuffer(), encodePalettedStorage(sub.blocks)];
  if (sub.waterlogged) parts.push(encodePalettedStorage(sub.waterlogged));
  return Buffer.concat(parts);
}

export function decodeSubChunk(r: BinaryReader, fallbackY = 0): DecodedSubChunk | null {
  if (r.remaining <= 0) return null;
  const version = r.readU8();
  let storageCount = 1;
  let yIndex = fallbackY;
  if (version === 8 || version === 9) {
    storageCount = r.readU8();
    if (version >= 9 && r.remaining) {
      const raw = r.readU8();
      yIndex = raw > 127 ? raw - 256 : raw;
    }
  } else if (version === 1) {
    storageCount = 1;
  } else if (version === 0) {
    // empty / legacy skip
    return { yIndex, version, blocks: new Uint32Array(BLOCKS_PER_SUBCHUNK) };
  }

  const layers: Uint32Array[] = [];
  const count = Math.min(storageCount, 2);
  for (let i = 0; i < count && r.remaining > 0; i++) {
    layers.push(decodePalettedStorage(r));
  }
  return {
    yIndex,
    version,
    blocks: layers[0] ?? new Uint32Array(BLOCKS_PER_SUBCHUNK),
    waterlogged: layers[1],
  };
}

export function encodeLevelChunkPayload(subs: DecodedSubChunk[]): Buffer {
  return Buffer.concat(subs.map(encodeSubChunk));
}

export function decodeLevelChunkPayload(
  payload: Buffer,
  subChunkCount: number,
  minY = OVERWORLD_MIN_Y
): DecodedSubChunk[] {
  const r = new BinaryReader(payload);
  const out: DecodedSubChunk[] = [];
  const base = minY >> 4;
  const n = subChunkCount > 0 && subChunkCount < 64 ? subChunkCount : OVERWORLD_SUBCHUNKS;
  for (let i = 0; i < n && r.remaining > 0; i++) {
    const sc = decodeSubChunk(r, base + i);
    if (!sc) break;
    out.push(sc);
  }
  return out;
}

const REQUEST_LIMITLESS = 0xffffffff;
const REQUEST_LIMITED = 0xfffffffe;

export function encodeLevelChunkBody(data: {
  x: number;
  z: number;
  dimension?: number;
  subChunkCount?: number;
  cacheEnabled?: boolean;
  payload?: Buffer;
  highestSubChunk?: number;
}): Buffer {
  const w = new BinaryWriter();
  w.writeZigZag32(data.x);
  w.writeZigZag32(data.z);
  w.writeZigZag32(data.dimension ?? 0);
  const count = data.subChunkCount ?? 0;
  w.writeVarInt(count);
  if (count === REQUEST_LIMITED) {
    w.writeU16(data.highestSubChunk ?? 0);
  }
  w.writeU8(data.cacheEnabled ? 1 : 0);
  const payload = data.payload ?? Buffer.alloc(0);
  w.writeVarInt(payload.length);
  return Buffer.concat([w.toBuffer(), payload]);
}

export function decodeLevelChunkBody(buf: Buffer): DecodedLevelChunk {
  const r = new BinaryReader(buf);
  const x = r.readZigZag32();
  const z = r.readZigZag32();
  let dimension = 0;
  let subChunkCount = 0;
  try {
    dimension = r.readZigZag32();
    subChunkCount = r.readVarInt();
  } catch {
    return {
      x, z, dimension: 0, subChunkCount: 0, cacheEnabled: false,
      payload: buf, subchunks: [], requestMode: false,
    };
  }

  const requestMode = subChunkCount === REQUEST_LIMITLESS || subChunkCount === REQUEST_LIMITED;
  let highestSubChunk: number | undefined;
  if (subChunkCount === REQUEST_LIMITED && r.remaining >= 2) {
    highestSubChunk = r.readU16();
  }
  let cacheEnabled = false;
  if (r.remaining) cacheEnabled = !!r.readU8();
  if (cacheEnabled && r.remaining) {
    const n = r.readVarInt();
    for (let i = 0; i < n && r.remaining >= 8; i++) r.readI64();
  }

  let payload = Buffer.alloc(0);
  if (r.remaining) {
    // either length-prefixed (our encoder) or remaining-is-payload (vanilla)
    const mark = r.offsetPos;
    try {
      const len = r.readVarInt();
      if (len === 0) {
        payload = Buffer.alloc(0);
      } else if (len > 0 && len <= r.remaining) {
        payload = Buffer.from(r.readBuffer(len));
      } else {
        payload = Buffer.from(buf.subarray(mark));
      }
    } catch {
      payload = Buffer.from(buf.subarray(mark));
    }
    if (!payload.length && r.remaining) payload = Buffer.from(r.readBuffer(r.remaining));
  }

  const count = requestMode ? 0 : (subChunkCount > 48 ? OVERWORLD_SUBCHUNKS : subChunkCount);
  const subchunks = requestMode || !payload.length ? [] : decodeLevelChunkPayload(payload, count);

  return { x, z, dimension, subChunkCount, cacheEnabled, payload, subchunks, requestMode, highestSubChunk };
}

/** Paint decoded subchunks onto a column */
export function applyDecodedChunk(chunk: Chunk, decoded: DecodedLevelChunk): number {
  let painted = 0;
  for (const sc of decoded.subchunks) {
    const baseY = sc.yIndex * 16;
    for (let ly = 0; ly < 16; ly++) {
      const y = baseY + ly;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const id = sc.blocks[subchunkIndex(lx, ly, lz)] ?? 0;
          if (id) {
            chunk.setBlock(lx, y, lz, id & 0xffff);
            painted++;
          }
        }
      }
    }
  }
  return painted;
}

export function applyLevelChunkToWorld(world: World, decoded: DecodedLevelChunk): Chunk {
  const col = world.getOrCreateColumn(decoded.x, decoded.z);
  applyDecodedChunk(col, decoded);
  return col;
}

/** Build a flat-world subchunk stack for tests / loopback */
export function makeFlatChunk(cx: number, cz: number, groundY = 63, groundId = 2, stoneId = 1): DecodedLevelChunk {
  const subs: DecodedSubChunk[] = [];
  for (let sy = -4; sy < 20; sy++) {
    const blocks = new Uint32Array(BLOCKS_PER_SUBCHUNK);
    const baseY = sy * 16;
    for (let ly = 0; ly < 16; ly++) {
      const y = baseY + ly;
      let id = 0;
      if (y < groundY - 3) id = 7; // bedrock-ish
      else if (y < groundY) id = stoneId;
      else if (y === groundY) id = groundId;
      if (!id) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          blocks[subchunkIndex(lx, ly, lz)] = id;
        }
      }
    }
    subs.push({ yIndex: sy, version: 9, blocks });
  }
  const payload = encodeLevelChunkPayload(subs);
  return {
    x: cx, z: cz, dimension: 0, subChunkCount: subs.length,
    cacheEnabled: false, payload, subchunks: subs, requestMode: false,
  };
}

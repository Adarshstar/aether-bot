/**
 * Google Snappy (unframed stream) — Bedrock compression algorithm 0x01
 *
 * Wire: [uvarint uncompressed-length][element…]
 * Element tag bits 0–1: 00 literal, 01 copy-1, 10 copy-2, 11 copy-4
 */

function writeUvarint(n: number): Buffer {
  const out: number[] = [];
  let v = n >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return Buffer.from(out);
}

function readUvarint(buf: Buffer, offset: number): { value: number; bytes: number } {
  let n = 0;
  let shift = 0;
  let i = 0;
  for (;;) {
    const b = buf[offset + i];
    if (b === undefined) throw new Error("snappy: truncated varint");
    n |= (b & 0x7f) << shift;
    i++;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new Error("snappy: varint too long");
  }
  return { value: n >>> 0, bytes: i };
}

function emitLiteral(chunks: Buffer[], src: Buffer, start: number, end: number) {
  let off = start;
  while (off < end) {
    const take = Math.min(end - off, 65536);
    const lit = src.subarray(off, off + take);
    off += take;
    const l = lit.length;
    if (l <= 60) {
      chunks.push(Buffer.from([(l - 1) << 2]), Buffer.from(lit));
    } else if (l <= 256) {
      chunks.push(Buffer.from([(60 << 2), l - 1]), Buffer.from(lit));
    } else {
      const hdr = Buffer.alloc(3);
      hdr[0] = 61 << 2;
      hdr.writeUInt16LE(l - 1, 1);
      chunks.push(hdr, Buffer.from(lit));
    }
  }
}

/** Compress to an unframed Snappy stream (valid for BDS algorithm 0x01). */
export function snappyCompress(input: Buffer): Buffer {
  const src = input;
  const n = src.length;
  const chunks: Buffer[] = [writeUvarint(n)];
  if (n === 0) return Buffer.concat(chunks);

  const HASH = 14;
  const mask = (1 << HASH) - 1;
  const table = new Uint32Array(1 << HASH);
  let i = 0;
  let nextEmit = 0;

  while (i + 4 <= n) {
    const word = src.readUInt32LE(i);
    const h = ((Math.imul(word, 0x1e35a7bd) >>> (32 - HASH)) & mask) >>> 0;
    const prev = table[h] - 1;
    table[h] = i + 1;
    const offset = i - prev;
    if (prev >= 0 && offset > 0 && offset <= 65535 && src.readUInt32LE(prev) === word) {
      let matchLen = 4;
      const max = Math.min(n - i, 64);
      while (matchLen < max && src[prev + matchLen] === src[i + matchLen]) matchLen++;
      if (nextEmit < i) emitLiteral(chunks, src, nextEmit, i);
      const hdr = Buffer.alloc(3);
      hdr[0] = 2 | ((matchLen - 1) << 2);
      hdr.writeUInt16LE(offset, 1);
      chunks.push(hdr);
      i += matchLen;
      nextEmit = i;
      continue;
    }
    i++;
  }
  if (nextEmit < n) emitLiteral(chunks, src, nextEmit, n);
  return Buffer.concat(chunks);
}

function copyOverlap(out: Buffer, dest: number, offset: number, len: number) {
  const start = dest - offset;
  for (let k = 0; k < len; k++) out[dest + k] = out[start + k];
}

/** Decompress an unframed Snappy stream. Throws on truncated input. */
export function snappyDecompress(input: Buffer): Buffer {
  if (!input.length) return Buffer.alloc(0);
  const { value: expected, bytes } = readUvarint(input, 0);
  let off = bytes;
  const out = Buffer.alloc(expected);
  let w = 0;
  while (off < input.length && w < expected) {
    const tag = input[off++];
    const kind = tag & 3;
    if (kind === 0) {
      let lenCode = tag >> 2;
      let litLen: number;
      if (lenCode < 60) {
        litLen = lenCode + 1;
      } else {
        const extra = lenCode - 59;
        if (off + extra > input.length) throw new Error("snappy: truncated literal length");
        litLen = 0;
        for (let k = 0; k < extra; k++) litLen |= input[off++] << (8 * k);
        litLen += 1;
      }
      if (off + litLen > input.length) throw new Error("snappy: truncated literal");
      input.copy(out, w, off, off + litLen);
      off += litLen;
      w += litLen;
    } else {
      let len: number;
      let offset: number;
      if (kind === 1) {
        if (off >= input.length) throw new Error("snappy: truncated copy-1");
        len = ((tag >> 2) & 7) + 4;
        offset = ((tag >> 5) << 8) | input[off++];
      } else if (kind === 2) {
        if (off + 2 > input.length) throw new Error("snappy: truncated copy-2");
        len = (tag >> 2) + 1;
        offset = input[off] | (input[off + 1] << 8);
        off += 2;
      } else {
        if (off + 4 > input.length) throw new Error("snappy: truncated copy-4");
        len = (tag >> 2) + 1;
        offset = input.readUInt32LE(off);
        off += 4;
      }
      if (offset <= 0 || offset > w) throw new Error("snappy: bad copy offset");
      copyOverlap(out, w, offset, len);
      w += len;
    }
  }
  return w === expected ? out : out.subarray(0, Math.min(w, expected));
}

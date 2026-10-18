/**
 * NetherNet data-channel framing for BDS 1.26 / protocol 2193
 *
 * Wire order:
 *   1. Fragment header (1 byte) — 0 = complete / last fragment;
 *      n > 0 = fragments remaining after this piece.
 *   2. Optional compression identifier (after NetworkSettings):
 *        0x00 raw DEFLATE (no zlib wrapper)
 *        0x01 Snappy
 *        0xFF uncompressed
 *   3. Packet batch: repeated [varint length][packet]
 *
 * Gameplay rides the "ReliableDataChannel" SCTP channel (DTLS). There is no
 * RakNet 0xFE marker and no RakNet application-layer encryption.
 */

import { deflateRawSync, inflateRawSync, inflateSync } from "zlib";
import { BinaryReader, BinaryWriter } from "./binary";
import { snappyCompress, snappyDecompress } from "./snappy";

export const NETHERNET_RELIABLE_CHANNEL = "ReliableDataChannel";
export const NETHERNET_UNRELIABLE_CHANNEL = "UnreliableDataChannel";

export const CompressionAlgorithm = {
  Deflate: 0x00,
  Snappy: 0x01,
  None: 0xff,
} as const;

export const MAX_FRAGMENT_PAYLOAD = 10_000;

export function wrapFragment(payload: Buffer): Buffer[] {
  if (payload.length <= MAX_FRAGMENT_PAYLOAD) {
    return [Buffer.concat([Buffer.from([0]), payload])];
  }
  const chunks: Buffer[] = [];
  for (let off = 0; off < payload.length; off += MAX_FRAGMENT_PAYLOAD) {
    chunks.push(payload.subarray(off, off + MAX_FRAGMENT_PAYLOAD));
  }
  return chunks.map((part, i) => {
    const remaining = chunks.length - 1 - i;
    return Buffer.concat([Buffer.from([remaining]), part]);
  });
}

export class FragmentReassembler {
  private parts: Buffer[] = [];
  private expecting = 0;

  /**
   * Feed one data-channel message. Returns a complete payload, or null if more
   * fragments are required.
   */
  push(msg: Buffer): Buffer | null {
    if (!msg.length) return null;
    const remaining = msg[0];
    const body = msg.subarray(1);
    if (remaining === 0 && this.parts.length === 0) {
      return Buffer.from(body);
    }
    if (this.parts.length === 0) {
      this.expecting = remaining;
    }
    this.parts.push(Buffer.from(body));
    if (remaining === 0) {
      const out = Buffer.concat(this.parts);
      this.parts = [];
      this.expecting = 0;
      return out;
    }
    return null;
  }

  reset() {
    this.parts = [];
    this.expecting = 0;
  }
}

export function compressBatch(
  batch: Buffer,
  threshold: number,
  algorithm: number = CompressionAlgorithm.Deflate
): Buffer {
  if (threshold < 0) return batch;
  if (batch.length < threshold) {
    return Buffer.concat([Buffer.from([CompressionAlgorithm.None]), batch]);
  }
  if (algorithm === CompressionAlgorithm.Deflate || algorithm === 0) {
    const raw = deflateRawSync(batch);
    return Buffer.concat([Buffer.from([CompressionAlgorithm.Deflate]), raw]);
  }
  if (algorithm === CompressionAlgorithm.Snappy) {
    const raw = snappyCompress(batch);
    return Buffer.concat([Buffer.from([CompressionAlgorithm.Snappy]), raw]);
  }
  return Buffer.concat([Buffer.from([CompressionAlgorithm.None]), batch]);
}

export function decompressBatch(buf: Buffer, compressionEnabled: boolean): Buffer {
  if (!compressionEnabled || buf.length === 0) return buf;
  const alg = buf[0];
  const body = buf.subarray(1);
  if (alg === CompressionAlgorithm.None) return body;
  if (alg === CompressionAlgorithm.Deflate) {
    try {
      return inflateRawSync(body);
    } catch {
      try {
        return inflateSync(body);
      } catch {
        return body;
      }
    }
  }
  if (alg === CompressionAlgorithm.Snappy) {
    try {
      return snappyDecompress(body);
    } catch {
      return body;
    }
  }
  return body;
}

export function encodePacketBatch(packets: Buffer[]): Buffer {
  const parts: Buffer[] = [];
  for (const p of packets) {
    const w = new BinaryWriter();
    w.writeVarInt(p.length);
    parts.push(w.toBuffer(), p);
  }
  return Buffer.concat(parts);
}

export function decodePacketBatch(buf: Buffer): Buffer[] {
  const out: Buffer[] = [];
  const r = new BinaryReader(buf);
  while (r.remaining > 0) {
    try {
      const len = r.readVarInt();
      if (len <= 0 || len > r.remaining) break;
      out.push(r.readBuffer(len));
    } catch {
      break;
    }
  }
  return out;
}

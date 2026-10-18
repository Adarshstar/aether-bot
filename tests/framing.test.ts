import { describe, test, expect } from "bun:test";
import {
  wrapFragment, FragmentReassembler, compressBatch, decompressBatch,
  NETHERNET_RELIABLE_CHANNEL, CompressionAlgorithm,
  encodeGamePacket, decodeGamePacket, PacketId,
} from "../index";

describe("NetherNet fragment header", () => {
  test("single message is header 0", () => {
    const parts = wrapFragment(Buffer.from("hello"));
    expect(parts).toHaveLength(1);
    expect(parts[0][0]).toBe(0);
    const r = new FragmentReassembler();
    const out = r.push(parts[0]);
    expect(out?.toString()).toBe("hello");
  });

  test("multi-fragment reassembly", () => {
    const payload = Buffer.alloc(25_000, 7);
    const parts = wrapFragment(payload);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0][0]).toBe(parts.length - 1);
    expect(parts[parts.length - 1][0]).toBe(0);
    const r = new FragmentReassembler();
    let out: Buffer | null = null;
    for (const p of parts) out = r.push(p);
    expect(out?.equals(payload)).toBe(true);
  });
});

describe("Compression envelope", () => {
  test("below threshold is 0xFF uncompressed", () => {
    const raw = Buffer.from("abc");
    const framed = compressBatch(raw, 16);
    expect(framed[0]).toBe(CompressionAlgorithm.None);
    expect(decompressBatch(framed, true).toString()).toBe("abc");
  });

  test("deflate roundtrip", () => {
    const raw = Buffer.alloc(200, 65);
    const framed = compressBatch(raw, 1, CompressionAlgorithm.Deflate);
    expect(framed[0]).toBe(CompressionAlgorithm.Deflate);
    expect(decompressBatch(framed, true).equals(raw)).toBe(true);
  });

  test("snappy roundtrip", () => {
    const raw = Buffer.alloc(200, 66);
    const framed = compressBatch(raw, 1, CompressionAlgorithm.Snappy);
    expect(framed[0]).toBe(CompressionAlgorithm.Snappy);
    expect(decompressBatch(framed, true).equals(raw)).toBe(true);
  });
});

describe("Channel names", () => {
  test("reliable channel is BDS label", () => {
    expect(NETHERNET_RELIABLE_CHANNEL).toBe("ReliableDataChannel");
  });
});

describe("Login protocol is big-endian", () => {
  test("RequestNetworkSettings 2193", () => {
    const f = encodeGamePacket(PacketId.RequestNetworkSettings, { clientNetworkVersion: 2193 });
    const { data } = decodeGamePacket(f);
    expect(data.clientNetworkVersion).toBe(2193);
  });
});

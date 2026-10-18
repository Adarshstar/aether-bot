import { describe, test, expect } from "bun:test";
import {
  snappyCompress, snappyDecompress,
  compressBatch, decompressBatch, CompressionAlgorithm,
} from "../index";

describe("Snappy unframed", () => {
  test("empty roundtrip", () => {
    const c = snappyCompress(Buffer.alloc(0));
    expect(snappyDecompress(c).length).toBe(0);
  });

  test("literal roundtrip", () => {
    const raw = Buffer.from("Aether protocol 2193 NetherNet");
    expect(snappyDecompress(snappyCompress(raw)).equals(raw)).toBe(true);
  });

  test("repeated bytes use copies and roundtrip", () => {
    const raw = Buffer.alloc(400, 65);
    const c = snappyCompress(raw);
    expect(c.length).toBeLessThan(raw.length);
    expect(snappyDecompress(c).equals(raw)).toBe(true);
  });

  test("overlapping copy pattern", () => {
    const raw = Buffer.from("abcabcabcabcabcabcabcabc");
    expect(snappyDecompress(snappyCompress(raw)).equals(raw)).toBe(true);
  });
});

describe("Compression envelope snappy", () => {
  test("algorithm 0x01 roundtrip", () => {
    const raw = Buffer.alloc(180, 7);
    const framed = compressBatch(raw, 1, CompressionAlgorithm.Snappy);
    expect(framed[0]).toBe(CompressionAlgorithm.Snappy);
    expect(decompressBatch(framed, true).equals(raw)).toBe(true);
  });
});

/**
 * Binary protocol primitives for Bedrock
 * VarInts, little-endian numbers, zigzag, strings, UUIDs, buffers
 */

export class BinaryWriter {
  private chunks: Buffer[] = [];
  private len = 0;

  writeU8(v: number) { const b = Buffer.alloc(1); b.writeUInt8(v & 0xff, 0); this.push(b); }
  writeU16(v: number) { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xffff, 0); this.push(b); }
  writeU32(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); this.push(b); }
  writeI32(v: number) { const b = Buffer.alloc(4); b.writeInt32LE(v, 0); this.push(b); }
  writeI32BE(v: number) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); this.push(b); }
  writeI64(v: bigint) {
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(v, 0);
    this.push(b);
  }
  writeF32(v: number) { const b = Buffer.alloc(4); b.writeFloatLE(v, 0); this.push(b); }
  writeF64(v: number) { const b = Buffer.alloc(8); b.writeDoubleLE(v, 0); this.push(b); }

  writeVarInt(v: number) {
    v = v >>> 0;
    while (v >= 0x80) {
      this.writeU8((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.writeU8(v);
  }

  writeVarLong(v: bigint) {
    let n = BigInt.asUintN(64, v);
    while (n >= 0x80n) {
      this.writeU8(Number(n & 0x7fn) | 0x80);
      n >>= 7n;
    }
    this.writeU8(Number(n));
  }

  /** Signed 32-bit zigzag varint (BlockPos, chunk X/Z, item networkId) */
  writeZigZag32(n: number) {
    const v = ((n << 1) ^ (n >> 31)) >>> 0;
    this.writeVarInt(v);
  }

  writeZigZag64(n: bigint) {
    const v = BigInt.asUintN(64, (n << 1n) ^ (n >> 63n));
    this.writeVarLong(v);
  }

  writeString(s: string) {
    const buf = Buffer.from(s, "utf8");
    this.writeVarInt(buf.length);
    this.push(buf);
  }

  writeBuffer(buf: Buffer) {
    this.writeVarInt(buf.length);
    this.push(buf);
  }

  writeRaw(buf: Buffer | Uint8Array) {
    this.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  }

  writeUUID(uuid: string) {
    const hex = uuid.replace(/-/g, "");
    this.push(Buffer.from(hex, "hex"));
  }

  writeVec3f(x: number, y: number, z: number) {
    this.writeF32(x); this.writeF32(y); this.writeF32(z);
  }

  writeVec3i(x: number, y: number, z: number) {
    this.writeZigZag32(x); this.writeZigZag32(y); this.writeZigZag32(z);
  }

  writeBool(v: boolean) { this.writeU8(v ? 1 : 0); }

  private push(b: Buffer) {
    this.chunks.push(b);
    this.len += b.length;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks, this.len);
  }
}

export class BinaryReader {
  private buf: Buffer;
  private offset = 0;

  constructor(buf: Buffer) {
    this.buf = buf;
  }

  get remaining() { return this.buf.length - this.offset; }
  get offsetPos() { return this.offset; }

  readU8(): number {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }
  readU16(): number {
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }
  readU32(): number {
    const v = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }
  readI32(): number {
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }
  readI32BE(): number {
    const v = this.buf.readInt32BE(this.offset);
    this.offset += 4;
    return v;
  }
  readI64(): bigint {
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }
  readF32(): number {
    const v = this.buf.readFloatLE(this.offset);
    this.offset += 4;
    return v;
  }
  readF64(): number {
    const v = this.buf.readDoubleLE(this.offset);
    this.offset += 8;
    return v;
  }

  readVarInt(): number {
    let num = 0;
    let shift = 0;
    for (;;) {
      const b = this.readU8();
      num |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error("VarInt too long");
    }
    return num >>> 0;
  }

  readVarLong(): bigint {
    let num = 0n;
    let shift = 0n;
    for (;;) {
      const b = BigInt(this.readU8());
      num |= (b & 0x7fn) << shift;
      if ((b & 0x80n) === 0n) break;
      shift += 7n;
      if (shift > 70n) throw new Error("VarLong too long");
    }
    return num;
  }

  readZigZag32(): number {
    const v = this.readVarInt();
    return (v >>> 1) ^ -(v & 1);
  }

  readZigZag64(): bigint {
    const v = this.readVarLong();
    return (v >> 1n) ^ -((v & 1n));
  }

  readString(): string {
    const len = this.readVarInt();
    const s = this.buf.toString("utf8", this.offset, this.offset + len);
    this.offset += len;
    return s;
  }

  readBuffer(len?: number): Buffer {
    const n = len ?? this.readVarInt();
    const b = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return Buffer.from(b);
  }

  readUUID(): string {
    const b = this.readBuffer(16);
    const h = b.toString("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  readVec3f(): { x: number; y: number; z: number } {
    return { x: this.readF32(), y: this.readF32(), z: this.readF32() };
  }

  readBool(): boolean { return this.readU8() !== 0; }

  peekU8(): number { return this.buf.readUInt8(this.offset); }
}

/** Frame a game packet: [varint length][varint id][payload] */
export function encodePacket(id: number, payload: Buffer): Buffer {
  const body = new BinaryWriter();
  body.writeVarInt(id);
  const inner = Buffer.concat([body.toBuffer(), payload]);
  const out = new BinaryWriter();
  out.writeVarInt(inner.length);
  return Buffer.concat([out.toBuffer(), inner]);
}

export function decodePacketHeader(buf: Buffer): { id: number; payload: Buffer; bytesRead: number } {
  const r = new BinaryReader(buf);
  const totalLen = r.readVarInt();
  const start = r.offsetPos;
  const packed = r.readVarInt();
  // bits 0-9 packet id, 10-11 sender subclient, 12-13 target subclient
  const id = packed & 0x3ff;
  const headerSize = r.offsetPos - start;
  const payload = buf.subarray(r.offsetPos, start + totalLen);
  return { id, payload: Buffer.from(payload), bytesRead: start + totalLen, senderSubClient: (packed >> 10) & 3, targetSubClient: (packed >> 12) & 3 } as any;
}

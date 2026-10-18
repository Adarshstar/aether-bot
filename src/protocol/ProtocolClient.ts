/**
 * ProtocolClient — transport I/O, NetherNet framing, compression, packet routing
 */

import { EventEmitter } from "events";
import type { NetherNetTransport } from "../transport/nethernet";
import { encodeGamePacket, decodeGamePacket, decodeBatch } from "./codec";
import {
  FragmentReassembler,
  wrapFragment,
  compressBatch,
  decompressBatch,
  CompressionAlgorithm,
} from "./framing";
import { PacketId } from "./packets";

export type PacketHandler = (data: any) => void;

export class ProtocolClient extends EventEmitter {
  private transport: NetherNetTransport;
  private handlers = new Map<number, Set<PacketHandler>>();
  private compressionThreshold = -1;
  private compressionAlgorithm: number = CompressionAlgorithm.Deflate;
  private fragments = new FragmentReassembler();
  private tick = 0n;
  connected = false;

  constructor(transport: NetherNetTransport) {
    super();
    this.transport = transport;
    transport.on("data", (buf: Buffer) => this.onData(buf));
    transport.on("connected", () => { this.connected = true; });
    transport.on("disconnected", (r) => {
      this.connected = false;
      this.emit("disconnected", r);
    });
  }

  setCompressionThreshold(n: number, algorithm: number = CompressionAlgorithm.Deflate) {
    this.compressionThreshold = n;
    this.compressionAlgorithm = algorithm;
  }

  get compressionEnabled() {
    return this.compressionThreshold >= 0;
  }

  onPacket(id: number, handler: PacketHandler) {
    if (!this.handlers.has(id)) this.handlers.set(id, new Set());
    this.handlers.get(id)!.add(handler);
  }

  offPacket(id: number, handler: PacketHandler) {
    this.handlers.get(id)?.delete(handler);
  }

  send(id: number, data: any = {}) {
    this.sendRaw(encodeGamePacket(id, data));
  }

  sendRaw(buf: Buffer) {
    let batch = buf;
    if (this.compressionEnabled) {
      batch = compressBatch(batch, this.compressionThreshold, this.compressionAlgorithm);
    }
    for (const frame of wrapFragment(batch)) {
      this.transport.send(frame);
    }
  }

  private onData(buf: Buffer) {
    try {
      const complete = this.fragments.push(buf);
      if (!complete) return;
      let payload = decompressBatch(complete, this.compressionEnabled);
      // A single data-channel message may contain multiple length-prefixed game packets.
      let offset = 0;
      let parsed = 0;
      while (offset < payload.length) {
        try {
          const slice = payload.subarray(offset);
          const { id, data, bytesRead } = decodeGamePacket(slice);
          if (!bytesRead || bytesRead <= 0) break;
          if (process.env.AETHER_DEBUG === "1") {
            console.log(`[Protocol] RX id=${id} keys=${Object.keys(data || {}).join(",")} off=${offset}`);
          }
          this.dispatch(id, data);
          offset += bytesRead;
          parsed++;
        } catch {
          // Fallback: try treating remainder as raw
          if (parsed === 0) this.emit("raw", payload.subarray(offset));
          break;
        }
      }
    } catch (err) {
      this.emit("error", err);
    }
  }

  private dispatch(id: number, data: any) {
    this.emit("packet", id, data);
    const set = this.handlers.get(id);
    if (set) for (const h of set) h(data);
  }

  nextTick() {
    this.tick += 1n;
    return Number(this.tick);
  }
}

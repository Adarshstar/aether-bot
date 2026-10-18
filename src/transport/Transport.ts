/**
 * Common transport interface for BDS connections
 */

import { EventEmitter } from "events";

export interface TransportStats {
  bytesSent: number;
  bytesRecv: number;
  lastActivity: number;
}

export abstract class Transport extends EventEmitter {
  abstract connect(): Promise<void>;
  abstract send(data: Buffer | Uint8Array): void;
  abstract disconnect(reason?: string): Promise<void>;
  abstract get isConnected(): boolean;
  abstract get stats(): TransportStats;
}

/**
 * WebRTC helper for Aether NetherNet joins.
 *
 * Node / Bun do not ship RTCPeerConnection. Inject one from:
 *   - werift  (pure JS, recommended for Bun)
 *   - wrtc    (native)
 *   - browser global
 *
 * Usage:
 *   import { createWeriftPeerConnection } from "./webrtcHelper";
 *   const bot = createBot({
 *     ...,
 *     createPeerConnection: createWeriftPeerConnection,
 *     strictWebRTC: true,
 *   });
 */

export type PeerConnectionFactory = () => any;

/**
 * Build a factory that constructs a werift RTCPeerConnection.
 * Call only after `import { RTCPeerConnection } from "werift"` is available.
 */
export function createWeriftPeerConnectionFactory(
  RTCPeerConnectionCtor: any,
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>
): PeerConnectionFactory {
  const servers = iceServers ?? [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];
  return () => new RTCPeerConnectionCtor({ iceServers: servers });
}

/**
 * Detect whether the current runtime already has a global RTCPeerConnection.
 */
export function hasNativeRTC(): boolean {
  return typeof (globalThis as any).RTCPeerConnection === "function";
}

/**
 * Return a factory that uses the global RTCPeerConnection if present,
 * otherwise returns null (caller should fall back or throw).
 */
export function tryNativePeerConnection(
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>
): PeerConnectionFactory | null {
  const Ctor = (globalThis as any).RTCPeerConnection;
  if (typeof Ctor !== "function") return null;
  const servers = iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }];
  return () => new Ctor({ iceServers: servers });
}

/**
 * Recommended setup snippet for Bun + werift (documented for users).
 *
 * ```ts
 * import { RTCPeerConnection } from "werift";
 * import { createBot, createWeriftPeerConnectionFactory } from "aether-bot";
 *
 * const bot = createBot({
 *   host: "127.0.0.1",
 *   port: 19132,
 *   username: "Aether",
 *   offline: true,
 *   strictWebRTC: true,
 *   createPeerConnection: createWeriftPeerConnectionFactory(RTCPeerConnection),
 *   autoReconnect: true,
 * });
 * ```
 */
export const WERIFT_SETUP_DOCS = `
# WebRTC setup for live BDS joins

bun add werift

import { RTCPeerConnection } from "werift";
import { createBot, createWeriftPeerConnectionFactory } from "aether-bot";

const bot = createBot({
  host: "your-bds-host",
  port: 19132,
  username: "Aether",
  offline: true,          // or false + microsoft auth
  strictWebRTC: true,
  createPeerConnection: createWeriftPeerConnectionFactory(RTCPeerConnection),
  autoReconnect: true,
  maxReconnectAttempts: 8,
});
`;

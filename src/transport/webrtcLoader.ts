/**
 * Auto-detect WebRTC for Node/Bun: global → werift → wrtc
 */

export type PeerFactory = () => any;

let cached: PeerFactory | null | undefined;

export function resetWebRtcLoader() {
  cached = undefined;
}

export async function resolvePeerConnectionFactory(
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>
): Promise<PeerFactory | null> {
  if (cached !== undefined) return cached;

  const servers = iceServers ?? [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const g = globalThis as any;
  if (typeof g.RTCPeerConnection === "function") {
    cached = () => new g.RTCPeerConnection({ iceServers: servers });
    return cached;
  }

  try {
    const werift = await import("werift");
    const RTCPeerConnection = (werift as any).RTCPeerConnection;
    if (typeof RTCPeerConnection === "function") {
      cached = () =>
        new RTCPeerConnection({
          iceServers: servers.map((s) => ({
            urls: Array.isArray(s.urls) ? s.urls : [s.urls],
            username: s.username,
            credential: s.credential,
          })),
        });
      console.log("[WebRTC] Using werift");
      return cached;
    }
  } catch {
    /* not installed */
  }

  try {
    const wrtc = await import("wrtc");
    const RTCPeerConnection = (wrtc as any).RTCPeerConnection ?? (wrtc as any).default?.RTCPeerConnection;
    if (typeof RTCPeerConnection === "function") {
      cached = () => new RTCPeerConnection({ iceServers: servers });
      console.log("[WebRTC] Using wrtc");
      return cached;
    }
  } catch {
    /* not installed */
  }

  cached = null;
  return null;
}

export function getCachedPeerFactory(): PeerFactory | null {
  return cached === undefined ? null : cached;
}

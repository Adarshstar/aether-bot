/**
 * Minimal RTCPeerConnection stand-in for signaling tests (no native WebRTC).
 * DataChannel opens after setRemoteDescription so /v1/join can complete.
 */

export const MOCK_OFFER_SDP = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:aeth",
  "a=ice-pwd:aethericepasswordvalue12",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

export const MOCK_ANSWER_SDP = MOCK_OFFER_SDP
  .replace("a=setup:actpass", "a=setup:active")
  .replace("o=- 1 2", "o=- 2 2");

function mockChannel(label: string, ordered: boolean) {
  const ch: any = {
    label,
    ordered,
    readyState: "connecting",
    binaryType: "arraybuffer",
    onopen: null as null | (() => void),
    onmessage: null,
    onclose: null,
    onerror: null,
    send(_data: ArrayBuffer | Buffer) {},
    close() {
      this.readyState = "closed";
      this.onclose?.();
    },
  };
  return ch;
}

export function createMockPeerConnection(): any {
  const channels: any[] = [];
  const pc: any = {
    iceGatheringState: "complete",
    iceConnectionState: "new",
    connectionState: "new",
    localDescription: null as any,
    remoteDescription: null as any,
    onicecandidate: null,
    ondatachannel: null,
    onicegatheringstatechange: null,
    createDataChannel(label: string, opts?: { ordered?: boolean }) {
      const ch = mockChannel(label, opts?.ordered !== false);
      channels.push(ch);
      return ch;
    },
    async createOffer() {
      return { type: "offer", sdp: MOCK_OFFER_SDP };
    },
    async createAnswer() {
      return { type: "answer", sdp: MOCK_ANSWER_SDP };
    },
    async setLocalDescription(desc: any) {
      pc.localDescription = desc;
    },
    async setRemoteDescription(desc: any) {
      pc.remoteDescription = desc;
      pc.iceConnectionState = "connected";
      pc.connectionState = "connected";
      for (const ch of channels) {
        if (ch.readyState === "connecting") {
          ch.readyState = "open";
          ch.onopen?.();
        }
      }
    },
    async addIceCandidate(_c: any) {},
    close() {
      pc.connectionState = "closed";
      for (const ch of channels) ch.close();
    },
  };
  return pc;
}

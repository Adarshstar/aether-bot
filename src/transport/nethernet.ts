/**
 * NetherNet client for BDS 1.26.52.3 / protocol 2193
 *
 * Signaling (TCP HTTP on server-port, usually 19132):
 *   GET  /v1/join                  — probe / MOTD (200 JSON)
 *   POST /v1/join/{networkId}      — SDP offer → SDP answer
 *
 * Media: WebRTC data channels
 *   ReliableDataChannel   (ordered)     — gameplay
 *   UnreliableDataChannel (unordered)   — optional
 *
 * Inject createPeerConnection (werift / wrtc) when the runtime has no RTC.
 * Without WebRTC, a development loopback is used so AI/pathfinding still run.
 */

import { Transport } from "./Transport";
import {
  NETHERNET_RELIABLE_CHANNEL,
  NETHERNET_UNRELIABLE_CHANNEL,
} from "../protocol/framing";
import { applyIdentityToOffer, injectSdpIdentity, parseSdpIdentity } from "../protocol/sdp";
import { resolvePeerConnectionFactory } from "./webrtcLoader";

export interface NetherNetOptions {
  host: string;
  port: number;
  networkId?: string;
  offline?: boolean;
  signalingTimeoutMs?: number;
  createPeerConnection?: () => any;
  signalingUrl?: string;
  secureSignaling?: boolean;
  /** If true, do not fall back to loopback on WebRTC failure */
  strictWebRTC?: boolean;
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  /** Pre-built a=identity assertion (JWT). */
  identityAssertion?: string;
  /** ES384 private key PEM matching login `cpk` — used to sign fingerprints. */
  identityPrivateKeyPem?: string;
  /** Multiplayer / Xbox token bound into the identity JWT. */
  identityToken?: string;
  identityDomain?: string;
  /** Refuse SDP answers that do not carry a=identity. */
  requireServerIdentity?: boolean;
  /** Max retries for probe + signaling (default 3). */
  maxRetries?: number;
  /** Base delay in ms between retries (exponential backoff, default 800). */
  retryBaseMs?: number;
  /** How long to wait for ICE gathering before sending offer (default 5000). */
  iceGatherTimeoutMs?: number;
  /** Enable continuous connection health monitoring. */
  healthCheckIntervalMs?: number;
}

export interface JoinInfo {
  raw: any;
  networkId?: string;
  motd?: string;
  name?: string;
  protocol?: number;
  version?: string;
  level?: string;
  players?: number;
  maxPlayers?: number;
  gameType?: number;
}

function pick<T>(obj: any, keys: string[], fallback?: T): T | undefined {
  if (!obj || typeof obj !== "object") return fallback;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k] as T;
  }
  return fallback;
}

function extractSdp(body: any): { sdp: string; type: string } | null {
  if (!body) return null;
  if (typeof body === "string") {
    const t = body.trim();
    if (t.startsWith("v=")) return { sdp: t, type: "answer" };
    try { return extractSdp(JSON.parse(t)); } catch { return null; }
  }
  const sdp =
    pick<string>(body, ["sdp", "SDP", "sessionDescription"]) ??
    pick<string>(body.answer, ["sdp", "SDP"]) ??
    pick<string>(body.sessionDescription, ["sdp", "SDP"]) ??
    pick<string>(body.offer, ["sdp", "SDP"]);
  if (!sdp) return null;
  const type =
    pick<string>(body, ["type"]) ??
    pick<string>(body.answer, ["type"]) ??
    "answer";
  return { sdp, type };
}

export class NetherNetTransport extends Transport {
  private options: {
    host: string;
    port: number;
    networkId: string;
    offline: boolean;
    signalingTimeoutMs: number;
    createPeerConnection?: () => any;
    signalingUrl?: string;
    secureSignaling: boolean;
    strictWebRTC: boolean;
    iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
    identityAssertion?: string;
    identityPrivateKeyPem?: string;
    identityToken?: string;
    identityDomain: string;
    requireServerIdentity: boolean;
    maxRetries: number;
    retryBaseMs: number;
    iceGatherTimeoutMs: number;
    healthCheckIntervalMs: number;
  };
  private connected = false;
  private closing = false;
  private bytesSent = 0;
  private bytesRecv = 0;
  private lastActivity = 0;
  private pc: any = null;
  private dc: any = null;
  private unreliable: any = null;
  private joinInfo: JoinInfo | null = null;
  private loopback = false;
  private iceCandidates: any[] = [];
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;

  constructor(options: NetherNetOptions) {
    super();
    this.options = {
      host: options.host,
      port: options.port,
      networkId: options.networkId ?? "1",
      offline: options.offline ?? true,
      signalingTimeoutMs: options.signalingTimeoutMs ?? 8000,
      createPeerConnection: options.createPeerConnection,
      signalingUrl: options.signalingUrl,
      secureSignaling: options.secureSignaling ?? false,
      strictWebRTC: options.strictWebRTC ?? false,
      iceServers: options.iceServers ?? [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
      identityAssertion: options.identityAssertion,
      identityPrivateKeyPem: options.identityPrivateKeyPem,
      identityToken: options.identityToken,
      identityDomain: options.identityDomain ?? "",
      requireServerIdentity: options.requireServerIdentity ?? false,
      maxRetries: options.maxRetries ?? 4,
      retryBaseMs: options.retryBaseMs ?? 350,
      iceGatherTimeoutMs: options.iceGatherTimeoutMs ?? 2200,
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? 0,
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: any;
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.options.retryBaseMs * Math.pow(2, attempt - 1);
          console.log(`[NetherNet] ${label} retry ${attempt}/${this.options.maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
        return await fn();
      } catch (e: any) {
        lastErr = e;
        console.warn(`[NetherNet] ${label} attempt ${attempt + 1} failed: ${e?.message ?? e}`);
        if (this.closing) throw e;
      }
    }
    throw lastErr ?? new Error(`${label} failed after retries`);
  }

  private baseUrl(): string {
    if (this.options.signalingUrl) return this.options.signalingUrl.replace(/\/$/, "");
    const scheme = this.options.secureSignaling ? "https" : "http";
    return `${scheme}://${this.options.host}:${this.options.port}`;
  }

  async probe(): Promise<JoinInfo> {
    return this.withRetry("probe", async () => {
      const url = `${this.baseUrl()}/v1/join`;
      console.log(`[NetherNet] GET ${url}`);
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "Aether/1.7.1" },
        signal: AbortSignal.timeout(this.options.signalingTimeoutMs),
      });
      if (!res.ok) throw new Error(`NetherNet probe failed: HTTP ${res.status}`);
      let raw: any = null;
      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (ct.includes("json") || text.trim().startsWith("{")) {
        try { raw = JSON.parse(text); } catch { raw = { text }; }
      } else {
        raw = { text };
      }
      const networkId = pick<string | number>(raw, [
        "networkId", "NetworkId", "webrtcNetworkId", "WebRTCNetworkId", "network_id",
      ], this.options.networkId);
      // Do not use bare "id" — MOTD JSON often has unrelated numeric fields
      this.joinInfo = {
        raw,
        networkId: String(networkId ?? this.options.networkId),
        motd: pick<string>(raw, ["motd", "MOTD", "levelname", "level", "name"]),
        name: pick<string>(raw, ["name", "serverName", "motd"]),
        protocol: Number(pick(raw, ["protocol", "Protocol", "protocolVersion"]) ?? 0) || undefined,
        version: pick<string>(raw, ["version", "Version", "mcVersion"]),
        level: pick<string>(raw, ["level", "levelname", "LevelName"]),
        players: Number(pick(raw, ["players", "numPlayers", "online"]) ?? NaN) || undefined,
        maxPlayers: Number(pick(raw, ["maxPlayers", "maxplayers", "max"]) ?? NaN) || undefined,
        gameType: pick<number>(raw, ["gameType", "gametype", "gamemode"]),
      };
      // Only adopt probe networkId when non-empty and not the invalid "0" placeholder
      if (this.joinInfo.networkId && this.joinInfo.networkId !== "0" && this.joinInfo.networkId !== "undefined") {
        this.options.networkId = this.joinInfo.networkId;
      }
      console.log(`[NetherNet] Probe OK networkId=${this.options.networkId} protocol=${this.joinInfo.protocol ?? "?"}`);
      return this.joinInfo;
    });
  }

  private createPC(): any {
    if (this.options.createPeerConnection) {
      return this.options.createPeerConnection();
    }
    const g = globalThis as any;
    if (typeof g.RTCPeerConnection === "function") {
      return new g.RTCPeerConnection({ iceServers: this.options.iceServers });
    }
    return null;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.closing = false;
    this.loopback = false;
    const t0 = Date.now();

    try {
      // Parallel: probe + resolve WebRTC implementation
      const probeP = this.probe().catch((e: any) => {
        console.warn(`[NetherNet] Probe warning: ${e.message} — continuing with networkId=${this.options.networkId}`);
        if (this.options.strictWebRTC) throw e;
        return null;
      });
      if (!this.options.createPeerConnection) {
        const factory = await resolvePeerConnectionFactory(this.options.iceServers as any);
        if (factory) this.options.createPeerConnection = factory;
      }
      await probeP;

      const pc = this.createPC();
      if (!pc) {
        if (this.options.strictWebRTC) {
          throw new Error("No RTCPeerConnection — inject createPeerConnection (werift/wrtc)");
        }
        console.warn("[NetherNet] No RTCPeerConnection — inject createPeerConnection (werift/wrtc)");
        console.warn("[NetherNet] Development loopback (not a live BDS link)");
        this.enterLoopback();
        return;
      }

      this.pc = pc;
      this.bindPeer(pc);

      const dc = pc.createDataChannel(NETHERNET_RELIABLE_CHANNEL, { ordered: true });
      this.attachDataChannel(dc, true);
      try {
        this.unreliable = pc.createDataChannel(NETHERNET_UNRELIABLE_CHANNEL, {
          ordered: false,
          maxRetransmits: 0,
        });
        this.attachDataChannel(this.unreliable, false);
      } catch {
        /* optional */
      }

      await this.negotiate(pc);

      if (this.closing) return;
      this.connected = true;
      this.lastActivity = Date.now();
      this.startStabilityWatch();
    this.emit("connected");
      this.emit("loopback", false);
      console.log(`[NetherNet] WebRTC data channel OPEN — live path (${Date.now() - t0}ms)`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error("[NetherNet] Connect failed:", msg);
      this.emit("error", err instanceof Error ? err : new Error(msg));
      if (this.options.strictWebRTC) throw err;
      this.enterLoopback();
      console.warn("[NetherNet] Fallback loopback active");
    }
  }

  private enterLoopback() {
    this.connected = true;
    this.loopback = true;
    this.lastActivity = Date.now();
    this.emit("connected");
    this.emit("loopback", true);
  }

  private bindPeer(pc: any) {
    pc.ondatachannel = (ev: any) => {
      const ch = ev?.channel;
      if (!ch) return;
      const label = String(ch.label ?? "");
      const primary = label === NETHERNET_RELIABLE_CHANNEL || (!this.dc && label !== NETHERNET_UNRELIABLE_CHANNEL);
      this.attachDataChannel(ch, primary);
    };
    pc.onicecandidate = (ev: any) => {
      if (ev?.candidate) this.iceCandidates.push(ev.candidate);
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      console.log("[NetherNet] iceConnectionState=", st);
      if (st === "connected" || st === "completed") {
        this.lastActivity = Date.now();
        return;
      }
      // "disconnected" often recovers on its own. Never call restartIce:
      // NetherNet will not complete the new offer, and the datachannel dies.
      if (st === "failed") {
        setTimeout(() => {
          if (this.closing || this.failed || !this.pc) return;
          const s = this.pc.iceConnectionState;
          if (s === "connected" || s === "completed") return;
          if (this.dc?.readyState === "open") return;
          this.fail(`ice ${s}`);
        }, 4000);
      }
    };
  }

  private attachDataChannel(dc: any, primary: boolean) {
    if (!dc) return;
    dc.binaryType = "arraybuffer";
    dc.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      const buf = Buffer.isBuffer(data)
        ? data
        : Buffer.from(new Uint8Array(data as ArrayBuffer));
      this.bytesRecv += buf.length;
      this.lastActivity = Date.now();
      this.emit("data", buf);
    };
    dc.onclose = () => {
      if (!primary) return;
      const dcRef = dc;
      setTimeout(() => {
        if (this.closing || this.failed) return;
        if (this.dc && this.dc !== dcRef && this.dc.readyState === "open") return;
        if (dcRef.readyState === "open") return;
        console.warn("[NetherNet] datachannel stayed closed");
        this.fail("datachannel closed");
      }, 800);
    };
    dc.onerror = () => {
      console.warn("[NetherNet] datachannel error state=", dc.readyState);
    };
    if (primary) this.dc = dc;
  }

  private async negotiate(pc: any): Promise<void> {
    const timeout = this.options.signalingTimeoutMs;
    const networkId = this.options.networkId;

    const openPromise = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("DataChannel open timeout")), timeout);
      const arm = (ch: any) => {
        if (!ch) return;
        if (ch.readyState === "open") {
          clearTimeout(t);
          resolve();
          return;
        }
        ch.onopen = () => { clearTimeout(t); resolve(); };
        ch.onerror = (e: any) => {
          clearTimeout(t);
          reject(e instanceof Error ? e : new Error("dc error"));
        };
      };
      arm(this.dc);
      pc.ondatachannel = (ev: any) => {
        const ch = ev?.channel;
        if (!ch) return;
        this.attachDataChannel(ch, ch.label === NETHERNET_RELIABLE_CHANNEL || !this.dc);
        arm(ch);
      };
    });

    if (typeof pc.createOffer !== "function") {
      throw new Error("RTCPeerConnection.createOffer missing");
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Collect ICE candidates more aggressively
    if (typeof pc.onicecandidate === "function" || "onicecandidate" in pc) {
      pc.onicecandidate = (ev: any) => {
        if (ev?.candidate) {
          this.iceCandidates.push(ev.candidate);
        }
      };
    }

    // Fast ICE: complete, ≥2 candidates, or timeout
    if (pc.iceGatheringState !== "complete") {
      await new Promise<void>((resolve) => {
        let done = false;
        const iceStart = Date.now();
        const finish = (why: string) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          console.log(`[NetherNet] ICE ${why} (${this.iceCandidates.length} candidates, ${Date.now() - iceStart}ms)`);
          resolve();
        };
        const timer = setTimeout(() => finish("timeout"), this.options.iceGatherTimeoutMs);
        const prev = pc.onicegatheringstatechange;
        pc.onicegatheringstatechange = () => {
          if (typeof prev === "function") prev();
          if (pc.iceGatheringState === "complete") finish("complete");
        };
        const prevCand = pc.onicecandidate;
        pc.onicecandidate = (ev: any) => {
          if (typeof prevCand === "function") prevCand(ev);
          if (ev?.candidate) {
            this.iceCandidates.push(ev.candidate);
            if (this.iceCandidates.length >= 2) finish("early");
          }
        };
      });
    }

    const local = pc.localDescription ?? offer;
    let sdp: string = local.sdp ?? "";
    try {
      if (this.options.identityPrivateKeyPem && this.options.identityToken) {
        sdp = applyIdentityToOffer(sdp, {
          privateKeyPem: this.options.identityPrivateKeyPem,
          token: this.options.identityToken,
          domain: this.options.identityDomain,
        });
      } else if (this.options.identityAssertion) {
        sdp = injectSdpIdentity(sdp, this.options.identityAssertion);
      }
    } catch (err: any) {
      console.warn("[NetherNet] Identity assertion failed:", err?.message ?? err);
    }

    const joinUrl = `${this.baseUrl()}/v1/join/${encodeURIComponent(networkId)}`;
    console.log(`[NetherNet] POST ${joinUrl} (candidates=${this.iceCandidates.length}, sdp=${sdp.length}b)`);

    // Mojang NetherNet HTTP Signaling (Partner Onboarding Guide):
    //   Content-Type: application/sdp
    //   Body: raw SDP offer text (UTF-8), including a=identity and all ICE candidates
    //   Response: raw SDP answer (application/sdp) on 2xx
    // Numeric body "37" = ErrorCodeIdentityNotAllowed
    const answerSdp = await this.withRetry("signaling", async () => {
      const res = await fetch(joinUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Accept: "application/sdp, application/json, text/plain, */*",
          "User-Agent": "MCPE/Android",
          "Client-Version": "1.26.52",
        },
        body: sdp,
        signal: AbortSignal.timeout(timeout),
      });

      const text = await res.text();
      const trimmed = text.trim();

      // BDS may return plain error codes (e.g. "37" IdentityNotAllowed) with 200
      if (/^\d+$/.test(trimmed)) {
        const code = Number(trimmed);
        const names: Record<number, string> = {
          37: "IdentityNotAllowed",
          1: "DestinationNotLoggedIn",
          2: "NegotiationTimeout",
          3: "WrongTransportVersion",
        };
        throw new Error(
          `Signaling error code ${code} (${names[code] ?? "unknown"})${res.status !== 200 ? ` HTTP ${res.status}` : ""}`
        );
      }

      if (!res.ok) {
        throw new Error(`Signaling join HTTP ${res.status}: ${trimmed.slice(0, 200)}`);
      }

      // Prefer raw SDP; some proxies wrap in JSON
      if (trimmed.startsWith("v=")) return trimmed;
      try {
        const j = JSON.parse(trimmed);
        const extracted = extractSdp(j);
        if (extracted?.sdp) return extracted.sdp;
      } catch {
        /* not JSON */
      }
      if (trimmed.includes("v=")) return trimmed;
      throw new Error(`Signaling response missing sdp: ${trimmed.slice(0, 120)}`);
    });

    const parsed = extractSdp(answerSdp) ?? { sdp: answerSdp, type: "answer" };
    if (!parsed?.sdp) throw new Error("Signaling response missing sdp");

    const ident = parseSdpIdentity(parsed.sdp);
    if (ident.identity) {
      console.log("[NetherNet] Answer carries a=identity assertion");
      this.emit("server_identity", ident.identity);
    } else if (this.options.requireServerIdentity) {
      throw new Error("Signaling answer missing a=identity (real clients refuse this)");
    }

    // Strip a=identity before setRemoteDescription — WebRTC stacks reject unknown attributes
    const cleanSdp = parsed.sdp
      .split(/\r?\n/)
      .filter((l) => !l.startsWith("a=identity:"))
      .join("\r\n");

    await pc.setRemoteDescription({ type: parsed.type || "answer", sdp: cleanSdp });

    await openPromise;
    this.startHealthMonitor();
  }

  private startHealthMonitor(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    const interval = this.options.healthCheckIntervalMs;
    if (!interval || interval <= 0) return;
    this.healthTimer = setInterval(() => {
      if (this.closing || !this.connected) return;
      const silent = Date.now() - this.lastActivity;
      if (silent > interval * 3) {
        console.warn(`[NetherNet] No activity for ${silent}ms — emitting stale`);
        this.emit("stale", { silentMs: silent });
      }
      // Check datachannel state
      if (this.dc && this.dc.readyState !== "open") {
        console.warn(`[NetherNet] DataChannel state=${this.dc.readyState}`);
        this.fail(`datachannel ${this.dc.readyState}`);
      }
    }, interval);
  }

  send(data: Buffer | Uint8Array): void {
    if (this.failed || this.closing || !this.connected) throw new Error("NetherNet not connected");
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

    if (this.dc && this.dc.readyState === "open") {
      const buffered = Number(this.dc.bufferedAmount ?? 0);
      // Drop instead of overflowing SCTP — an overflow closes the channel.
      if (buffered > 256 * 1024) {
        this.sendDrops++;
        if (this.sendDrops % 40 === 1) {
          console.warn(`[NetherNet] SCTP backpressure buffered=${buffered} drops=${this.sendDrops}`);
        }
        return;
      }
      this.bytesSent += buf.byteLength;
      this.lastActivity = Date.now();
      this.dc.send(buf);
      return;
    }

    if (this.loopback || !this.dc) {
      queueMicrotask(() => {
        if (this.connected && (this.loopback || !this.dc)) {
          this.bytesRecv += buf.byteLength;
          this.emit("data", buf);
        }
      });
    }
  }


  private failed = false;
  private sendDrops = 0;
  private stabilityTimer: ReturnType<typeof setInterval> | null = null;

  /** Emit disconnect once. Blind restartIce is not used — signaling is one-shot. */
  private fail(reason: string) {
    if (this.failed || this.closing) return;
    this.failed = true;
    this.connected = false;
    console.warn("[NetherNet] fail:", reason);
    this.emit("disconnected", reason);
  }
  private startStabilityWatch() {
    if (this.stabilityTimer) clearInterval(this.stabilityTimer);
    this.stabilityTimer = setInterval(() => {
      if (this.closing || this.loopback) return;
      if (this.dc?.readyState === "open") this.lastActivity = Date.now();
    }, 5000);
  }


  /** Report whether the datachannel is still up. Does not renegotiate. */
  async softReconnectIce(): Promise<boolean> {
    if (!this.pc || this.closing || this.failed) return false;
    const open = this.dc?.readyState === "open" &&
      (this.pc.iceConnectionState === "connected" || this.pc.iceConnectionState === "completed");
    if (open) this.connected = true;
    return !!open;
  }

  async disconnect(reason = "Client closed"): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.connected = false;
    if (this.stabilityTimer) { clearInterval(this.stabilityTimer); this.stabilityTimer = null; }
    try { this.dc?.close?.(); } catch { /* */ }
    try { this.unreliable?.close?.(); } catch { /* */ }
    try { this.pc?.close?.(); } catch { /* */ }
    this.dc = null;
    this.unreliable = null;
    this.pc = null;
    this.emit("disconnected", reason);
  }

  get isConnected() { return this.connected; }
  get isLoopback() { return this.loopback; }
  get stats() {
    return { bytesSent: this.bytesSent, bytesRecv: this.bytesRecv, lastActivity: this.lastActivity };
  }
  get lastJoinInfo() { return this.joinInfo; }
}

export { extractSdp, pick as pickJoinField };

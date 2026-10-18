export type ProtocolVersion = 2193;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BotOptions {
  host: string;
  port?: number;
  username: string;
  /** true = offline/cracked style, false = Microsoft/Xbox login */
  offline?: boolean;
  /** Alias: "microsoft" forces online Xbox auth */
  auth?: "offline" | "microsoft";
  version?: string;
  transport?: "nethernet" | "raknet" | "auto";
  viewDistance?: number;
  tickRate?: number;
  enablePhysics?: boolean;
  maxCatchupTicks?: number;
  /** Optional Azure/public client id for device code flow */
  clientId?: string;
  /** Inject RTCPeerConnection factory (werift / wrtc) */
  createPeerConnection?: () => any;
  /** Fail instead of entering development loopback */
  strictWebRTC?: boolean;
  signalingUrl?: string;
  /** NetherNet signaling network id (POST /v1/join/{id}) */
  networkId?: string;
  /** Refuse SDP answers without a=identity */
  requireServerIdentity?: boolean;
  /** Domain bound into the offer identity JWT */
  identityDomain?: string;
  /** MSA refresh token (Xbox online auth) */
  refreshToken?: string;
  /** Persist Xbox tokens under authCacheDir */
  persistTokens?: boolean;
  /** Token cache directory (default .aether-auth) */
  authCacheDir?: string;

  // ── NetherNet reliability (passed through to NetherNetTransport) ──
  /** Max retries for probe + signaling (default 3) */
  maxRetries?: number;
  /** Base delay ms for exponential backoff (default 800) */
  retryBaseMs?: number;
  /** ICE gather timeout ms (default 5000) */
  iceGatherTimeoutMs?: number;
  /** Health-check interval ms; 0 = disabled */
  healthCheckIntervalMs?: number;
  signalingTimeoutMs?: number;

  // ── Auto-reconnect ──
  /** Automatically reconnect on disconnect (default false) */
  autoReconnect?: boolean;
  /** Max reconnect attempts (default 5). 0 = unlimited */
  maxReconnectAttempts?: number;
  /** Base delay between reconnects ms (default 2000) */
  reconnectBaseMs?: number;
}

export interface GameState {
  gamemode: number;
  difficulty: number;
  dimension: number;
  spawn: Vec3;
  time: number;
  raining: boolean;
  levelName?: string;
  worldSeed?: number;
}

export interface Entity {
  id: number;
  type: string;
  username?: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  health?: number;
  metadata?: Record<string, any>;
}

export type BotEventMap = {
  login: () => void;
  spawn: () => void;
  disconnect: (reason: string) => void;
  error: (err: Error) => void;
  inject_allowed: () => void;
  chat: (username: string, message: string) => void;
  physicsTick: () => void;
  entitySpawn: (entity: Entity) => void;
  entityGone: (entity: Entity) => void;
  entityMoved: (entity: Entity) => void;
  health: () => void;
  death: () => void;
  blockUpdate: (oldBlock: number, newBlock: number, position: Vec3) => void;
  move: () => void;
  inventory: (packet: any) => void;
  pathStart: (path: Vec3[]) => void;
  pathStop: () => void;
  goalReached: () => void;
  /** Fired when auto-reconnect is about to attempt a reconnect */
  reconnecting: (attempt: number, delayMs: number) => void;
  /** Fired after a successful auto-reconnect */
  reconnected: (attempt: number) => void;
};

export type Plugin = (bot: any, options?: any) => void;

export function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSquared(a, b));
}

/**
 * Bedrock AI Engine – Core Bot
 * High-level APIs integrated directly (no plugin indirection for hot paths)
 */

import { EventEmitter } from "events";
import { PluginLoader } from "./PluginLoader";
import { NetherNetTransport } from "../transport/nethernet";
import { ProtocolHandler } from "../protocol/ProtocolHandler";
import { BDSSession } from "../protocol/BDSSession";
import { World } from "../world/World";
import { Pathfinder } from "../pathfinding/Pathfinder";
import { PathFollower } from "../pathfinding/PathFollower";
import { Agent } from "../ai/Agent";
import { Inventory } from "../inventory/Inventory";
import { CombatController as Combat } from "../combat/Combat";
import { WindowManager } from "../windows/Window";
import { XboxAuth } from "../auth/XboxAuth";
import type { AuthResult } from "../auth/XboxAuth";
import { BlockRegistry } from "../registry/blocks";
import { EntityRegistry } from "../registry/entities";
import type { GoalInput } from "../pathfinding/Pathfinder";
import type { BotOptions, BotEventMap, Plugin, Vec3, GameState, Entity } from "../types";
import { distance, distanceSquared } from "../types";
import { PhysicsEngine, type ControlState as PhysControls } from "../physics/Physics";
import { Vec3 as Vec3Vec } from "../math/Vec3";
import { Block } from "../block/Block";
import { PvP } from "../pvp/PvP";
import { AutoEat } from "../autoeat/AutoEat";
import { CollectBlock } from "../collect/CollectBlock";
import { ToolManager } from "../tool/Tool";
import { StateMachine } from "../statemachine/StateMachine";
import { RecipeRegistry } from "../recipe/Recipe";
import { createFarm, type Farm } from "../farm/Farm";
import { createScriptRunner, type ScriptRunner } from "../script/ScriptRunner";
import { BiomeRegistry } from "../biome/Biome";
import { AETHER_VERSION, AETHER_NAME, TARGET_PROTOCOL } from "./version";
import { SpatialIndex } from "../math/SpatialIndex";
import { globalPerf } from "./PerfMonitor";
import { createTaskQueue, type TaskQueue } from "../tasks/TaskQueue";
import { Arbiter } from "../decision/Arbitration";

export class Bot extends EventEmitter {
  readonly options: Required<BotOptions>;
  username: string;

  entity: Entity | null = null;
  game: GameState | null = null;
  health = 20;
  food = 20;
  oxygen = 20;
  isAlive = true;

  entities = new Map<number, Entity>();
  players = new Map<string, Entity>();

  world: World;
  pathfinder: Pathfinder;
  pathFollower: PathFollower;
  agent: Agent;
  inventory: Inventory;
  combat: Combat;
  windows: WindowManager;

  /** Direct registry access (fast, no plugin layer) */
  entityIndex = new SpatialIndex<{ id: number; x: number; y: number; z: number; ref: any }>(8);
  tasks!: TaskQueue;
  farm!: Farm;
  scripts!: ScriptRunner;
  readonly blocks = BlockRegistry;
  readonly entityTypes = EntityRegistry;
  readonly recipes = RecipeRegistry;
  readonly biomes = BiomeRegistry;

  pvp: Combat;
  autoEat: AutoEat;
  collect: CollectBlock;
  tools: ToolManager;
  /** V8: shared priority arbiter so DecisionEngine and Agent don't fight for control */
  readonly arbiter = new Arbiter();
  stateMachine: StateMachine;
  private physicsEngine: PhysicsEngine;

  transport: NetherNetTransport | null = null;
  protocol: ProtocolHandler | null = null;
  session: BDSSession | null = null;

  private pluginLoader: PluginLoader;
  private connected = false;
  private intentionalDisconnect = false;
  private authResult: AuthResult | null = null;
  private physicsTimer: ReturnType<typeof setInterval> | null = null;
  private lastPhysicsTime = 0;
  private timeAccumulator = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectInFlight = false;
  private controlState: Record<string, boolean> = {
    forward: false, back: false, left: false, right: false,
    jump: false, sprint: false, sneak: false,
    swim: false, glide: false, fly: false, ascend: false, descend: false,
  };

  private readonly PHYSICS_TIMESTEP = 0.05;

  constructor(options: BotOptions) {
    super();
    this.setMaxListeners(64);

    this.options = {
      host: options.host,
      port: options.port ?? 19132,
      username: options.username,
      offline: options.offline ?? true,
      version: options.version ?? "1.26.52",
      transport: options.transport ?? "nethernet",
      auth: options.auth ?? (options.offline ? "offline" : "microsoft"),
      viewDistance: options.viewDistance ?? 8,
      tickRate: options.tickRate ?? 50,
      enablePhysics: options.enablePhysics ?? true,
      maxCatchupTicks: options.maxCatchupTicks ?? 4,
      clientId: options.clientId,
      createPeerConnection: options.createPeerConnection,
      strictWebRTC: options.strictWebRTC ?? false,
      signalingUrl: options.signalingUrl,
      networkId: options.networkId,
      requireServerIdentity: options.requireServerIdentity ?? false,
      identityDomain: options.identityDomain ?? "",
      maxRetries: options.maxRetries ?? 4,
      retryBaseMs: options.retryBaseMs ?? 350,
      iceGatherTimeoutMs: options.iceGatherTimeoutMs ?? 2200,
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? 0,
      signalingTimeoutMs: options.signalingTimeoutMs ?? 8000,
      autoReconnect: options.autoReconnect ?? false,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      reconnectBaseMs: options.reconnectBaseMs ?? 20000,
    } as Required<BotOptions>;

    this.username = this.options.username;
    this.pluginLoader = new PluginLoader(this);

    this.world = new World();
    this.pathfinder = new Pathfinder(this.world, {
      maxNodes: 20000, allowDiagonal: true, jumpHeight: 1, fallHeight: 4, avoidLiquid: true, enableCache: true,
    });
    this.pathFollower = new PathFollower(this, { sprint: true, jumpObstacles: true, humanized: true, pauseChance: 0.035 });
    this.agent = new Agent(this);
    this.agent.attachPathfinder(this.pathfinder);
    this.inventory = new Inventory();
    this.combat = new Combat(this);
    this.windows = new WindowManager();
    this.physicsEngine = new PhysicsEngine(this.world);
    this.pvp = new PvP(this);
    this.autoEat = new AutoEat(this);
    this.collect = new CollectBlock(this);
    this.tools = new ToolManager(this);
    this.stateMachine = new StateMachine();
    this.tasks = createTaskQueue(this);
    this.farm = createFarm(this);
    this.scripts = createScriptRunner(this);
  }

  // ═══════════════════════════════════════════════════════════
  // Connection
  // ═══════════════════════════════════════════════════════════

  async connect(): Promise<void> {
    if (this.connectInFlight) {
      console.warn(`[${AETHER_NAME}] connect already in flight — skipped`);
      return;
    }
    if (this.connected) throw new Error("Already connected");
    this.connectInFlight = true;
    try {
    await this.connectInner();
    } finally {
      this.connectInFlight = false;
    }
  }

  private async connectInner(): Promise<void> {

    const wantOnline = this.options.auth === "microsoft" || this.options.offline === false;
    const xbox = new XboxAuth({
      username: this.options.username,
      offline: !wantOnline,
      clientId: this.options.clientId,
      refreshToken: (this.options as any).refreshToken,
      persistTokens: (this.options as any).persistTokens ?? true,
      cacheDir: (this.options as any).authCacheDir,
      fallbackOffline: true,
    });
    this.authResult = await xbox.authenticate();
    this.username = this.authResult.username;

    console.log(`[${AETHER_NAME} v${AETHER_VERSION}] ${this.username} → ${this.options.host}:${this.options.port}`);
    console.log(`[${AETHER_NAME}] auth=${wantOnline ? "microsoft" : "offline"} transport=${this.options.transport} protocol=${TARGET_PROTOCOL}`);

    this.transport = new NetherNetTransport({
      host: this.options.host,
      port: this.options.port,
      offline: this.options.offline,
      networkId: (this.options as any).networkId,
      createPeerConnection: this.options.createPeerConnection,
      strictWebRTC: this.options.strictWebRTC,
      signalingUrl: this.options.signalingUrl,
      identityToken: this.authResult?.multiplayerToken,
      identityPrivateKeyPem: this.authResult?.keyPair?.privateKeyPem,
      identityDomain: this.options.identityDomain,
      requireServerIdentity: this.options.requireServerIdentity,
      maxRetries: this.options.maxRetries,
      retryBaseMs: this.options.retryBaseMs,
      iceGatherTimeoutMs: this.options.iceGatherTimeoutMs,
      healthCheckIntervalMs: this.options.healthCheckIntervalMs,
      signalingTimeoutMs: this.options.signalingTimeoutMs,
    });
    this.transport.on("error", (e) => this.emit("error", e));
    this.transport.on("disconnected", (r) => {
      this.connected = false;
      this.emit("disconnect", r);
      this.scheduleReconnect(String(r ?? "transport disconnected"));
    });
    this.transport.on("stale", (info) => {
      console.warn(`[${AETHER_NAME}] Transport stale:`, info);
    });

    this.protocol = new ProtocolHandler(
      this.transport,
      this.username,
      this.authResult?.offline ?? this.options.offline,
      this.authResult,
      this.options.viewDistance
    );

    this.protocol.on("start_game", (data) => {
      this.game = {
        gamemode: data.gamemode ?? 0,
        difficulty: 1,
        dimension: data.dimension ?? 0,
        spawn: data.spawn ?? { x: 0.5, y: 65, z: 0.5 },
        time: data.time ?? 0,
        raining: false,
        levelName: data.levelName,
      };
    });

    this.protocol.on("spawn", () => {
      const spawn = this.game?.spawn ?? { x: 0.5, y: 65, z: 0.5 };
      this.entity = {
        id: this.protocol!.entityId,
        type: "player",
        username: this.username,
        position: { ...spawn },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        onGround: true,
        health: 20,
      };
      this.players.set(this.username, this.entity);
      this.isAlive = true;
      this.emit("inject_allowed");
      this.emit("spawn");
      if (this.options.enablePhysics) this.startPhysicsLoop();
    });

    this.protocol.on("chat", (data) => {
      this.emit("chat", data?.sourceName ?? "?", data?.message ?? "");
    });
    this.protocol.on("disconnect", (reason) => this.emit("disconnect", reason));
    this.protocol.on("health", (data: any) => {
      if (typeof data?.health === "number") this.health = data.health;
      if (typeof data?.food === "number") this.food = data.food;
      this.emit("health");
      if (this.health <= 0) {
        this.isAlive = false;
        this.emit("death");
      }
    });

    await this.transport.connect();
    this.connected = true;

    // Real BDS session (NetherNet → login → spawn → PlayerAuthInput)
    this.session = new BDSSession({
      transport: this.transport,
      username: this.username,
      offline: this.authResult?.offline ?? this.options.offline,
      auth: this.authResult,
      viewDistance: this.options.viewDistance,
      world: this.world,
      inventory: this.inventory,
    });

    this.session.on("start_game", (data) => {
      this.game = {
        gamemode: data.gamemode ?? 0,
        difficulty: 1,
        dimension: data.dimension ?? 0,
        spawn: data.spawn ?? { x: 0.5, y: 65, z: 0.5 },
        time: data.time ?? 0,
        raining: false,
        levelName: data.levelName,
      };
    });

    this.session.on("spawn", () => {
      const spawn = this.session?.pos ?? this.game?.spawn ?? { x: 0.5, y: 65, z: 0.5 };
      this.entity = {
        id: 1,
        type: "player",
        username: this.username,
        position: { ...spawn },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        onGround: true,
        health: 20,
      };
      this.players.set(this.username, this.entity);
      this.isAlive = true;
      this.emit("inject_allowed");
      this.emit("spawn");
      if (this.options.enablePhysics) this.startPhysicsLoop();
    });

    this.session.on("chat", (data) => {
      this.emit("chat", data?.sourceName ?? "?", data?.message ?? "");
    });
    this.session.on("disconnect", (reason) => {
      this.emit("disconnect", reason);
      this.scheduleReconnect(String(reason ?? "session disconnect"));
    });
    this.session.on("health", (data) => {
      if (typeof data?.health === "number") this.health = data.health;
      this.emit("health");
    });
    this.session.on("inventory", (data) => this.emit("inventory", data));
    this.session.on("entity_add", (data) => {
      const id = Number(data.id) || 0;
      const pos = data.position ?? { x: 0, y: 0, z: 0 };
      const ent = {
        id,
        type: String(data.type ?? "unknown"),
        position: { ...pos },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: data.yaw ?? 0,
        pitch: data.pitch ?? 0,
        onGround: true,
      };
      this.entities.set(id, ent);
      this.entityIndex.upsert({ id, x: pos.x, y: pos.y, z: pos.z, ref: ent });
      this.emit("entitySpawn", ent);
    });
    this.session.on("player_add", (data) => {
      const id = Number(data.id) || 0;
      const pos = data.position ?? { x: 0, y: 0, z: 0 };
      const ent = {
        id,
        type: "player",
        username: data.username,
        position: { ...pos },
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        onGround: true,
      };
      this.entities.set(id, ent);
      this.players.set(data.username ?? `player_${id}`, ent);
      this.entityIndex.upsert({ id, x: pos.x, y: pos.y, z: pos.z, ref: ent });
      this.emit("entitySpawn", ent);
    });
    this.session.on("entity_remove", (id) => {
      this.removeEntity(Number(id));
    });
    this.session.on("container_open", (data) => {
      this.emit("windowOpen", data);
    });
    this.session.on("container_close", (id) => {
      this.windows.close(Number(id));
      this.emit("windowClose", id);
    });

    this.emit("login");
    await this.session.startLogin();
    // Successful connect resets reconnect counter
    this.reconnectAttempt = 0;
  }

  async disconnect(reason = "Client quit"): Promise<void> {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.connected) return;
    this.pathFollower.stop();
    this.stopPhysicsLoop();
    this.agent.stop();
    await this.transport?.disconnect(reason);
    this.connected = false;
    this.emit("disconnect", reason);
  }

  /**
   * Schedule an automatic reconnect if enabled and the disconnect was not intentional.
   */
  private scheduleReconnect(reason: string): void {
    if (this.intentionalDisconnect) return;
    if (!this.options.autoReconnect) return;
    if (this.reconnectTimer || this.connectInFlight) {
      console.log(`[${AETHER_NAME}] reconnect coalesced (${reason})`);
      return;
    }

    const max = this.options.maxReconnectAttempts;
    if (max > 0 && this.reconnectAttempt >= max) {
      console.error(`[${AETHER_NAME}] Max reconnect attempts (${max}) reached — giving up`);
      this.emit("error", new Error(`Max reconnect attempts reached after: ${reason}`));
      return;
    }

    this.reconnectAttempt += 1;
    const delay = this.options.reconnectBaseMs * Math.pow(2, Math.min(this.reconnectAttempt - 1, 5));
    console.log(`[${AETHER_NAME}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt}${max ? `/${max}` : ""}) — ${reason}`);
    this.emit("reconnecting", this.reconnectAttempt, delay);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        const old = this.transport;
        this.intentionalDisconnect = true;
        try { old?.removeAllListeners(); } catch { /* */ }
        try { await old?.disconnect("reconnect"); } catch { /* */ }
        this.intentionalDisconnect = false;
        this.session = null;
        this.protocol = null;
        this.transport = null;
        this.connected = false;
        await this.connect();
        this.emit("reconnected", this.reconnectAttempt);
        console.log(`[${AETHER_NAME}] Reconnected successfully (attempt ${this.reconnectAttempt})`);
      } catch (err: any) {
        console.error(`[${AETHER_NAME}] Reconnect failed:`, err?.message ?? err);
        this.scheduleReconnect(err?.message ?? "reconnect failed");
      }
    }, delay);
  }

  // ═══════════════════════════════════════════════════════════
  // Plugins (optional extensions only – core is direct)
  // ═══════════════════════════════════════════════════════════

  loadPlugin(p: Plugin, immediate = true) { this.pluginLoader.loadPlugin(p, immediate); }
  loadPlugins(ps: Plugin[], immediate = true) { this.pluginLoader.loadPlugins(ps, immediate); }
  hasPlugin(p: Plugin) { return this.pluginLoader.hasPlugin(p); }

  // ═══════════════════════════════════════════════════════════
  // Chat / controls / look
  // ═══════════════════════════════════════════════════════════

  chat(msg: string) {
    if (!this.connected) throw new Error("Not connected");
    this.session?.chat(msg);
  }

  whisper(user: string, msg: string) {
    this.chat(`/msg ${user} ${msg}`);
  }

  setControlState(
    control:
      | "forward" | "back" | "left" | "right"
      | "jump" | "sneak" | "sprint"
      | "swim" | "glide" | "fly" | "ascend" | "descend",
    state: boolean
  ) {
    this.controlState[control] = state;
    // Forward controls to the live BDS session so PlayerAuthInput picks them up
    if (this.session && typeof (this.session as any).setControls === "function") {
      (this.session as any).setControls({ ...this.controlState });
    }
  }

  getControlState(control: string): boolean {
    return !!this.controlState[control];
  }

  lookAt(pos: Vec3) {
    if (!this.entity) return;
    const dx = pos.x - this.entity.position.x;
    const dy = pos.y - this.entity.position.y;
    const dz = pos.z - this.entity.position.z;
    this.entity.yaw = Math.atan2(-dx, -dz);
    this.entity.pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
  }

  // ═══════════════════════════════════════════════════════════
  // Entities (core)
  // ═══════════════════════════════════════════════════════════

  nearestEntity(match: (e: Entity) => boolean = () => true, maxDist = 96): Entity | null {
    const pos = this.entity?.position;
    if (!pos) return null;
    globalPerf.incr("nearestEntity");
    // Spatial index first (fast path when entities are indexed)
    if (this.entityIndex.size > 0) {
      const hit = this.entityIndex.nearest(pos.x, pos.y, pos.z, maxDist, (p) => {
        if (p.id === this.entity?.id) return false;
        return match(p.ref as Entity);
      });
      if (hit) return hit.ref as Entity;
    }
    let best: Entity | null = null;
    let bestD = maxDist * maxDist;
    for (const e of this.entities.values()) {
      if (e.id === this.entity?.id) continue;
      if (!match(e)) continue;
      const d = distanceSquared(pos, e.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  nearestHostile(): Entity | null {
    return this.nearestEntity((e) => {
      const typeId = (e.metadata as any)?.typeId ?? e.id;
      return EntityRegistry.isHostile(typeId) || e.type === "zombie" || e.type === "creeper";
    });
  }

  entityAtCursor(maxDist = 3.5): Entity | null {
    return this.nearestEntity((e) => {
      if (!this.entity) return false;
      return distance(this.entity.position, e.position) <= maxDist;
    });
  }

  createEntity(typeId: number, position: Vec3, extra: Partial<Entity> = {}): Entity {
    const def = EntityRegistry.get(typeId);
    const ent: Entity = {
      id: extra.id ?? typeId,
      type: def.name,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      onGround: true,
      health: def.maxHealth,
      metadata: { typeId, width: def.width, height: def.height, category: def.category },
      ...extra,
    };
    this.entities.set(ent.id, ent);
    this.entityIndex.upsert({
      id: ent.id,
      x: ent.position.x,
      y: ent.position.y,
      z: ent.position.z,
      ref: ent,
    });
    this.emit("entitySpawn", ent);
    return ent;
  }

  /** Keep spatial index in sync when an entity moves */
  updateEntityPosition(id: number, position: Vec3) {
    const e = this.entities.get(id);
    if (!e) return;
    e.position = { ...position };
    this.entityIndex.upsert({ id, x: position.x, y: position.y, z: position.z, ref: e });
  }

  removeEntity(id: number) {
    const e = this.entities.get(id);
    if (!e) return;
    this.entities.delete(id);
    this.entityIndex.remove(id);
    this.emit("entityGone", e);
  }

  // ═══════════════════════════════════════════════════════════
  // Blocks (core)
  // ═══════════════════════════════════════════════════════════

  blockAt(pos: Vec3): Block {
    const x = Math.floor(pos.x), y = Math.floor(pos.y), z = Math.floor(pos.z);
    return Block.fromWorld(this.world, x, y, z);
  }

  findBlock(opts: {
    matching: number | number[] | ((id: number) => boolean);
    maxDistance?: number;
  }): Vec3 | null {
    if (!this.entity) return null;
    const match = typeof opts.matching === "function"
      ? opts.matching
      : Array.isArray(opts.matching)
        ? (id: number) => (opts.matching as number[]).includes(id)
        : (id: number) => id === opts.matching;
    return this.world.findBlock(this.entity.position, match, opts.maxDistance ?? 32);
  }

  canDigBlock(blockId: number): boolean {
    const d = BlockRegistry.get(blockId);
    return d.solid && isFinite(d.hardness);
  }

  digTime(blockId: number): number {
    return BlockRegistry.digTimeMs(blockId);
  }

  async dig(pos: Vec3, _forceLook = true): Promise<void> {
    if (!this.entity) throw new Error("Not spawned");
    const x = Math.floor(pos.x), y = Math.floor(pos.y), z = Math.floor(pos.z);
    const id = this.world.getBlock(x, y, z);
    if (!this.canDigBlock(id)) throw new Error(`Cannot dig ${BlockRegistry.get(id).name}`);
    this.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    this.session?.digStart(pos);
    const ms = this.digTime(id);
    await new Promise((r) => setTimeout(r, Math.min(ms, 200)));
    this.session?.digFinish(pos);
    this.world.setBlock(x, y, z, 0);
    this.emit("blockUpdate", id, 0, { x, y, z });
  }

  async placeBlock(referencePos: Vec3, faceVector: Vec3): Promise<void> {
    const x = Math.floor(referencePos.x + faceVector.x);
    const y = Math.floor(referencePos.y + faceVector.y);
    const z = Math.floor(referencePos.z + faceVector.z);
    const held = this.inventory.heldItem;
    const id = held?.networkId ?? 1;
    this.session?.placeBlock({ x, y, z }, 1, id);
    this.world.setBlock(x, y, z, id);
    this.emit("blockUpdate", 0, id, { x, y, z });
  }

  // ═══════════════════════════════════════════════════════════
  // Inventory (core)
  // ═══════════════════════════════════════════════════════════

  async equip(itemOrId: number | { networkId: number }, destination: "hand" | "off-hand" = "hand") {
    const id = typeof itemOrId === "number" ? itemOrId : itemOrId.networkId;
    const found = this.inventory.findItem((it) => it.networkId === id);
    if (!found) throw new Error(`Item ${id} not in inventory`);
    const slot = Math.min(8, found.slot);
    this.inventory.selectHotbar(slot);
    if (this.session && typeof (this.session as any).sendMobEquipment === "function") {
      (this.session as any).sendMobEquipment(slot, {
        networkId: found.item.networkId,
        count: found.item.count,
      });
    }
  }

  /**
   * Activate the currently held item (eat, drink, use tool in air).
   * Sends InventoryTransaction UseItem (click air) on the live BDS session.
   */
  activateItem(releaseAfterMs = 1600): boolean {
    const held = this.inventory.heldItem;
    if (!held || held.networkId === 0) {
      console.warn("[Bot] activateItem: empty hand");
      return false;
    }
    if (!this.session || typeof this.session.useItem !== "function") {
      console.warn("[Bot] activateItem: no session");
      return false;
    }
    this.session.useItem({
      hotbarSlot: this.inventory.selectedSlot,
      itemInHand: {
        networkId: held.networkId,
        count: held.count,
        name: held.name,
      },
      releaseAfterMs,
    });
    return true;
  }

  /** Eat food via AutoEat (real UseItem packets). */

  /**
   * Craft using RecipeRegistry. Updates local inventory always;
   * on a live session also sends ItemStackRequest when possible.
   */
  craft(recipeId: string): boolean {
    const recipe = RecipeRegistry.get(recipeId);
    if (!recipe) {
      console.warn(`[Bot] Unknown recipe ${recipeId}`);
      return false;
    }
    if (!RecipeRegistry.canCraft(recipe, this.inventory)) {
      console.warn(`[Bot] Cannot craft ${recipeId} — missing ingredients`);
      return false;
    }
    // Live path: notify server (recipe network id unknown → creative-style create result)
    if (this.session && typeof (this.session as any).sendItemStackRequest === "function") {
      try {
        (this.session as any).sendItemStackRequest([
          { type: "craft_creative", itemId: recipe.result.networkId },
        ]);
      } catch (e) {
        console.warn("[Bot] ItemStackRequest craft failed", e);
      }
    }
    const ok = RecipeRegistry.craft(recipe, this.inventory);
    if (ok) console.log(`[Bot] Crafted ${recipeId}`);
    return ok;
  }

  openChest(title = "Chest") {
    return this.windows.openChest(title);
  }

  openCrafting() {
    return this.windows.openCrafting();
  }

  async eat(force = false): Promise<boolean> {
    return this.autoEat.eat({ force });
  }

  // ═══════════════════════════════════════════════════════════
  // Pathfinding (core)
  // ═══════════════════════════════════════════════════════════

  async goTo(goal: GoalInput): Promise<Vec3[]> {
    if (!this.entity) return [];
    const path = this.pathfinder.findPath(this.entity.position, goal);
    if (path.length) this.pathFollower.follow(path);
    return path;
  }

  stopPath() {
    this.pathFollower.stop();
  }

  // ═══════════════════════════════════════════════════════════
  // Game helpers
  // ═══════════════════════════════════════════════════════════

  get gameMode() { return this.game?.gamemode ?? 0; }
  get dimension() {
    const d = this.game?.dimension ?? 0;
    return d === 1 ? "nether" : d === 2 ? "end" : "overworld";
  }
  get timeOfDay() { return this.game?.time ?? 0; }
  get isDay() { const t = this.timeOfDay % 24000; return t < 13000; }
  get isRaining() { return this.game?.raining ?? false; }
  get spawnPoint(): Vec3 { return this.game?.spawn ?? { x: 0, y: 64, z: 0 }; }


  // ═══════════════════════════════════════════════════════════
  // Utilities / missing high-level features
  // ═══════════════════════════════════════════════════════════

  async waitFor<K extends keyof BotEventMap>(
    event: K,
    timeoutMs = 30000
  ): Promise<Parameters<BotEventMap[K]>> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout waiting for ${String(event)}`)), timeoutMs);
      this.once(event, ((...args: any[]) => {
        clearTimeout(t);
        resolve(args as any);
      }) as any);
    });
  }

  async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  runCommand(command: string) {
    this.chat(command.startsWith("/") ? command : `/${command}`);
  }

  async respawn() {
    this.isAlive = true;
    this.health = 20;
    if (this.entity) {
      this.entity.position = { ...this.spawnPoint };
      this.entity.health = 20;
    }
    this.emit("spawn");
  }

  quit(reason = "quit") {
    return this.disconnect(reason);
  }

  // ═══════════════════════════════════════════════════════════
  // Physics
  // ═══════════════════════════════════════════════════════════

  private startPhysicsLoop() {
    this.lastPhysicsTime = performance.now();
    this.timeAccumulator = 0;
    this.physicsTimer = setInterval(() => this.doPhysics(), this.options.tickRate);
  }

  private stopPhysicsLoop() {
    if (this.physicsTimer) {
      clearInterval(this.physicsTimer);
      this.physicsTimer = null;
    }
  }

  private doPhysics() {
    const now = performance.now();
    const dt = (now - this.lastPhysicsTime) / 1000;
    this.lastPhysicsTime = now;
    this.timeAccumulator += dt;
    let steps = 0;
    const maxCatch = this.options.maxCatchupTicks;

    while (this.timeAccumulator >= this.PHYSICS_TIMESTEP && steps < maxCatch) {
      this.tickPhysics();
      this.timeAccumulator -= this.PHYSICS_TIMESTEP;
      steps++;
    }
    this.timeAccumulator %= this.PHYSICS_TIMESTEP;
  }

  private tickPhysics() {
    // Live BDS session owns position, look, and controls.
    // Local physics has no solids here and was writing a void Y back into the session.
    if (this.session?.isSpawned && this.entity) {
      const live = this.session.pos;
      if (live && Number.isFinite(live.y) && live.y > -60 && live.y < 360) {
        this.entity.position = { x: live.x, y: live.y, z: live.z };
        this.entity.onGround = !!this.session.grounded;
        this.entity.velocity = { x: 0, y: 0, z: 0 };
      }
      this.emit("physicsTick");
      return;
    }
    if (this.entity) {
      const controls: PhysControls = {
        forward: this.getControlState("forward"),
        back: this.getControlState("back"),
        left: this.getControlState("left"),
        right: this.getControlState("right"),
        jump: this.getControlState("jump"),
        sprint: this.getControlState("sprint"),
        sneak: this.getControlState("sneak"),
      };
      const prev = this.entity as any;
      const next = this.physicsEngine.simulate(
        {
          position: Vec3Vec.from(this.entity.position),
          velocity: Vec3Vec.from(this.entity.velocity),
          onGround: this.entity.onGround,
          yaw: this.entity.yaw,
          pitch: this.entity.pitch,
          inWater: prev.inWater,
          inLava: prev.inLava,
          onClimbable: prev.onClimbable,
        },
        controls,
        this.PHYSICS_TIMESTEP
      );
      this.entity.position = { x: next.position.x, y: next.position.y, z: next.position.z };
      this.entity.velocity = { x: next.velocity.x, y: next.velocity.y, z: next.velocity.z };
      this.entity.onGround = next.onGround;
      prev.inWater = next.inWater;
      prev.inLava = next.inLava;
      prev.onClimbable = next.onClimbable;
      this.session?.setPosition(this.entity.position);
      this.session?.setLook(this.entity.yaw, this.entity.pitch);
      this.session?.setControls({ ...controls });
      this.emit("move");
    }
    this.emit("physicsTick");
  }

  /** Block under crosshair (physics raycast) */
  raycastBlock(maxDist = 5) {
    if (!this.entity) return null;
    return this.physicsEngine.raycast(
      { x: this.entity.position.x, y: this.entity.position.y + 1.62, z: this.entity.position.z },
      this.entity.yaw,
      this.entity.pitch,
      maxDist
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Typed events
  // ═══════════════════════════════════════════════════════════

  on<K extends keyof BotEventMap>(event: K, listener: BotEventMap[K]): this {
    return super.on(event, listener);
  }
  once<K extends keyof BotEventMap>(event: K, listener: BotEventMap[K]): this {
    return super.once(event, listener);
  }
  emit<K extends keyof BotEventMap>(event: K, ...args: Parameters<BotEventMap[K]>): boolean {
    return super.emit(event, ...args);
  }
}

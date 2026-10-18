/**
 * Protocol Handler – login with Microsoft/Xbox or offline support
 */

import { EventEmitter } from "events";
import {
  PacketId,
  createRequestNetworkSettings,
  createLogin,
  createClientToServerHandshake,
  createResourcePackClientResponse,
  createSetLocalPlayerAsInitialized,
  createText,
  createPlayerAuthInput,
  createRequestChunkRadius,
  type Packet,
} from "./packets";
import type { NetherNetTransport } from "../transport/nethernet";
import type { AuthResult } from "../auth/XboxAuth";
import { encodeGamePacket } from "./codec";

type ProtocolState =
  | "idle" | "network_settings" | "login" | "handshake"
  | "resource_packs" | "start_game" | "spawn" | "play" | "disconnected";

export class ProtocolHandler extends EventEmitter {
  private transport: NetherNetTransport;
  private username: string;
  private offline: boolean;
  private auth: AuthResult | null = null;
  private state: ProtocolState = "idle";
  private runtimeEntityId = 1;
  private tick = 0n;
  private viewDistance = 8;

  constructor(
    transport: NetherNetTransport,
    username: string,
    offline = true,
    auth: AuthResult | null = null,
    viewDistance = 8
  ) {
    super();
    this.transport = transport;
    this.username = username;
    this.offline = offline;
    this.auth = auth;
    this.viewDistance = viewDistance;
    this.transport.on("data", (buf) => this.onRaw(buf));
  }

  setAuth(auth: AuthResult) {
    this.auth = auth;
    this.offline = auth.offline;
    this.username = auth.username;
  }

  async startLogin(): Promise<void> {
    this.state = "network_settings";
    console.log("[Protocol] → RequestNetworkSettings");
    this.send(createRequestNetworkSettings());

    await this.delay(20);
    this.handlePacket({
      id: PacketId.NetworkSettings,
      name: "network_settings",
      data: { compressionThreshold: 1, compressionAlgorithm: 0 },
    });
  }

  private onRaw(_buf: Buffer): void {
    // Real: decompress + decode varint id + body
  }

  handlePacket(packet: Packet): void {
    switch (packet.id) {
      case PacketId.NetworkSettings:
        console.log("[Protocol] ← NetworkSettings");
        this.state = "login";
        this.send(createLogin({
          username: this.username,
          offline: this.offline,
          chain: this.auth?.chain,
          extra: {
            multiplayerToken: this.auth?.multiplayerToken,
            identityPublicKey: this.auth?.keyPair?.x509,
          },
        }));
        queueMicrotask(() => {
          this.handlePacket({ id: PacketId.ResourcePacksInfo, name: "resource_packs_info", data: {} });
        });
        break;

      case PacketId.ServerToClientHandshake:
        console.log("[Protocol] ← Handshake");
        this.state = "handshake";
        this.send(createClientToServerHandshake());
        break;

      case PacketId.ResourcePacksInfo:
      case PacketId.ResourcePackStack:
        console.log("[Protocol] ← Resource packs");
        this.state = "resource_packs";
        this.send(createResourcePackClientResponse("completed"));
        queueMicrotask(() => {
          this.handlePacket({
            id: PacketId.StartGame,
            name: "start_game",
            data: {
              runtimeEntityId: 1,
              gamemode: 0,
              dimension: 0,
              spawn: { x: 0.5, y: 65, z: 0.5 },
              time: 1000,
              levelName: "Bedrock Level",
            },
          });
        });
        break;

      case PacketId.StartGame:
        console.log("[Protocol] ← StartGame");
        this.state = "start_game";
        this.runtimeEntityId = packet.data.runtimeEntityId ?? 1;
        this.emit("start_game", packet.data);
        this.send(createSetLocalPlayerAsInitialized(this.runtimeEntityId));
        this.send(createRequestChunkRadius(this.viewDistance));
        queueMicrotask(() => {
          this.handlePacket({
            id: PacketId.PlayStatus,
            name: "play_status",
            data: { status: "player_spawn" },
          });
        });
        break;

      case PacketId.PlayStatus:
        if (packet.data?.status === "player_spawn" || packet.data?.status === 3) {
          this.state = "play";
          console.log("[Protocol] ← Player Spawn");
          this.emit("spawn");
        }
        break;

      case PacketId.Text:
        this.emit("chat", packet.data);
        break;

      case PacketId.Disconnect:
        this.state = "disconnected";
        this.emit("disconnect", packet.data?.message ?? "Disconnected by server");
        break;

      case PacketId.InventoryContent:
      case PacketId.InventorySlot:
        this.emit("inventory", packet);
        break;

      case PacketId.UpdateAttributes:
      case PacketId.SetHealth:
        this.emit("health", packet.data);
        break;

      case PacketId.AddPlayer:
      case PacketId.AddEntity:
        this.emit("entity_spawn", packet.data);
        break;

      case PacketId.RemoveEntity:
        this.emit("entity_remove", packet.data);
        break;

      case PacketId.LevelChunk:
      case PacketId.SubChunk:
        this.emit("chunk", packet);
        break;

      default:
        this.emit("packet", packet);
    }
  }

  sendChat(message: string): void {
    this.send(createText(message, this.username, this.auth?.xuid ?? ""));
  }

  sendMovement(position: { x: number; y: number; z: number }, yaw: number, pitch: number, inputData = 0): void {
    this.tick += 1n;
    const pkt = createPlayerAuthInput({ position, yaw, pitch, inputData, tick: Number(this.tick) });
    this.send(pkt);
  }

  private send(packet: Packet): void {
    try {
      const framed = encodeGamePacket(packet.id, packet.data);
      this.transport.send(framed);
    } catch {
      this.transport.send(Buffer.from(JSON.stringify(packet)));
    }
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  get currentState() { return this.state; }
  get entityId() { return this.runtimeEntityId; }
}

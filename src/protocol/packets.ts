/**
 * Protocol 2193 – Large packet surface for BDS 1.26.52.3
 * Covers login, auth, movement, inventory, combat, world, entities, UI, scores, etc.
 * Not every packet body is fully decoded – structure is ready for progressive completion.
 */

export const ProtocolVersion = 2193 as const;

export enum PacketId {
  // Login / network
  Login                       = 0x01,
  PlayStatus                  = 0x02,
  ServerToClientHandshake     = 0x03,
  ClientToServerHandshake     = 0x04,
  Disconnect                  = 0x05,
  ResourcePacksInfo           = 0x06,
  ResourcePackStack           = 0x07,
  ResourcePackClientResponse  = 0x08,
  Text                        = 0x09,
  SetTime                     = 0x0a,
  StartGame                   = 0x0b,
  AddPlayer                   = 0x0c,
  AddEntity                   = 0x0d,
  RemoveEntity                = 0x0e,
  AddItemEntity               = 0x0f,
  TakeItemEntity              = 0x11,
  MoveEntityAbsolute          = 0x12,
  MovePlayer                  = 0x13,
  RiderJump                   = 0x14,
  UpdateBlock                 = 0x15,
  AddPainting                 = 0x16,
  TickSync                    = 0x17,
  LevelSoundEventOld          = 0x18,
  LevelEvent                  = 0x19,
  BlockEvent                  = 0x1a,
  EntityEvent                 = 0x1b,
  MobEffect                   = 0x1c,
  UpdateAttributes            = 0x1d,
  InventoryTransaction        = 0x1e,
  MobEquipment                = 0x1f,
  MobArmorEquipment           = 0x20,
  Interact                    = 0x21,
  BlockPickRequest            = 0x22,
  EntityPickRequest           = 0x23,
  PlayerAction                = 0x24,
  HurtArmor                   = 0x26,
  SetEntityData               = 0x27,
  SetEntityMotion             = 0x28,
  SetEntityLink               = 0x29,
  SetHealth                   = 0x2a,
  SetSpawnPosition            = 0x2b,
  Animate                     = 0x2c,
  Respawn                     = 0x2d,
  ContainerOpen               = 0x2e,
  ContainerClose              = 0x2f,
  PlayerHotbar                = 0x30,
  InventoryContent            = 0x31,
  InventorySlot               = 0x32,
  ContainerSetData           = 0x33,
  CraftingData                = 0x34,
  CraftingEvent               = 0x35,
  GuiDataPickItem             = 0x36,
  AdventureSettings           = 0x37,
  BlockEntityData             = 0x38,
  PlayerInput                 = 0x39,
  LevelChunk                  = 0x3a,
  SetCommandsEnabled          = 0x3b,
  SetDifficulty               = 0x3c,
  ChangeDimension             = 0x3d,
  SetPlayerGameType           = 0x3e,
  PlayerList                  = 0x3f,
  SimpleEvent                 = 0x40,
  Event                       = 0x41,
  SpawnExperienceOrb          = 0x42,
  ClientboundMapItemData      = 0x43,
  MapInfoRequest              = 0x44,
  RequestChunkRadius          = 0x45,
  ChunkRadiusUpdate           = 0x46,
  ItemFrameDropItem           = 0x47,
  GameRulesChanged            = 0x48,
  Camera                      = 0x49,
  BossEvent                   = 0x4a,
  ShowCredits                 = 0x4b,
  AvailableCommands           = 0x4c,
  CommandRequest              = 0x4d,
  CommandBlockUpdate          = 0x4e,
  CommandOutput               = 0x4f,
  UpdateTrade                 = 0x50,
  UpdateEquip                 = 0x51,
  ResourcePackDataInfo        = 0x52,
  ResourcePackChunkData       = 0x53,
  ResourcePackChunkRequest    = 0x54,
  Transfer                    = 0x55,
  PlaySound                   = 0x56,
  StopSound                   = 0x57,
  SetTitle                    = 0x58,
  AddBehaviorTree             = 0x59,
  StructureBlockUpdate        = 0x5a,
  ShowStoreOffer              = 0x5b,
  PurchaseReceipt             = 0x5c,
  PlayerSkin                  = 0x5d,
  SubClientLogin              = 0x5e,
  AutomationClientConnect     = 0x5f,
  SetLastHurtBy               = 0x60,
  BookEdit                    = 0x61,
  NpcRequest                  = 0x62,
  PhotoTransfer               = 0x63,
  ModalFormRequest            = 0x64,
  ModalFormResponse           = 0x65,
  ServerSettingsRequest       = 0x66,
  ServerSettingsResponse      = 0x67,
  ShowProfile                 = 0x68,
  SetDefaultGameType          = 0x69,
  RemoveObjective             = 0x6a,
  SetDisplayObjective         = 0x6b,
  SetScore                    = 0x6c,
  LabTable                    = 0x6d,
  UpdateBlockSynced           = 0x6e,
  MoveEntityDelta             = 0x6f,
  SetScoreboardIdentity       = 0x70,
  SetLocalPlayerAsInitialized = 0x71,
  UpdateSoftEnum              = 0x72,
  NetworkStackLatency         = 0x73,
  ScriptCustomEvent           = 0x75,
  SpawnParticleEffect         = 0x76,
  AvailableEntityIdentifiers  = 0x77,
  LevelSoundEventV2           = 0x78,
  NetworkChunkPublisherUpdate = 0x79,
  BiomeDefinitionList         = 0x7a,
  LevelSoundEvent             = 0x7b,
  LevelEventGeneric           = 0x7c,
  LecternUpdate               = 0x7d,
  RemoveEntityPacket          = 0x80,
  ClientCacheStatus           = 0x81,
  OnScreenTextureAnimation    = 0x82,
  MapCreateLockedCopy         = 0x83,
  StructureTemplateDataExportRequest  = 0x84,
  StructureTemplateDataExportResponse = 0x85,
  UpdateBlockProperties       = 0x86,
  ClientCacheBlobStatus       = 0x87,
  ClientCacheMissResponse     = 0x88,
  EducationSettings           = 0x89,
  Emote                       = 0x8a,
  MultiplayerSettings         = 0x8b,
  SettingsCommand             = 0x8c,
  AnvilDamage                 = 0x8d,
  CompletedUsingItem          = 0x8e,
  NetworkSettings             = 0x8f,
  PlayerAuthInput             = 0x90,
  CreativeContent             = 0x91,
  PlayerEnchantOptions        = 0x92,
  ItemStackRequest            = 0x93,
  ItemStackResponse           = 0x94,
  PlayerArmorDamage           = 0x95,
  CodeBuilder                 = 0x96,
  UpdatePlayerGameType        = 0x97,
  EmoteList                   = 0x98,
  PositionTrackingDBServerBroadcast = 0x99,
  PositionTrackingDBClientRequest   = 0x9a,
  DebugInfo                   = 0x9b,
  PacketViolationWarning      = 0x9c,
  MotionPredictionHints       = 0x9d,
  AnimateEntity               = 0x9e,
  CameraShake                 = 0x9f,
  PlayerFog                   = 0xa0,
  CorrectPlayerMovePrediction = 0xa1,
  ItemComponent               = 0xa2,
  FilterText                  = 0xa3,
  ClientboundDebugRenderer    = 0xa4,
  SyncEntityProperty          = 0xa5,
  AddVolumeEntity             = 0xa6,
  RemoveVolumeEntity          = 0xa7,
  SimulationType              = 0xa8,
  NpcDialogue                 = 0xa9,
  EduUriResource              = 0xaa,
  CreatePhoto                 = 0xab,
  UpdateSubChunkBlocks        = 0xac,
  SubChunk                    = 0xae,
  SubChunkRequest             = 0xaf,
  PlayerStartItemCooldown      = 0xb0,
  ScriptMessage               = 0xb1,
  CodeBuilderSource           = 0xb2,
  TickingAreasLoadStatus      = 0xb3,
  DimensionData               = 0xb4,
  AgentActionEvent            = 0xb5,
  ChangeMobProperty           = 0xb6,
  LessonProgress              = 0xb7,
  RequestAbility              = 0xb8,
  RequestPermissions          = 0xb9,
  ToastRequest                = 0xba,
  UpdateAbilities             = 0xbb,
  UpdateAdventureSettings     = 0xbc,
  DeathInfo                   = 0xbd,
  EditorNetwork               = 0xbe,
  FeatureRegistry             = 0xbf,
  ServerStats                 = 0xc0,
  RequestNetworkSettings      = 0xc1,
  GameTestRequest             = 0xc2,
  GameTestResults             = 0xc3,
  UpdateClientInputLocks      = 0xc4,
  CameraPresets               = 0xc6,
  UnlockedRecipes             = 0xc7,
  CameraInstruction           = 0x12c,
  CompressedBiomeDefinitionList = 0x12d,
  TrimData                    = 0x12e,
  OpenSign                    = 0x12f,
  AgentAnimation              = 0x130,
  RefreshEntitlements         = 0x131,
  PlayerToggleCrafterSlotRequest = 0x132,
  SetPlayerInventoryOptions   = 0x133,
  SetHud                      = 0x134,
  AwardedDates                = 0x135,
  ClientboundCloseForm        = 0x136,
  ServerboundLoadingScreen    = 0x138,
  JigsawStructureData         = 0x139,
  CurrentStructureFeature     = 0x13a,
  ServerboundDiagnostics      = 0x13b,
  CameraAimAssist             = 0x13c,
  ContainerRegistryCleanup    = 0x13d,
  MovementEffect              = 0x13e,
  CameraAimAssistPresets      = 0x141,
  ClientCameraAimAssist       = 0x144,
  ClientMovementPredictionSync= 0x145,
  UpdateClientOptions         = 0x146,
  PlayerVideoStream           = 0x147,
}

export interface Packet {
  id: number;
  name: string;
  data: Record<string, any>;
}

// ── Factories (commonly used) ────────────────────────────

export function createRequestNetworkSettings(ver = ProtocolVersion): Packet {
  return { id: PacketId.RequestNetworkSettings, name: "request_network_settings", data: { clientNetworkVersion: ver } };
}

export function createLogin(opts: {
  username: string;
  offline?: boolean;
  protocol?: number;
  chain?: string[];
  extra?: Record<string, any>;
}): Packet {
  return {
    id: PacketId.Login,
    name: "login",
    data: {
      protocol: opts.protocol ?? ProtocolVersion,
      username: opts.username,
      offline: opts.offline ?? true,
      chain: opts.chain ?? [],
      ...opts.extra,
    },
  };
}

export function createClientToServerHandshake(): Packet {
  return { id: PacketId.ClientToServerHandshake, name: "client_to_server_handshake", data: {} };
}

export function createResourcePackClientResponse(status = "completed"): Packet {
  return { id: PacketId.ResourcePackClientResponse, name: "resource_pack_client_response", data: { responseStatus: status, resourcePackIds: [] } };
}

export function createSetLocalPlayerAsInitialized(runtimeEntityId = 1): Packet {
  return { id: PacketId.SetLocalPlayerAsInitialized, name: "set_local_player_as_initialized", data: { runtimeEntityId } };
}

export function createText(message: string, sourceName = "", xuid = ""): Packet {
  return {
    id: PacketId.Text, name: "text",
    data: { type: "chat", needsTranslation: false, sourceName, message, xuid, platformChatId: "" },
  };
}

export function createPlayerAuthInput(opts: {
  position: { x: number; y: number; z: number };
  yaw: number; pitch: number;
  inputData?: number; moveVecX?: number; moveVecZ?: number; tick?: number;
}): Packet {
  return {
    id: PacketId.PlayerAuthInput, name: "player_auth_input",
    data: {
      position: opts.position, yaw: opts.yaw, pitch: opts.pitch,
      inputData: opts.inputData ?? 0, inputMode: 1, playMode: 0,
      moveVecX: opts.moveVecX ?? 0, moveVecZ: opts.moveVecZ ?? 0,
      tick: opts.tick ?? 0,
    },
  };
}

export function createMovePlayer(opts: {
  runtimeEntityId: number;
  position: { x: number; y: number; z: number };
  pitch: number; yaw: number; headYaw: number;
  mode?: number; onGround?: boolean;
}): Packet {
  return {
    id: PacketId.MovePlayer, name: "move_player",
    data: { ...opts, mode: opts.mode ?? 0, onGround: opts.onGround ?? true, riddenRuntimeEntityId: 0, teleportCause: 0, entityType: 0, tick: 0 },
  };
}

export function createInventoryTransaction(opts: {
  transactionType: number; actions?: any[]; legacyRequestId?: number;
}): Packet {
  return {
    id: PacketId.InventoryTransaction, name: "inventory_transaction",
    data: { legacyRequestId: opts.legacyRequestId ?? 0, transactionType: opts.transactionType, actions: opts.actions ?? [] },
  };
}

export function createMobEquipment(opts: {
  runtimeEntityId: number; item: any; slot: number; selectedSlot: number; windowId?: number;
}): Packet {
  return { id: PacketId.MobEquipment, name: "mob_equipment", data: { windowId: 0, ...opts } };
}

export function createContainerClose(windowId: number): Packet {
  return { id: PacketId.ContainerClose, name: "container_close", data: { windowId, server: false } };
}

export function createPlayerAction(opts: {
  runtimeEntityId: number; action: number;
  position: { x: number; y: number; z: number };
  resultPosition?: { x: number; y: number; z: number }; face?: number;
}): Packet {
  return {
    id: PacketId.PlayerAction, name: "player_action",
    data: { resultPosition: opts.position, face: 0, ...opts },
  };
}

export function createAnimate(runtimeEntityId: number, actionId = 1): Packet {
  return { id: PacketId.Animate, name: "animate", data: { actionId, runtimeEntityId } };
}

export function createRequestChunkRadius(radius: number): Packet {
  return { id: PacketId.RequestChunkRadius, name: "request_chunk_radius", data: { chunkRadius: radius } };
}

export function createInteract(opts: {
  actionId: number; targetRuntimeEntityId: number;
  position?: { x: number; y: number; z: number };
}): Packet {
  return { id: PacketId.Interact, name: "interact", data: { position: { x: 0, y: 0, z: 0 }, ...opts } };
}

export function createCommandRequest(command: string): Packet {
  return {
    id: PacketId.CommandRequest, name: "command_request",
    data: { command, origin: { type: 0, uuid: "", requestId: "" }, internal: false, version: 0 },
  };
}

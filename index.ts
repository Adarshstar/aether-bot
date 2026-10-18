/**
 * Aether — public API (deduplicated, layered)
 */

// Core
export { AETHER_VERSION, AETHER_NAME, TARGET_BDS, TARGET_PROTOCOL, TARGET_TRANSPORT } from "./src/core/version";
export { Bot } from "./src/core/Bot";
export { createBot, createAetherBot } from "./src/core/createBot";
export type { BotOptions, Vec3, GameState, Plugin, Entity } from "./src/types";
export { PerfMonitor, globalPerf } from "./src/core/PerfMonitor";

// Math
export { Vec3 as Vec3Class } from "./src/math/Vec3";
export { SpatialIndex } from "./src/math/SpatialIndex";
export type { SpatialPoint } from "./src/math/SpatialIndex";

// World
export { World } from "./src/world/World";
export { Chunk } from "./src/world/Chunk";
export { Block } from "./src/block/Block";
export {
  decodeLevelChunkBody,
  encodeLevelChunkBody,
  decodeSubChunk,
  encodeSubChunk,
  applyLevelChunkToWorld,
  makeFlatChunk,
  decodePalettedStorage,
  encodePalettedStorage,
} from "./src/world/levelChunk";
export type { DecodedLevelChunk, DecodedSubChunk } from "./src/world/levelChunk";

// Pathfinding
export { Pathfinder } from "./src/pathfinding/Pathfinder";
export { PathFollower } from "./src/pathfinding/PathFollower";
export { MinHeap } from "./src/pathfinding/Heap";
export type { GoalInput } from "./src/pathfinding/Pathfinder";
export {
  Goal,
  GoalBlock,
  GoalNear,
  GoalXZ,
  GoalNearXZ,
  GoalY,
  GoalCompositeAny,
  GoalCompositeAll,
  GoalInvert,
  GoalFollow,
} from "./src/goals";

// Inventory / windows
export { Item } from "./src/item/Item";
export { Inventory } from "./src/inventory/Inventory";
export { Window, WindowManager } from "./src/windows/Window";
export type { WindowType } from "./src/windows/Window";
export { RecipeRegistry } from "./src/recipe/Recipe";
export type { Recipe } from "./src/recipe/Recipe";

// Registries
export { BlockRegistry, EntityRegistry, ItemRegistry } from "./src/registry";
export type { BlockDef, EntityDef, EntityCategory, ItemDef } from "./src/registry";
export { applyStartGameData, applyBlockPalette, applyItemPalette } from "./src/registry/applyStartGame";
export type { PaletteEntry } from "./src/registry/applyStartGame";
export { BiomeRegistry } from "./src/biome/Biome";
export type { BiomeDef } from "./src/biome/Biome";

// Gameplay helpers
export { PhysicsEngine } from "./src/physics/Physics";
export type { PhysicsState, ControlState, PhysicsConfig } from "./src/physics/Physics";
export { CombatController as Combat } from "./src/combat/Combat";
export { PvP } from "./src/pvp/PvP";
export { AutoEat } from "./src/autoeat/AutoEat";
export { CollectBlock } from "./src/collect/CollectBlock";
export { ToolManager } from "./src/tool/Tool";
export { StateMachine, BehaviorState } from "./src/statemachine/StateMachine";
export type { StateTransition } from "./src/statemachine/StateMachine";
export { NBT } from "./src/nbt/NBT";
export { chatToString, parseChatPacket } from "./src/chat/Chat";
export type { ChatComponent } from "./src/chat/Chat";
export { EntityModel } from "./src/entity/EntityModel";

// Auth
export { XboxAuth } from "./src/auth/XboxAuth";
export type { AuthResult, XboxAuthOptions } from "./src/auth/XboxAuth";
export { buildOfflineChain, buildOnlineChain, generateBedrockKeyPair } from "./src/auth/JwtChain";

// Transport
export { NetherNetTransport } from "./src/transport/nethernet";
export { createMockPeerConnection, MOCK_OFFER_SDP, MOCK_ANSWER_SDP } from "./src/transport/mockRtc";
export { resolvePeerConnectionFactory, getCachedPeerFactory, resetWebRtcLoader } from "./src/transport/webrtcLoader";

// Protocol
export { PacketId, ProtocolVersion } from "./src/protocol/packets";
export { ProtocolClient } from "./src/protocol/ProtocolClient";
export { BDSSession } from "./src/protocol/BDSSession";
export {
  encodeGamePacket,
  decodeGamePacket,
  getRegisteredCodecIds,
  hasCodec,
  getCodecCoverage,
  encodeBatch,
  decodeBatch,
} from "./src/protocol/codec";
export {
  encodeInventoryTransaction,
  buildAttackEntityPacket,
  buildUseItemPacket,
  buildReleaseItemPacket,
  InventoryTransactionType,
} from "./src/protocol/inventory_tx";
export type { ItemStack, InventoryAction } from "./src/protocol/inventory_tx";
export {
  encodeItemStackRequest,
  buildTransferRequest,
  StackRequestAction,
  nextStackRequestId,
} from "./src/protocol/itemStackRequest";
export type { StackRequestSlotInfo } from "./src/protocol/itemStackRequest";
export {
  parseSdpIdentity,
  injectSdpIdentity,
  applyIdentityToOffer,
  decodeIdentityJwt,
  decodeIdentityEnvelope,
  extractFingerprints,
  buildIdentityAttribute,
  fingerprintsPayload,
  detachedES384,
} from "./src/protocol/sdp";
export { snappyCompress, snappyDecompress } from "./src/protocol/snappy";
export {
  encodeSubChunkRequest,
  decodeSubChunkRequest,
  encodeSubChunkPacket,
  decodeSubChunkPacket,
  applySubChunkPacketToWorld,
  columnOffsets,
  buildColumnRequest,
  SubChunkRequestMode,
  SubChunkResult,
  HeightMapType,
} from "./src/protocol/subchunk";
export type { SubChunkRequestBody, SubChunkBody, SubChunkOffset } from "./src/protocol/subchunk";
export {
  flagsFromControls,
  moveVectorFromControls,
  encodeBitset,
  decodeBitset,
  InputFlag,
  PLAYER_AUTH_INPUT_BITS,
  InputMode,
  PlayMode,
  InteractionModel,
} from "./src/protocol/authInput";
export type { MovementControls } from "./src/protocol/authInput";
export {
  CompressionAlgorithm,
  NETHERNET_RELIABLE_CHANNEL,
  NETHERNET_UNRELIABLE_CHANNEL,
  compressBatch,
  decompressBatch,
  wrapFragment,
  FragmentReassembler,
} from "./src/protocol/framing";

// AI
export { Agent } from "./src/ai/Agent";
export type { AgentAction, AgentObservation, PlannerFn } from "./src/ai/Agent";
export { LLMClient } from "./src/ai/LLMClient";
export type { LLMMessage, LLMClientOptions, LLMResponse } from "./src/ai/LLMClient";
export { createLLMPlanner } from "./src/ai/LLMPlanner";
export type { LLMPlannerOptions } from "./src/ai/LLMPlanner";
export { createAIBot } from "./src/ai/AIBot";
export type { AIBot, AIBotOptions } from "./src/ai/AIBot";

// Decision / human
export { createDecisionEngine, DecisionEngine } from "./src/decision/DecisionEngine";
export type { DecisionMode, DecisionEngineOptions } from "./src/decision/DecisionEngine";
export { createHumanBehavior, HumanBehavior } from "./src/human/HumanBehavior";
export type { HumanBehaviorOptions } from "./src/human/HumanBehavior";
export { createPersonality, reactionDelayMs, shouldAct } from "./src/human/Personality";
export type { PersonalityTraits, PersonalityPreset } from "./src/human/Personality";
export { createExplore, ExploreModule } from "./src/explore/Explore";
export { createChatBrain, ChatBrain } from "./src/chat/ChatBrain";
export type { ChatBrainOptions } from "./src/chat/ChatBrain";

// Scripts / tasks / farm / commands
export { createScriptRunner, ScriptRunner } from "./src/script/ScriptRunner";
export type { ScriptFn, CustomHandler, MacroStep, OpenWork } from "./src/script/ScriptRunner";
export { createTaskQueue, TaskQueue } from "./src/tasks/TaskQueue";
export type { Task } from "./src/tasks/TaskQueue";
export { createFarm, Farm } from "./src/farm/Farm";
export { createCommandRouter, CommandRouter } from "./src/commands/CommandRouter";
export type { CommandHandler, CommandContext, CommandRouterOptions } from "./src/commands/CommandRouter";

// Plugins
export { loadDefaultPlugins, loggerPlugin } from "./src/plugins";
export {
  encodeNetworkItem,
  decodeNetworkItem,
  encodeItemList,
  decodeItemList,
  ContainerId,
} from "./src/protocol/itemStack";
export type { NetworkItem } from "./src/protocol/itemStack";

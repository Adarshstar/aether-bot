/**
 * High-level AI Bot factory — full Aether stack with human-like behavior
 */

import { createBot } from "../core/createBot";
import type { Bot } from "../core/Bot";
import type { BotOptions } from "../types";
import { createLLMPlanner, type LLMPlannerOptions } from "./LLMPlanner";
import { LLMClient, type LLMClientOptions, type LLMLike } from "./LLMClient";
import { FallbackLLMClient, type ProviderSpec } from "./FallbackLLM";
import { createDecisionEngine, type DecisionEngine } from "../decision/DecisionEngine";
import { createCommandRouter, type CommandRouter } from "../commands/CommandRouter";
import { createExplore, type ExploreModule } from "../explore/Explore";
import { createScriptRunner, type ScriptRunner } from "../script/ScriptRunner";
import { createChatBrain, type ChatBrain } from "../chat/ChatBrain";
import { createSurvival, type Survival } from "../survival/Survival";
import { createHealthDashboard, type HealthDashboard } from "../monitor/HealthDashboard";
import { createMemory, type AetherMemory } from "../memory/Memory";
import { createWorldKnowledge, type WorldKnowledge } from "../memory/WorldKnowledge";
import { createHTNPlanner, type HTNPlanner } from "../planning/HTNPlanner";
import { createWorldModel, type WorldModel } from "../planning/WorldModel";
import { createBuildPlanner, type BuildPlanner } from "../construction/BuildPlanner";
import { createSquadManager, type SquadManager } from "../squad/SquadManager";
import {
  createHumanBehavior,
  type HumanBehavior,
} from "../human/HumanBehavior";
import type { PersonalityPreset, PersonalityTraits } from "../human/Personality";

export interface AIBotOptions extends BotOptions {
  aiApiKey: string;
  aiBaseUrl?: string;
  aiModel?: string;
  temperature?: number;
  maxTokens?: number;
  agentTickMs?: number;
  autoStartAgent?: boolean;
  systemPrompt?: string;
  headers?: Record<string, string>;
  enableCommands?: boolean;
  enableChatBrain?: boolean;
  enableDecision?: boolean;
  commandPrefix?: string;
  commandAllowUsers?: string[];
  /** Human personality preset or partial traits */
  personality?: PersonalityPreset | Partial<PersonalityTraits>;
  /** Start in autonomous human-like freeplay (default true with AI) */
  autonomous?: boolean;
  /** Ambient fidget / look-around (default true) */
  humanFidget?: boolean;
  /**
   * V7: optional list of additional fallback providers tried in order
   * after the primary aiApiKey/aiModel/aiBaseUrl fails. Each entry uses the
   * same shape as LLMClientOptions plus a `name` for logs/status.
   */
  fallbackProviders?: ProviderSpec[];
  /** V7: expose a local JSON health dashboard at /status (default true) */
  enableHealthDashboard?: boolean;
  healthDashboardPort?: number;
  /** V7: persist known players + notes to disk across restarts (default true) */
  enableMemory?: boolean;
  memoryFile?: string;
}

export interface AIBot extends Bot {
  llm: LLMLike;
  decision: DecisionEngine;
  commands: CommandRouter;
  explore: ExploreModule;
  scripts: ScriptRunner;
  chatBrain: ChatBrain;
  survival: Survival;
  human: HumanBehavior;
  startAI(): Promise<void>;
  stopAI(): void;
  askAI(prompt: string): Promise<string>;
  /** V7: present when fallbackProviders was used; null for single-provider setups */
  llmFallback: FallbackLLMClient | null;
  /** V7: local health dashboard server (null if disabled) */
  healthDashboard: HealthDashboard | null;
  /** V7: persistent player/world memory */
  memory: AetherMemory;
  /** V9: persistent world knowledge (ore veins, bases, danger zones, farms) */
  worldKnowledge: WorldKnowledge;
  /** V9: HTN planner for autonomous complex goals */
  htnPlanner: HTNPlanner;
  /** V9: world model for state prediction */
  worldModel: WorldModel;
  /** V9: build planner for construction */
  buildPlanner: BuildPlanner;
  /** V9: squad manager for multi-bot coordination */
  squadManager: SquadManager;
}

export function createAIBot(options: AIBotOptions): AIBot {
  if (!options.aiApiKey) throw new Error("createAIBot: aiApiKey is required");

  const bot = createBot(options) as AIBot;

  const primaryModel =
    options.aiModel ?? (options.aiApiKey.startsWith("AQ.") || options.aiApiKey.startsWith("AIza") ? "gemini-3.8-flash" : "gpt-4o-mini");

  const llmOpts: LLMPlannerOptions = {
    apiKey: options.aiApiKey,
    baseUrl: options.aiBaseUrl,
    model: primaryModel,
    temperature: options.temperature ?? 0.55,
    maxTokens: options.maxTokens ?? 800,
    systemPrompt: options.systemPrompt,
    headers: options.headers,
  };

  if (options.fallbackProviders?.length) {
    const providers: ProviderSpec[] = [
      { name: "primary", apiKey: options.aiApiKey, baseUrl: options.aiBaseUrl, model: primaryModel, headers: options.headers },
      ...options.fallbackProviders,
    ];
    bot.llmFallback = new FallbackLLMClient({ providers });
    bot.llm = bot.llmFallback;
    llmOpts.client = bot.llmFallback;
  } else {
    bot.llmFallback = null;
    bot.llm = new LLMClient(llmOpts);
  }

  bot.agent.setPlanner(createLLMPlanner(llmOpts));
  bot.agent.setTickInterval(options.agentTickMs ?? 2200);

  bot.human = createHumanBehavior(bot, {
    personality: options.personality ?? "default",
    fidget: options.humanFidget !== false,
    ambientChat: true,
  });

  bot.explore = createExplore(bot);
  bot.decision = createDecisionEngine(bot, { tickMs: 450 });
  bot.decision.attachAgent(bot.agent);
  bot.decision.attachExplore(bot.explore);
  bot.decision.attachHuman(bot.human);

  bot.scripts = bot.scripts ?? createScriptRunner(bot);
  bot.commands = createCommandRouter(bot, {
    prefix: options.commandPrefix ?? "!",
    allowUsers: options.commandAllowUsers,
    decision: bot.decision,
    scripts: bot.scripts,
  });

  bot.chatBrain = createChatBrain(
    bot,
    options.enableChatBrain === false ? null : bot.llm,
    { requireMention: false, replyChance: 0.35 * (bot.human.personality.sociability + 0.2) }
  );

  bot.survival = createSurvival(bot, { autoEat: true });
  bot.survival.attachAgent(bot.agent);

  // V7 Phase 4: persistent player/world memory
  bot.memory = createMemory({ file: options.memoryFile });

  // V9: persistent world knowledge (ore veins, bases, danger zones, farms)
  bot.worldKnowledge = createWorldKnowledge(undefined, bot.memory);

  // V9: HTN planner for autonomous complex goals
  bot.htnPlanner = createHTNPlanner(bot);

  // V9: world model for state prediction
  bot.worldModel = createWorldModel(bot);

  // V9: build planner for construction
  bot.buildPlanner = createBuildPlanner();

  // V9: squad manager for multi-bot coordination
  bot.squadManager = createSquadManager();
  bot.squadManager.addMember(bot, "leader");

  // V7 Phase 3: local health dashboard
  bot.healthDashboard =
    options.enableHealthDashboard === false
      ? null
      : createHealthDashboard(bot, { port: options.healthDashboardPort, llmFallback: bot.llmFallback });
  bot.healthDashboard?.start();

  bot.startAI = async () => {
    console.log("[Aether AI] Human + agent + decision + V9 systems starting");
    bot.human.start();
    bot.survival.start();
    bot.decision.start();
    bot.squadManager.start();
    const mode = options.autonomous === false ? "ai" : "autonomous";
    bot.decision.setMode(mode as any, {});
    // Still run LLM planner for richer decisions when mode is ai;
    // autonomous uses personality; also start agent for hybrid
    await bot.agent.start();
  };

  bot.stopAI = () => {
    bot.agent.stop();
    bot.decision.stop();
    bot.survival.stop();
    bot.human.stop();
    bot.squadManager.stop();
    bot.healthDashboard?.stop();
    bot.worldKnowledge.stop();
    console.log("[Aether AI] Stopped");
  };

  bot.askAI = async (prompt: string) => {
    return bot.llm.complete(
      "You are Aether, a human-like Minecraft Bedrock player. Be concise and casual.",
      prompt
    );
  };

  if (options.autoStartAgent !== false) {
    bot.on("spawn", () => {
      bot.startAI().catch((e) => console.error("[Aether AI]", e));
    });
  }

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    // V7: remember every player who talks to us
    bot.memory.noteInteraction(username, message);
    const m = message.toLowerCase();
    if (m.includes("explore") && (m.includes("aether") || m.includes(bot.username.toLowerCase()))) {
      bot.decision.setMode("explore", { radius: 48 });
      bot.chat("on it");
    }
  });

  return bot;
}

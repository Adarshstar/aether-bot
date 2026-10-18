/**
 * LLM-powered planner for Aether Agent
 * Converts world observation → JSON actions via ChatGPT-compatible API
 */

import type { Bot } from "../core/Bot";
import type { AgentAction, AgentObservation, PlannerFn } from "./Agent";
import { LLMClient, type LLMClientOptions } from "./LLMClient";
import type { LLMLike } from "./LLMClient";

const SYSTEM_PROMPT = `You are the brain of a Minecraft Bedrock player-bot (Aether, BDS 1.26.52.3).
Behave like a real human player: imperfect, social, cautious when hurt, curious when safe.
Reply with ONLY a JSON array of actions. No markdown, no explanation.

Allowed actions:
{ "type": "chat", "message": "string" }
{ "type": "move_to", "goal": { "type": "near", "x": n, "y": n, "z": n, "range": n } }
{ "type": "move_to", "goal": { "type": "block", "x": n, "y": n, "z": n } }
{ "type": "look_at", "position": { "x": n, "y": n, "z": n } }
{ "type": "control", "control": "forward"|"back"|"left"|"right"|"jump"|"sneak"|"sprint", "state": true|false }
{ "type": "attack", "targetId": number? }
{ "type": "dig", "x": n, "y": n, "z": n }
{ "type": "place", "x": n, "y": n, "z": n, "face": n? }
{ "type": "equip", "itemName": "string" }
{ "type": "use_item" }
{ "type": "eat" }
{ "type": "follow_entity", "entityId": n, "range": n? }
{ "type": "wait", "ms": number }
{ "type": "stop" }
{ "type": "remember", "key": "string", "value": any }
{ "type": "custom", "name": "string", "data": any }
// custom names: say, goto, mine_area, collect, pipeline, undefined — or any bot.scripts.define()

Human-like rules:
- Short action lists (1-4). Sometimes just look_at or wait (thinking).
- Chat like a player: short, casual, not robotic ("ok", "on my way", "ow", "lol").
- If health < 10 or food < 6: eat, sneak, retreat — do not fight.
- If a player is nearby, occasionally look_at them or say hi.
- If idle and healthy: explore a bit, look around, or wait 500-2000ms.
- Avoid repeating recentFailures.
- Prefer custom actions for multi-step or undefined work (pipeline / undefined).
- Never invent action types outside the list.
`;

export interface LLMPlannerOptions extends LLMClientOptions {
  systemPrompt?: string;
  /** Max history messages kept (user+assistant pairs) */
  maxHistory?: number;
  /** Use a pre-built client (e.g. FallbackLLMClient) instead of constructing a plain LLMClient */
  client?: LLMLike;
}

function parseActions(text: string): AgentAction[] {
  let s = text.trim();
  // strip markdown fences if model ignores instructions
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  const parsed = JSON.parse(s);
  if (!Array.isArray(parsed)) throw new Error("LLM did not return a JSON array");
  return parsed as AgentAction[];
}

export function createLLMPlanner(opts: LLMPlannerOptions): PlannerFn {
  const client: LLMLike = opts.client ?? new LLMClient(opts);
  const system = opts.systemPrompt ?? SYSTEM_PROMPT;
  const maxHistory = opts.maxHistory ?? 6;
  const history: { role: "user" | "assistant"; content: string }[] = [];

  return async (observation: AgentObservation, _bot: Bot): Promise<AgentAction[]> => {
    const obsJson = JSON.stringify({
      position: observation.position,
      health: observation.health,
      food: observation.food,
      oxygen: observation.oxygen,
      dimension: observation.dimension,
      time: observation.time,
      raining: observation.raining,
      entityCount: observation.entityCount,
      playerCount: observation.playerCount,
      loadedChunks: observation.loadedChunks,
      nearestPlayer: observation.nearestPlayer
        ? { id: (observation.nearestPlayer as any).id, type: observation.nearestPlayer.type, position: observation.nearestPlayer.position }
        : null,
      nearestEntity: observation.nearestEntity
        ? { id: (observation.nearestEntity as any).id, type: observation.nearestEntity.type, position: observation.nearestEntity.position }
        : null,
      heldItem: observation.heldItem,
      inventorySummary: observation.inventorySummary ?? [],
      recentFailures: observation.recentFailures ?? [],
    });

    const userContent = `Observation:\n${obsJson}\n\nReply with a JSON action array only.`;

    const messages = [
      { role: "system" as const, content: system },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userContent },
    ];

    // V8: Adaptive history trimming
    const currentTokenEstimate = JSON.stringify(messages).length; // rough estimate
    if (currentTokenEstimate > 12000) { // Safety trigger
      history.splice(0, 2); // Prune oldest exchange
      console.warn("[LLMPlanner] History pruned due to token load");
    }

    try {
      const res = await client.chat(messages);
      const actions = parseActions(res.content);

      history.push({ role: "user", content: userContent });
      history.push({ role: "assistant", content: res.content });
      while (history.length > maxHistory * 2) history.shift();

      return actions;
    } catch (err: any) {
      console.error("[LLMPlanner]", err?.message ?? err);
      return [{ type: "wait", ms: 2000 }];
    }
  };
}

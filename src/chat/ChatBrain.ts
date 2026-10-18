/**
 * Chat brain — optional AI replies to player messages (not commands).
 */

import type { Bot } from "../core/Bot";
import type { LLMLike } from "../ai/LLMClient";

export interface ChatBrainOptions {
  /** Ignore messages from self */
  ignoreSelf?: boolean;
  /** Cooldown between AI replies ms */
  cooldownMs?: number;
  /** Only reply when mentioned or random chance */
  requireMention?: boolean;
  replyChance?: number;
}

export class ChatBrain {
  private bot: Bot;
  private llm: LLMLike | null;
  private opts: Required<ChatBrainOptions>;
  private lastReply = 0;
  private bound = false;

  constructor(bot: Bot, llm: LLMLike | null, opts: ChatBrainOptions = {}) {
    this.bot = bot;
    this.llm = llm;
    this.opts = {
      ignoreSelf: opts.ignoreSelf ?? true,
      cooldownMs: opts.cooldownMs ?? 8000,
      requireMention: opts.requireMention ?? false,
      replyChance: opts.replyChance ?? 0.35,
    };
  }

  attach() {
    if (this.bound) return;
    this.bound = true;
    this.bot.on("chat", (username, message) => {
      this.onChat(username, message).catch(() => {});
    });
  }

  private async onChat(username: string, message: string) {
    if (!this.llm) return;
    if (message.startsWith("!") || message.startsWith("/")) return;
    if (this.opts.ignoreSelf && username === this.bot.username) return;

    const mentioned =
      message.toLowerCase().includes((this.bot.username || "").toLowerCase()) ||
      message.toLowerCase().includes("aether");

    if (this.opts.requireMention && !mentioned) return;
    if (!mentioned && Math.random() > this.opts.replyChance) return;

    const now = Date.now();
    if (now - this.lastReply < this.opts.cooldownMs) return;
    this.lastReply = now;

    try {
      const pos = this.bot.entity?.position;
      const reply = await this.llm.complete(
        "You are Aether, a friendly Minecraft Bedrock bot. Reply in one short sentence. No markdown.",
        `Player ${username} said: "${message}". My pos: ${pos ? `${pos.x|0},${pos.y|0},${pos.z|0}` : "?"}, hp=${this.bot.health}, food=${this.bot.food}.`
      );
      const text = reply.replace(/\s+/g, " ").trim().slice(0, 200);
      if (text) this.bot.chat(text);
    } catch (e: any) {
      console.warn("[ChatBrain]", e?.message ?? e);
    }
  }
}

export function createChatBrain(bot: Bot, llm: LLMLike | null, opts?: ChatBrainOptions) {
  const b = new ChatBrain(bot, llm, opts);
  b.attach();
  return b;
}

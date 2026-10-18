/**
 * HumanBehavior — makes the bot feel alive:
 * look-around, idle fidget, hesitation, natural pauses, ambient chat.
 */

import type { Bot } from "../core/Bot";
import {
  createPersonality,
  reactionDelayMs,
  shouldAct,
  type PersonalityTraits,
  type PersonalityPreset,
} from "./Personality";
import { distance } from "../types";

export interface HumanBehaviorOptions {
  personality?: PersonalityPreset | Partial<PersonalityTraits>;
  /** Enable ambient look / jump / sneak fidget */
  fidget?: boolean;
  /** Occasional short chat lines when idle */
  ambientChat?: boolean;
  tickMs?: number;
}

const IDLE_LINES: Record<string, string[]> = {
  friendly: ["hey", "nice area", "hmm", "what should we do", "all good"],
  quiet: ["...", "hm", "ok"],
  chaotic: ["lol", "wait what", "yo", "brb brain lag"],
  serious: ["scanning.", "clear.", "status nominal."],
  playful: ["wee", "adventure time", "o/", "found a rock lol"],
};

export class HumanBehavior {
  private bot: Bot;
  private traits: PersonalityTraits;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickMs: number;
  private fidget: boolean;
  private ambientChat: boolean;
  private running = false;
  private lastLook = 0;
  private lastFidget = 0;
  private lastChat = 0;
  private lastPlayerSeen = 0;
  private hesitantUntil = 0;

  constructor(bot: Bot, opts: HumanBehaviorOptions = {}) {
    this.bot = bot;
    this.traits = createPersonality(opts.personality ?? "default");
    this.tickMs = opts.tickMs ?? 400;
    this.fidget = opts.fidget ?? true;
    this.ambientChat = opts.ambientChat ?? true;
  }

  get personality() {
    return this.traits;
  }

  setPersonality(p: PersonalityPreset | Partial<PersonalityTraits>) {
    this.traits = createPersonality(p as any);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, this.tickMs);
    console.log(
      `[Human] Behavior started style=${this.traits.style} curiosity=${this.traits.curiosity}`
    );
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Block actions briefly (human hesitation after surprise) */
  hesitate(ms?: number) {
    const d = ms ?? reactionDelayMs(this.traits, 350);
    this.hesitantUntil = Date.now() + d;
  }

  isHesitating() {
    return Date.now() < this.hesitantUntil;
  }

  /** Wait a human-scaled reaction time */
  async react(baseMs = 200): Promise<void> {
    const ms = reactionDelayMs(this.traits, baseMs);
    await new Promise((r) => setTimeout(r, ms));
  }

  private async tick() {
    if (!this.running || !this.bot.entity) return;
    if (this.isHesitating()) return;

    const now = Date.now();

    // Notice nearby players — look at them (social)
    const player = this.bot.nearestEntity((e) => e.type === "player") as any;
    if (player && this.bot.entity) {
      const d = distance(this.bot.entity.position, player.position);
      if (d < 10 && this.traits.sociability > 0.3) {
        if (now - this.lastPlayerSeen > 3000) {
          this.lastPlayerSeen = now;
          await this.react(150);
          this.bot.lookAt({
            x: player.position.x,
            y: player.position.y + 1.6,
            z: player.position.z,
          });
          if (
            this.ambientChat &&
            shouldAct(0.12 * this.traits.sociability) &&
            now - this.lastChat > 20000
          ) {
            this.lastChat = now;
            this.bot.chat(this.pickLine());
          }
        }
      }
    }

    // Danger → caution hesitation
    if (this.traits.caution > 0.5 && this.bot.health < 10) {
      if (shouldAct(0.2 * this.traits.caution)) {
        this.hesitate(reactionDelayMs(this.traits, 400));
        this.bot.setControlState("sneak", true);
        setTimeout(() => this.bot.setControlState("sneak", false), 800);
      }
    }

    // Look around when mostly idle
    if (this.fidget && now - this.lastLook > 2500 + (1 - this.traits.expressiveness) * 4000) {
      if (shouldAct(0.35 * this.traits.expressiveness + 0.15 * this.traits.curiosity)) {
        this.lastLook = now;
        await this.lookAround();
      }
    }

    // Idle fidget: small jump / sneak pulse
    if (
      this.fidget &&
      now - this.lastFidget > 8000 + this.traits.laziness * 12000 &&
      shouldAct(0.25 * this.traits.expressiveness * (1 - this.traits.laziness))
    ) {
      this.lastFidget = now;
      await this.react(100);
      if (Math.random() < 0.5) {
        this.bot.setControlState("jump", true);
        setTimeout(() => this.bot.setControlState("jump", false), 120);
      } else {
        this.bot.setControlState("sneak", true);
        setTimeout(() => this.bot.setControlState("sneak", false), 400);
      }
    }

    // Ambient chat when lazy/idle
    if (
      this.ambientChat &&
      this.traits.sociability > 0.4 &&
      now - this.lastChat > 45000 + this.traits.laziness * 60000 &&
      shouldAct(0.08 * this.traits.sociability)
    ) {
      this.lastChat = now;
      this.bot.chat(this.pickLine());
    }
  }

  private async lookAround() {
    if (!this.bot.entity) return;
    const yaw = this.bot.entity.yaw + (Math.random() - 0.5) * 1.8;
    const pitch = (Math.random() - 0.5) * 0.6;
    // Approximate look by setting entity angles + lookAt offset
    const dist = 4;
    const x = this.bot.entity.position.x - Math.sin(yaw) * dist;
    const z = this.bot.entity.position.z - Math.cos(yaw) * dist;
    const y = this.bot.entity.position.y + 1.5 + Math.sin(pitch) * 2;
    this.bot.lookAt({ x, y, z });
  }

  private pickLine(): string {
    const lines = IDLE_LINES[this.traits.style] ?? IDLE_LINES.friendly;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /** Combat engagement preference 0..1 */
  wantsFight(): boolean {
    if (this.bot.health < 8 && this.traits.caution > 0.4) return false;
    return Math.random() < this.traits.aggression;
  }

  /** Should start exploring when idle */
  wantsExplore(): boolean {
    return Math.random() < this.traits.curiosity * (1 - this.traits.laziness) * 0.4;
  }
}

export function createHumanBehavior(bot: Bot, opts?: HumanBehaviorOptions) {
  return new HumanBehavior(bot, opts);
}

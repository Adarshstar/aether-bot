/**
 * Survival module — health / food monitoring and basic self-preservation
 * for Aether bots on BDS 1.26.52.3
 */

import type { Bot } from "../core/Bot";
import type { Agent } from "../ai/Agent";

export interface SurvivalOptions {
  /** Health threshold below which we try to retreat / eat (default 10) */
  lowHealthThreshold?: number;
  /** Food threshold for auto-eat (default 14) */
  lowFoodThreshold?: number;
  /** Enable automatic eating when food is low */
  autoEat?: boolean;
  /** Emit warnings on low oxygen */
  oxygenWarning?: boolean;
}

export class Survival {
  private bot: Bot;
  private agent: Agent | null = null;
  private opts: Required<SurvivalOptions>;
  private lastEat = 0;
  private active = false;

  constructor(bot: Bot, opts: SurvivalOptions = {}) {
    this.bot = bot;
    this.opts = {
      lowHealthThreshold: opts.lowHealthThreshold ?? 10,
      lowFoodThreshold: opts.lowFoodThreshold ?? 14,
      autoEat: opts.autoEat ?? true,
      oxygenWarning: opts.oxygenWarning ?? true,
    };
  }

  attachAgent(agent: Agent) {
    this.agent = agent;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.bot.on("health", () => this.tick());
    this.bot.on("spawn", () => this.tick());
    // Periodic check
    const iv = setInterval(() => {
      if (!this.active) {
        clearInterval(iv);
        return;
      }
      this.tick();
    }, 2000);
    console.log("[Survival] Module started");
  }

  stop() {
    this.active = false;
  }

  private tick() {
    if (!this.active) return;
    const health = this.bot.health ?? 20;
    const food = this.bot.food ?? 20;
    const oxygen = this.bot.oxygen ?? 20;

    if (this.opts.oxygenWarning && oxygen < 5) {
      console.warn(`[Survival] Low oxygen: ${oxygen}`);
    }

    if (health <= this.opts.lowHealthThreshold) {
      console.warn(`[Survival] Low health: ${health}`);
      if (this.agent) {
        this.agent.enqueue({ type: "stop" });
        // Simple retreat: turn around and sprint briefly
        this.agent.enqueue({ type: "control", control: "sprint", state: true });
        this.agent.enqueue({ type: "control", control: "back", state: true });
        this.agent.enqueue({ type: "wait", ms: 800 });
        this.agent.enqueue({ type: "control", control: "back", state: false });
        this.agent.enqueue({ type: "control", control: "sprint", state: false });
      }
    }

    if (this.opts.autoEat && food <= this.opts.lowFoodThreshold) {
      const now = Date.now();
      if (now - this.lastEat > 3000) {
        this.lastEat = now;
        console.log(`[Survival] Auto-eat (food=${food})`);
        if (this.agent) {
          this.agent.enqueue({ type: "eat" });
        } else if (this.bot.autoEat && typeof this.bot.autoEat.eat === "function") {
          this.bot.autoEat.eat().catch(() => {});
        }
      }
    }
  }
}

export function createSurvival(bot: Bot, opts?: SurvivalOptions): Survival {
  return new Survival(bot, opts);
}

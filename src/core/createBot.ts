import { Bot } from "./Bot";
import type { BotOptions } from "../types";

/**
 * Create an Aether bot instance.
 * @example
 * const bot = createBot({ host: "127.0.0.1", username: "Bot", offline: true });
 * await bot.connect();
 */
export function createBot(options: BotOptions): Bot {
  if (!options?.host) throw new Error("Aether: options.host is required");
  if (!options?.username) throw new Error("Aether: options.username is required");
  return new Bot(options);
}

/** @deprecated alias */
export const createAetherBot = createBot;

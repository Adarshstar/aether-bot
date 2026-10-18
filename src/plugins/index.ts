/**
 * Optional plugins – core APIs live on Bot directly.
 * Use this module only for third-party / experimental extensions.
 */

import type { Bot } from "../core/Bot";

/** Example optional logger plugin */
export function loggerPlugin(bot: Bot) {
  bot.on("spawn", () => console.log(`[logger] ${bot.username} spawned`));
  bot.on("chat", (u, m) => {
    if (u !== bot.username) console.log(`[logger] <${u}> ${m}`);
  });
}

/** Load any optional plugins */
export function loadDefaultPlugins(bot: Bot) {
  // Core is already integrated – nothing required
  // Optional: bot.loadPlugin(loggerPlugin);
}

export { loggerPlugin as logger };

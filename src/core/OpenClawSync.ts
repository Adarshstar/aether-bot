/**
 * V8: Route critical bot events back to OpenClaw.
 * Keeps the owner notified of significant engine events without requiring
 * constant polling of logs.
 */
import type { Bot } from "./Bot";

export function initOpenClawSync(bot: Bot) {
  // Report major engine events (spawn, disconnect, etc.)
  bot.on("spawn", () => {
    console.log("[Sync] Bot spawned");
  });
  
  bot.on("disconnect", (reason) => {
    console.warn(`[Sync] Bot disconnected: ${reason}`);
  });

  // Example: bridge critical chat messages (e.g. AI engine warnings)
  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    if (message.includes("low hp") || message.includes("ow")) {
      console.log(`[Sync] Critical: ${username} observed bot health warning`);
    }
  });
}

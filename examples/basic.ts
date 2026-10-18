/**
 * Advanced basic example
 * Shows plugin system + high-level API
 */

import { createBot } from "../index";
import { loggerPlugin } from "../src/plugins/logger";

const bot = createBot({
  host: "127.0.0.1",
  port: 19132,
  username: "AI_Agent_01",
  offline: true,
  transport: "nethernet",
  enablePhysics: true,
});

// Load plugins (can be done before or after connect)
bot.loadPlugin(loggerPlugin);

bot.on("login", () => {
  console.log("✓ Logged in");
});

bot.on("spawn", () => {
  console.log("✓ Spawned");
  bot.chat("Hello from the advanced Bedrock AI Engine!");

  // Use the method injected by the logger plugin
  (bot as any).logStatus();
});

bot.on("disconnect", (reason) => {
  console.log("✗ Disconnected:", reason);
});

bot.on("error", (err) => {
  console.error("Error:", err);
});

await bot.connect();

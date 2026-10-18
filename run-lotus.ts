import { createAIBot } from "./index";

const bot = createAIBot({
  host: "lotus.taspmail.online",
  port: 19132,
  username: "AetherBot",
  auth: "microsoft",
  offline: false,
  transport: "nethernet",
  persistTokens: true,
  autoReconnect: true,
  enableCommands: true,
  // Using a dummy key for now if none provided, but many features will need a real one
  aiApiKey: process.env.AI_API_KEY || "sk-dummy", 
  aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
});

bot.on("login", () => console.log("⚡ [Aether] Authenticated with Xbox session token!"));
bot.on("spawn", () => {
  console.log("⚡ [Aether] Spawned on lotus.taspmail.online!");
  bot.chat("Aether AI Engine v1.9.1 Online ⚡");
});
bot.on("error", (err) => {
  if (err.message?.includes("EGO_REFRESH")) {
    console.error("❌ [Aether] Token refresh required. Please check your session.");
  } else {
    console.error("❌ [Aether] Error:", err);
  }
});
bot.on("disconnect", (reason) => console.log("🔌 [Aether] Disconnected:", reason));

console.log("⚡ [Aether] Connecting to lotus.taspmail.online:19132...");
await bot.connect();

/**
 * Full agent: AI + commands + explore + decision + survival
 *
 *   AI_API_KEY=sk-... bun run examples/full-agent.ts
 *
 * In-game chat commands:
 *   !help !status !goto x y z !explore [r] !follow name !come !guard !eat !stop !ai <task> !script wave
 */

import { createAIBot, AETHER_NAME, AETHER_VERSION } from "../index";

const key = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
if (!key) {
  console.error("Set AI_API_KEY");
  process.exit(1);
}

console.log(`${AETHER_NAME} ${AETHER_VERSION} — full agent`);

const bot = createAIBot({
  host: process.env.MC_HOST ?? "127.0.0.1",
  port: Number(process.env.MC_PORT ?? 19132),
  username: process.env.MC_USER ?? "AetherAI",
  offline: true,
  aiApiKey: key,
  aiBaseUrl: process.env.AI_BASE_URL,
  aiModel: process.env.AI_MODEL ?? "gpt-4o-mini",
  autoReconnect: true,
  enableCommands: true,
  enableChatBrain: true,
  enableDecision: true,
});

// Custom script example
bot.scripts.register("cheer", async (ctx) => {
  ctx.bot.chat("Let's go!");
  ctx.bot.setControlState("jump", true);
  await new Promise((r) => setTimeout(r, 300));
  ctx.bot.setControlState("jump", false);
});

bot.on("spawn", () => console.log("✓ spawn — commands active (!help)"));
bot.on("chat", (u, m) => console.log(`<${u}> ${m}`));
bot.on("error", console.error);

await bot.connect();

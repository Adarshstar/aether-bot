/**
 * Aether AI Bot Client — ChatGPT / OpenAI-compatible endpoint
 *
 * Usage:
 *   AI_API_KEY=sk-... bun run examples/ai-bot.ts
 *   AI_API_KEY=sk-... AI_BASE_URL=http://127.0.0.1:1234/v1/chat/completions AI_MODEL=local-model bun run examples/ai-bot.ts
 */

import { createAIBot, AETHER_NAME, AETHER_VERSION } from "../index";

const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
if (!apiKey) {
  console.error("Set AI_API_KEY or OPENAI_API_KEY");
  process.exit(1);
}

console.log(`${AETHER_NAME} ${AETHER_VERSION} — AI bot client`);

const bot = createAIBot({
  host: process.env.MC_HOST ?? "127.0.0.1",
  port: Number(process.env.MC_PORT ?? 19132),
  username: process.env.MC_USER ?? "AetherAI",
  offline: true,
  transport: "nethernet",
  aiApiKey: apiKey,
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1/chat/completions",
  aiModel: process.env.AI_MODEL ?? "gpt-4o-mini",
  agentTickMs: 2500,
  autoStartAgent: true,
});

bot.on("login", () => console.log("✓ login"));
bot.on("spawn", () => {
  console.log("✓ spawn — AI agent will run");
  // seed floor for movement
  for (let x = -6; x <= 6; x++)
    for (let z = -6; z <= 6; z++)
      bot.world.setBlock(x, 64, z, 1);
});
bot.on("chat", (u, m) => console.log(`<${u}> ${m}`));
bot.on("error", console.error);

await bot.connect();

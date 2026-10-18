/**
 * Full Microsoft / Xbox login example
 *
 * 1. First run: device code appears — open URL, enter code
 * 2. Refresh token cached under .aether-auth/
 * 3. Later runs reuse cache (no browser)
 *
 *   bun run examples/microsoft-login.ts
 */

import { createBot, AETHER_NAME, AETHER_VERSION } from "../index";

console.log(`${AETHER_NAME} ${AETHER_VERSION} — Microsoft login`);

const bot = createBot({
  host: process.env.MC_HOST ?? "127.0.0.1",
  port: Number(process.env.MC_PORT ?? 19132),
  username: process.env.MC_USER ?? "player@outlook.com",
  auth: "microsoft",
  offline: false,
  transport: "nethernet",
  persistTokens: true,
  // refreshToken: process.env.MSA_REFRESH, // optional override
  autoReconnect: true,
});

bot.on("login", () => console.log("✓ Authenticated & login packet path"));
bot.on("spawn", () => {
  console.log("✓ Spawned");
  bot.chat("Online with Xbox / Microsoft account");
});
bot.on("error", console.error);
bot.on("disconnect", (r) => console.log("disconnect", r));

await bot.connect();

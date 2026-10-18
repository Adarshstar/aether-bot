/**
 * Fast join example — auto WebRTC (werift/wrtc), tight timeouts.
 *
 *   bun add werift
 *   MC_HOST=127.0.0.1 MC_PORT=19132 bun run examples/join-fast.ts
 */

import { createBot, resolvePeerConnectionFactory } from "../index";

const host = process.env.MC_HOST ?? "127.0.0.1";
const port = Number(process.env.MC_PORT ?? 19132);
const username = process.env.MC_USER ?? "AetherFast";
const strict = process.env.STRICT_WEBRTC !== "0";

const t0 = Date.now();
const factory = await resolvePeerConnectionFactory();

const bot = createBot({
  host,
  port,
  username,
  offline: true,
  strictWebRTC: strict && !!factory,
  createPeerConnection: factory ?? undefined,
  signalingTimeoutMs: 8000,
  iceGatherTimeoutMs: 2200,
  maxRetries: 4,
  retryBaseMs: 350,
  autoReconnect: true,
});

bot.on("spawn", () => {
  console.log(`[join-fast] SPAWN in ${Date.now() - t0}ms at`, bot.entity?.position);
  bot.chat("aether online");
});

bot.on("error", (e) => console.error("[join-fast] error", e));
bot.on("disconnect", (r) => console.log("[join-fast] disconnect", r));

await bot.connect();
console.log(`[join-fast] connected=${bot.isConnected} loopback=${(bot as any).transport?.isLoopback} in ${Date.now() - t0}ms`);

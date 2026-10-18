
import { createBot, resolvePeerConnectionFactory, LLMClient } from "../index";

const host = process.env.MC_HOST ?? "13.126.209.44";
const port = Number(process.env.MC_PORT ?? 19132);
const apiKey = process.env.GEMINI_API_KEY ?? "";
const t0 = Date.now();
let spawned = false;
let cmdsDone = false;

async function main() {
  const llm = apiKey
    ? new LLMClient({ apiKey, provider: "gemini", model: "gemini-3.8-flash", temperature: 0.5, maxTokens: 200 })
    : null;
  if (llm) console.log("[lotus] Gemini ready");

  const factory = await resolvePeerConnectionFactory();
  if (!factory) process.exit(1);

  const bot = createBot({
    host, port, username: "AetherBot", offline: false, auth: "microsoft",
    strictWebRTC: true, createPeerConnection: factory,
    networkId: process.env.MC_NETWORK_ID || "1",
    signalingTimeoutMs: 15000, iceGatherTimeoutMs: 5000, maxRetries: 2,
    autoReconnect: false,
  } as any);

  bot.on("spawn", async () => {
    if (spawned) return;
    spawned = true;
    console.log(`[lotus] *** SPAWN *** ${Date.now() - t0}ms`);
    if (cmdsDone) return;
    cmdsDone = true;
    const cmds = [
      "time set day",
      "time set 0",
      "give Adarshkumar1783 hay_block 64",
      "give Adarshkumar1783 bread 64",
      "give Adarshkumar1783 cooked_beef 64",
      "give Adarshkumar1783 cooked_porkchop 64",
      "give Adarshkumar1783 apple 64",
      "give Adarshkumar1783 golden_carrot 64",
      "give Adarshkumar1783 cooked_salmon 64",
      "give Adarshkumar1783 pumpkin_pie 32",
    ];
    for (const c of cmds) {
      try {
        bot.runCommand(c);
        console.log("[lotus] CMD:", c);
      } catch (e: any) {
        console.error("[lotus] CMD fail", c, e?.message || e);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    try { bot.chat("Gave Adarshkumar1783 hay + foods; set daytime"); } catch {}
  });

  bot.on("chat", (u: any, m: any) => console.log(`[lotus] <${u}> ${m}`));
  bot.on("error", (e: any) => console.error("[lotus] error", e?.message || e));
  bot.on("disconnect", (r: any) => console.log("[lotus] disconnect", r));

  console.log(`[lotus] connecting ${host}:${port}`);
  await bot.connect();
  console.log("[lotus] connected");
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Join Lotus: grind, place real blocks for a small house, Gemini chat.
 */
import { createBot, resolvePeerConnectionFactory, LLMClient } from "../index";

const host = process.env.MC_HOST ?? "13.126.209.44";
const port = Number(process.env.MC_PORT ?? 19132);
const apiKey = process.env.GEMINI_API_KEY ?? process.env.AI_API_KEY ?? "";
const t0 = Date.now();
let spawned = false;
let busy = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const llm = apiKey
    ? new LLMClient({
        apiKey,
        provider: "gemini",
        model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
        temperature: 0.6,
        maxTokens: 180,
      })
    : null;
  if (llm) console.log("[task] Gemini ready");

  const factory = await resolvePeerConnectionFactory();
  if (!factory) {
    console.error("[task] No WebRTC");
    process.exit(1);
  }

  const bot = createBot({
    host,
    port,
    username: "AetherBot",
    offline: false,
    auth: "microsoft",
    strictWebRTC: true,
    createPeerConnection: factory,
    networkId: process.env.MC_NETWORK_ID || "1",
    signalingTimeoutMs: 20000,
    iceGatherTimeoutMs: 8000,
    maxRetries: 3,
    autoReconnect: true,
    reconnectBaseMs: 15000,
    maxReconnectAttempts: 6,
  } as any);

  bot.on("spawn", async () => {
    if (spawned) return;
    spawned = true;
    console.log("[task] SPAWN " + (Date.now() - t0) + "ms");
    await sleep(2500);
    try {
      bot.chat("Aether online — will grind and place house blocks");
    } catch {}
    setTimeout(() => void runTasks(bot), 5000);
  });

  bot.on("chat", async (user: any, msg: any) => {
    const name = String(user ?? "");
    const text = String(msg ?? "");
    console.log("[task] <" + name + "> " + text);
    if (!llm || !text) return;
    if (name.includes("VikramDon") || name.includes("Aether")) return;
    try {
      const reply = await llm.complete(
        "You are Aether on Lotus SMP building a house. Max 2 short sentences. No markdown.",
        name + " said: " + text
      );
      if (reply) bot.chat(reply.replace(/\n+/g, " ").slice(0, 180));
    } catch (e: any) {
      console.error("[task] Gemini", e?.message || e);
    }
  });

  bot.on("error", (e: any) => console.error("[task] error", e?.message || e));
  bot.on("disconnect", (r: any) => {
    console.log("[task] disconnect", r);
    spawned = false;
  });

  console.log("[task] connecting " + host + ":" + port);
  await bot.connect();
  console.log("[task] connected");
}

async function runTasks(bot: any) {
  if (busy) return;
  busy = true;

  const walk = async (ms: number, controls: Record<string, boolean>) => {
    try {
      if (bot.setControls) bot.setControls(controls);
      else if (bot.session?.setControls) bot.session.setControls(controls);
    } catch {}
    await sleep(ms);
    try {
      const off = { forward: false, back: false, left: false, right: false, jump: false, sprint: false };
      if (bot.setControls) bot.setControls(off);
      else if (bot.session?.setControls) bot.session.setControls(off);
    } catch {}
  };

  const pos = () => {
    const p = bot.entity?.position ?? bot.session?.position ?? bot.session?.pos ?? { x: 0, y: 64, z: 0 };
    return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
  };

  try {
    bot.chat("Grind phase...");
  } catch {}

  for (let i = 0; i < 4; i++) {
    console.log("[task] grind", i + 1);
    await walk(2000, { forward: true, sprint: true });
    try {
      if (bot.session) bot.session.yaw = (bot.session.yaw || 0) + Math.PI / 2;
    } catch {}
  }

  const base = pos();
  console.log("[task] house base", base);
  try {
    bot.chat("Placing 5x5 house footprint at " + base.x + "," + base.y + "," + base.z);
  } catch {}

  const spots: { x: number; y: number; z: number }[] = [];
  for (let dx = 0; dx < 5; dx++) {
    for (let dz = 0; dz < 5; dz++) {
      const edge = dx === 0 || dx === 4 || dz === 0 || dz === 4;
      if (!edge) continue;
      spots.push({ x: base.x + dx, y: base.y - 1, z: base.z + dz });
      spots.push({ x: base.x + dx, y: base.y, z: base.z + dz });
    }
  }

  let placed = 0;
  for (const s of spots) {
    try {
      if (bot.session?.placeBlock) {
        bot.session.placeBlock(s, 1, 3);
        placed++;
      } else if (bot.placeBlock) {
        await bot.placeBlock(s, { x: 0, y: 1, z: 0 });
        placed++;
      }
    } catch (e: any) {
      console.error("[task] place fail", e?.message || e);
    }
    await sleep(120);
  }
  console.log("[task] place attempts", placed);
  try {
    bot.chat("Placed " + placed + " blocks for house outline");
  } catch {}

  busy = false;
  setTimeout(() => void runTasks(bot), 120000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

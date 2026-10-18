/**
 * Aether plays Lotus SMP as a player: explore, build house, chat via Gemini.
 */
import { createBot, resolvePeerConnectionFactory, LLMClient } from "../index";

const host = process.env.MC_HOST ?? "13.126.209.44";
const port = Number(process.env.MC_PORT ?? 19132);
const apiKey = process.env.GEMINI_API_KEY ?? process.env.AI_API_KEY ?? "";
const t0 = Date.now();
let spawned = false;
let settleDone = false;
let llm: LLMClient | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (apiKey) {
    llm = new LLMClient({
      apiKey,
      provider: "gemini",
      model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
      temperature: 0.55,
      maxTokens: 220,
    });
    console.log("[play] Gemini ready");
  }

  const factory = await resolvePeerConnectionFactory();
  if (!factory) {
    console.error("[play] No WebRTC");
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
    signalingTimeoutMs: 25000,
    iceGatherTimeoutMs: 10000,
    maxRetries: 3,
    autoReconnect: true,
    reconnectBaseMs: 20000,
    maxReconnectAttempts: 10,
  } as any);

  bot.on("spawn", async () => {
    if (spawned) {
      console.log("[play] re-spawn");
      return;
    }
    spawned = true;
    console.log("[play] SPAWN " + (Date.now() - t0) + "ms — settling 12s before movement");
    await sleep(12000);
    settleDone = true;
    try {
      bot.chat("Aether in-game — exploring and building a house");
    } catch {}
    void playLoop(bot);
  });

  bot.on("chat", async (user: any, msg: any) => {
    const name = String(user ?? "");
    const text = String(msg ?? "");
    console.log("[play] <" + name + "> " + text);
    if (!llm || !text || !settleDone) return;
    if (name.includes("VikramDon") || name.includes("Aether")) return;
    try {
      const pos = bot.entity?.position ?? bot.session?.position ?? {};
      const reply = await llm.complete(
        "You are Aether, a Minecraft Bedrock player-bot on Lotus SMP. You explore and build a small house. Reply in under 2 short sentences. No markdown.",
        "Pos " + JSON.stringify(pos) + ". " + name + " said: " + text
      );
      if (reply) bot.chat(reply.replace(/\n+/g, " ").slice(0, 180));
    } catch (e: any) {
      console.error("[play] Gemini", e?.message || e);
    }
  });

  bot.on("error", (e: any) => console.error("[play] error", e?.message || e));
  bot.on("disconnect", (r: any) => {
    console.log("[play] disconnect", r);
    spawned = false;
    settleDone = false;
  });

  console.log("[play] connecting " + host + ":" + port);
  await bot.connect();
  console.log("[play] connected");
}

async function setControls(bot: any, c: Record<string, boolean>) {
  try {
    if (bot.setControls) bot.setControls(c);
    else if (bot.session?.setControls) bot.session.setControls(c);
  } catch {}
}

async function walk(bot: any, ms: number, controls: Record<string, boolean>) {
  await setControls(bot, controls);
  await sleep(ms);
  await setControls(bot, {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  });
}

function getPos(bot: any) {
  const p = bot.entity?.position ?? bot.session?.position ?? bot.session?.pos ?? { x: 0, y: 64, z: 0 };
  return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
}

async function playLoop(bot: any) {
  while (true) {
    if (!spawned) {
      await sleep(5000);
      continue;
    }
    try {
      // Gemini decides next action
      let action = "explore";
      if (llm) {
        try {
          const pos = getPos(bot);
          const plan = await llm.complete(
            "You control a Minecraft bot. Reply with ONE word only: explore, build, or rest.",
            "Position " + pos.x + "," + pos.y + "," + pos.z + ". What next?"
          );
          const w = (plan || "").toLowerCase();
          if (w.includes("build")) action = "build";
          else if (w.includes("rest")) action = "rest";
          else action = "explore";
        } catch {
          action = "explore";
        }
      }
      console.log("[play] action=", action);

      if (action === "rest") {
        try {
          bot.chat("Taking a short rest...");
        } catch {}
        await sleep(8000);
        continue;
      }

      if (action === "explore") {
        try {
          bot.chat("Exploring the area...");
        } catch {}
        for (let i = 0; i < 4; i++) {
          if (!spawned) break;
          await walk(bot, 400, { forward: true });
          try {
            if (bot.session) bot.session.yaw = (bot.session.yaw || 0) + Math.PI / 2;
          } catch {}
          await sleep(400);
        }
        continue;
      }

      // build house
      try {
        bot.chat("Building a small house...");
      } catch {}
      const base = getPos(bot);
      console.log("[play] house at", base);
      const spots: { x: number; y: number; z: number }[] = [];
      for (let dx = 0; dx < 5; dx++) {
        for (let dz = 0; dz < 5; dz++) {
          if (!(dx === 0 || dx === 4 || dz === 0 || dz === 4)) continue;
          spots.push({ x: base.x + dx, y: base.y - 1, z: base.z + dz });
          spots.push({ x: base.x + dx, y: base.y, z: base.z + dz });
        }
      }
      let placed = 0;
      for (const s of spots) {
        if (!spawned) break;
        try {
          if (bot.session?.placeBlock) {
            bot.session.placeBlock(s, 1, 3);
            placed++;
          } else if (bot.placeBlock) {
            await bot.placeBlock(s, { x: 0, y: 1, z: 0 });
            placed++;
          }
        } catch (e: any) {
          console.error("[play] place", e?.message || e);
        }
        await sleep(150);
      }
      try {
        bot.chat("Placed " + placed + " blocks for house walls");
      } catch {}
      await sleep(5000);
    } catch (e: any) {
      console.error("[play] loop", e?.message || e);
      await sleep(5000);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

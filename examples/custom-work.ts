/**
 * Custom / undefined work demo
 *
 *   bun run examples/custom-work.ts
 */

import { createBot } from "../index";

const bot = createBot({
  host: process.env.MC_HOST ?? "127.0.0.1",
  port: Number(process.env.MC_PORT ?? 19132),
  username: "CustomBot",
  offline: true,
});

// User-defined custom work
bot.scripts.define("cheer", async (b, data) => {
  b.chat(String(data?.msg ?? "Let's go!"));
  b.setControlState("jump", true);
  await new Promise((r) => setTimeout(r, 200));
  b.setControlState("jump", false);
});

bot.scripts.define("patrol", async (b, data) => {
  const points = data?.points ?? [
    { x: 5, y: 65, z: 0 },
    { x: 0, y: 65, z: 5 },
    { x: -5, y: 65, z: 0 },
  ];
  for (const p of points) {
    await b.goTo({ type: "near", ...p, range: 2 });
  }
});

// Macro
bot.scripts.saveMacro("intro", [
  { op: "chat", args: "hello from macro" },
  { op: "wait", args: "400" },
  { op: "jump" },
  { op: "custom", args: 'cheer {"msg":"yay"}' },
]);

// Open-ended work board
const job = bot.scripts.postWork("build a dirt pillar later", "undefined");

bot.on("spawn", async () => {
  await bot.scripts.execCustom("cheer", { msg: "spawned" });
  await bot.scripts.evalLines([
    "chat running pipeline",
    "wait 300",
    "jump",
    "call scan",
  ]);
  await bot.scripts.playMacro("intro");
  // Resolve open work with a concrete script
  await bot.scripts.resolveWork(job.id, { script: "chat pillar todo noted" });
  console.log("open work", bot.scripts.listOpenWork());
  console.log("customs", bot.scripts.listCustoms());
});

await bot.connect();

/**
 * Logger plugin – demonstrates method injection + rich status
 */

import type { Bot } from "../core/Bot";

export function loggerPlugin(bot: Bot) {
  bot.on("spawn", () => {
    console.log(`[logger] Spawned as ${bot.username}`);
  });

  bot.on("chat", (user, msg) => {
    if (user === bot.username) return;
    console.log(`[logger] <${user}> ${msg}`);
  });

  bot.on("disconnect", (reason) => {
    console.log(`[logger] Disconnected: ${reason}`);
  });

  // Inject convenience method
  (bot as any).status = () => {
    const e = bot.entity;
    console.log("──────── Bot Status ────────");
    console.log(`Name      : ${bot.username}`);
    console.log(`Health    : ${bot.health}  Food: ${bot.food}`);
    console.log(`Position  : ${e ? `${e.position.x.toFixed(1)}, ${e.position.y.toFixed(1)}, ${e.position.z.toFixed(1)}` : "n/a"}`);
    console.log(`Entities  : ${bot.entities.size}   Players: ${bot.players.size}`);
    console.log(`Chunks    : ${bot.world.loadedColumns}`);
    console.log(`Protocol  : ${bot.options.version} / 2193`);
    console.log("────────────────────────────");
  };
}

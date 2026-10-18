import { describe, test, expect } from "bun:test";
import { createBot } from "../index";

describe("scripts + custom work", () => {
  test("define and exec custom", async () => {
    const bot = createBot({ host: "127.0.0.1", username: "T", offline: true });
    let hit = 0;
    bot.scripts.define("ping", async () => {
      hit++;
      return "pong";
    });
    const r = await bot.scripts.execCustom("ping", {});
    expect(r).toBe("pong");
    expect(hit).toBe(1);
  });

  test("evalLines mini language", async () => {
    const bot = createBot({ host: "127.0.0.1", username: "T2", offline: true });
    bot.scripts.setVar("x", 0);
    await bot.scripts.evalLines(["set x 42", "wait 10"]);
    expect(bot.scripts.getVar("x")).toBe("42");
  });

  test("open work post and resolve", async () => {
    const bot = createBot({ host: "127.0.0.1", username: "T3", offline: true });
    const job = bot.scripts.postWork("test task");
    expect(job.status).toBe("open");
    const done = await bot.scripts.resolveWork(job.id, { script: "wait 5" });
    expect(done.status).toBe("done");
  });

  test("pipeline custom", async () => {
    const bot = createBot({ host: "127.0.0.1", username: "T4", offline: true });
    const r = await bot.scripts.execCustom("pipeline", {
      steps: ["wait 5", "set k v"],
    });
    expect(r.steps).toBe(2);
    expect(bot.scripts.getVar("k")).toBe("v");
  });
});

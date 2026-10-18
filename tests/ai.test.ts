import { describe, test, expect } from "bun:test";
import { createBot, createAIBot } from "../index";
import { LLMClient } from "../src/ai/LLMClient";
import { createLLMPlanner } from "../src/ai/LLMPlanner";

describe("LLMClient", () => {
  test("requires api key", () => {
    expect(() => new LLMClient({ apiKey: "" })).toThrow();
  });

  test("stores endpoint config", () => {
    const c = new LLMClient({
      apiKey: "sk-test",
      baseUrl: "http://127.0.0.1:1234/v1/chat/completions",
      model: "local",
    });
    expect(c.options.baseUrl).toContain("127.0.0.1");
    expect(c.options.model).toBe("local");
  });
});

describe("createAIBot surface", () => {
  test("module exports planner factory", () => {
    const planner = createLLMPlanner({ apiKey: "sk-x", baseUrl: "http://localhost/v1/chat/completions" });
    expect(typeof planner).toBe("function");
  });

  test("createAIBot requires api key and keeps methods", () => {
    expect(() => createAIBot({ host: "127.0.0.1", username: "x" } as any)).toThrow();
    const bot = createAIBot({
      host: "127.0.0.1",
      username: "AI",
      offline: true,
      aiApiKey: "sk-test",
      aiBaseUrl: "http://127.0.0.1:9/v1/chat/completions",
      autoStartAgent: false,
    });
    expect(bot.llm).toBeDefined();
    expect(typeof bot.startAI).toBe("function");
    expect(typeof bot.stopAI).toBe("function");
    expect(typeof bot.askAI).toBe("function");
    expect(bot.username).toBe("AI");
  });
});

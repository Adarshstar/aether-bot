import { describe, test, expect } from "bun:test";
import {
  createBot, AETHER_VERSION, AETHER_NAME, TARGET_PROTOCOL, TARGET_BDS,
  BlockRegistry,
} from "../index";

describe("Aether brand", () => {
  test("version metadata", () => {
    expect(AETHER_NAME).toBe("Aether");
    expect(AETHER_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(TARGET_PROTOCOL).toBe(2193);
    expect(TARGET_BDS).toContain("1.26");
  });

  test("createBot validation", () => {
    expect(() => createBot({ host: "", username: "x" } as any)).toThrow();
    expect(() => createBot({ host: "h", username: "" } as any)).toThrow();
  });

  test("expanded registry", () => {
    expect(BlockRegistry.size()).toBeGreaterThan(40);
    expect(BlockRegistry.getByName("diamond_ore")?.tool).toBe("pickaxe");
  });

  test("bot surface area", () => {
    const bot = createBot({ host: "127.0.0.1", username: "Aether", offline: true });
    const api = [
      "connect", "disconnect", "chat", "dig", "placeBlock", "goTo", "stopPath",
      "blockAt", "findBlock", "nearestEntity", "nearestHostile", "equip",
      "pvp", "autoEat", "collect", "tools", "stateMachine",
      "pathfinder", "pathFollower", "agent", "inventory", "combat", "windows",
      "blocks", "entityTypes", "recipes", "biomes",
    ];
    for (const k of api) {
      expect((bot as any)[k], `missing ${k}`).toBeDefined();
    }
  });
});

/**
 * Simple test suite for Bedrock AI Engine
 * Run with: bun test
 */

import { describe, test, expect } from "bun:test";
import { createBot } from "../index";
import { World } from "../src/world/World";
import { Pathfinder } from "../src/pathfinding/Pathfinder";
import { Inventory } from "../src/inventory/Inventory";

describe("World", () => {
  test("set and get block", () => {
    const w = new World();
    w.setBlock(10, 64, 10, 1);
    expect(w.getBlock(10, 64, 10)).toBe(1);
    expect(w.getBlock(0, 0, 0)).toBe(0);
  });

  test("column creation", () => {
    const w = new World();
    w.setBlock(0, 70, 0, 2);
    expect(w.loadedColumns).toBe(1);
  });
});

describe("Pathfinder", () => {
  test("finds path on flat ground", () => {
    const w = new World();
    // flat stone floor
    for (let x = 0; x <= 5; x++) {
      for (let z = 0; z <= 5; z++) {
        w.setBlock(x, 64, z, 1);
      }
    }
    const pf = new Pathfinder(w);
    const path = pf.findPath({ x: 0.5, y: 65, z: 0.5 }, { type: "near", x: 4, y: 65, z: 4, range: 1.2 });
    expect(path.length).toBeGreaterThan(0);
  });
});

describe("Inventory", () => {
  test("slot operations", () => {
    const inv = new Inventory();
    inv.setSlot(0, { networkId: 1, count: 64, name: "stone" });
    expect(inv.heldItem?.networkId).toBe(1);
    expect(inv.count(1)).toBe(64);
    inv.selectHotbar(1);
    expect(inv.heldItem).toBeNull();
  });
});

describe("Bot factory", () => {
  test("createBot returns instance", () => {
    const bot = createBot({ host: "127.0.0.1", username: "TestBot", offline: true });
    expect(bot.username).toBe("TestBot");
    expect(bot.world).toBeDefined();
    expect(bot.pathfinder).toBeDefined();
    expect(bot.agent).toBeDefined();
    expect(bot.inventory).toBeDefined();
    expect(bot.combat).toBeDefined();
  });
});

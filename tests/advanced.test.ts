import { describe, test, expect } from "bun:test";
import { createBot, GoalBlock, GoalNear, Item, Window, MinHeap, Pathfinder, World } from "../index";

describe("Goals", () => {
  test("GoalBlock end", () => {
    const g = new GoalBlock(1, 2, 3);
    expect(g.isEnd({ x: 1, y: 2, z: 3 })).toBe(true);
    expect(g.isEnd({ x: 0, y: 2, z: 3 })).toBe(false);
  });
  test("GoalNear range", () => {
    const g = new GoalNear(0, 0, 0, 2);
    expect(g.isEnd({ x: 1, y: 0, z: 1 })).toBe(true);
  });
});

describe("MinHeap", () => {
  test("orders by score", () => {
    const h = new MinHeap<{ v: number }>((x) => x.v);
    h.push({ v: 5 }); h.push({ v: 1 }); h.push({ v: 3 });
    expect(h.pop()!.v).toBe(1);
    expect(h.pop()!.v).toBe(3);
    expect(h.pop()!.v).toBe(5);
  });
});

describe("Item", () => {
  test("clone and equals", () => {
    const a = new Item(1, 64, 0, { name: "stone" });
    const b = a.clone();
    expect(a.equals(b)).toBe(true);
    expect(a.isAir).toBe(false);
  });
});

describe("Window", () => {
  test("slots", () => {
    const w = new Window(1, "chest", "Chest", 63);
    w.setSlot(0, new Item(1, 10));
    expect(w.count(1)).toBe(10);
    expect(w.firstEmptyContainerSlot()).toBe(1);
  });
});

describe("Pathfinder + Goal class", () => {
  test("finds path with GoalNear", () => {
    const world = new World();
    for (let x = 0; x <= 6; x++)
      for (let z = 0; z <= 6; z++)
        world.setBlock(x, 64, z, 1);
    const pf = new Pathfinder(world);
    const path = pf.findPath({ x: 0.5, y: 65, z: 0.5 }, new GoalNear(5, 65, 5, 1.5));
    expect(path.length).toBeGreaterThan(0);
  });
});

describe("Core integrated APIs", () => {
  test("bot has dig/place/pathfinder/block helpers on core", () => {
    const bot = createBot({ host: "127.0.0.1", username: "P", offline: true });
    expect(typeof bot.dig).toBe("function");
    expect(typeof bot.placeBlock).toBe("function");
    expect(typeof bot.blockAt).toBe("function");
    expect(typeof bot.goTo).toBe("function");
    expect(typeof bot.nearestHostile).toBe("function");
    expect(typeof bot.equip).toBe("function");
    expect(bot.blocks).toBeDefined();
    expect(bot.entityTypes).toBeDefined();
    expect(bot.windows).toBeDefined();
  });
});

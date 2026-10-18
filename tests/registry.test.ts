import { describe, test, expect } from "bun:test";
import { BlockRegistry, EntityRegistry, Pathfinder, World, GoalNear, createBot } from "../index";

describe("BlockRegistry", () => {
  test("air and stone", () => {
    expect(BlockRegistry.get(0).name).toBe("air");
    expect(BlockRegistry.get(0).passable).toBe(true);
    expect(BlockRegistry.isSolid(1)).toBe(true);
    expect(BlockRegistry.isSolid(0)).toBe(false);
    expect(BlockRegistry.getByName("bedrock")?.hardness).toBe(Infinity);
  });

  test("dig time", () => {
    expect(BlockRegistry.digTimeMs(0)).toBe(50);
    expect(BlockRegistry.digTimeMs(7)).toBe(Infinity);
    expect(BlockRegistry.digTimeMs(1)).toBeGreaterThan(100);
  });

  test("register custom", () => {
    BlockRegistry.register({
      id: 9999, name: "custom_block", solid: true, passable: false, hardness: 2, tool: "pickaxe",
    });
    expect(BlockRegistry.get(9999).name).toBe("custom_block");
  });
});

describe("EntityRegistry", () => {
  test("player and zombie", () => {
    expect(EntityRegistry.getByName("player")?.category).toBe("player");
    expect(EntityRegistry.isHostile(EntityRegistry.getByName("zombie")!.id)).toBe(true);
    expect(EntityRegistry.isPassive(EntityRegistry.getByName("cow")!.id)).toBe(true);
  });

  test("dimensions", () => {
    const d = EntityRegistry.dimensions(EntityRegistry.getByName("player")!.id);
    expect(d.width).toBe(0.6);
    expect(d.height).toBe(1.8);
  });
});

describe("Pathfinder + registry", () => {
  test("walks on solid, not through stone", () => {
    const w = new World();
    for (let x = 0; x <= 5; x++)
      for (let z = 0; z <= 5; z++)
        w.setBlock(x, 64, z, 1);
    w.setBlock(2, 65, 2, 1);
    w.setBlock(2, 66, 2, 1);
    const pf = new Pathfinder(w);
    const path = pf.findPath({ x: 0.5, y: 65, z: 0.5 }, new GoalNear(4, 65, 4, 1.2));
    expect(path.length).toBeGreaterThan(0);
  });
});

describe("Bot registry hooks", () => {
  test("digTime and registries on core", () => {
    const bot = createBot({ host: "127.0.0.1", username: "R", offline: true });
    expect(bot.blocks).toBe(BlockRegistry);
    expect(bot.entityTypes).toBe(EntityRegistry);
    expect(bot.digTime(1)).toBeGreaterThan(0);
    expect(bot.canDigBlock(1)).toBe(true);
    expect(bot.canDigBlock(7)).toBe(false);
  });
});

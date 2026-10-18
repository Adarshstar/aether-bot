import { describe, test, expect } from "bun:test";
import {
  createBot, Vec3Class, Block, NBT, PhysicsEngine, World,
  RecipeRegistry, BiomeRegistry, StateMachine, BehaviorState,
  EntityModel, chatToString,
} from "../index";

describe("Vec3", () => {
  test("ops", () => {
    const a = new Vec3Class(1, 2, 3);
    expect(a.offset(1, 0, 0).x).toBe(2);
    expect(a.distanceTo(new Vec3Class(1, 2, 6))).toBe(3);
  });
});

describe("Block", () => {
  test("from world", () => {
    const w = new World();
    w.setBlock(0, 64, 0, 1);
    const b = Block.fromWorld(w, 0, 64, 0);
    expect(b.name).toBe("stone");
    expect(b.diggable).toBe(true);
  });
});

describe("NBT", () => {
  test("get set", () => {
    const c = NBT.compound({ display: { Name: "Test" } });
    expect(NBT.getString(c, "display.Name")).toBe("Test");
  });
});

describe("PhysicsEngine", () => {
  test("simulate step", () => {
    const w = new World();
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        w.setBlock(x, 63, z, 1);
    const phys = new PhysicsEngine(w);
    const next = phys.simulate(
      { position: new Vec3Class(0.5, 64, 0.5), velocity: new Vec3Class(0, 0, 0), onGround: true, yaw: 0, pitch: 0 },
      { forward: true, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
    );
    expect(next.position.z).not.toBe(0.5); // yaw=0 forward moves -Z
  });
});

describe("Recipe + Biome", () => {
  test("registries", () => {
    expect(RecipeRegistry.list().length).toBeGreaterThan(0);
    expect(BiomeRegistry.getByName("plains")?.temperature).toBe(0.8);
  });
});

describe("StateMachine", () => {
  test("transitions", () => {
    class Idle extends BehaviorState {
      name = "idle";
    }
    class Walk extends BehaviorState {
      name = "walk";
    }
    const sm = new StateMachine();
    sm.addState(new Idle());
    sm.addState(new Walk());
    let go = false;
    sm.addTransition({ parent: "idle", child: "walk", when: () => go });
    sm.start("idle", 10);
    expect(sm.state).toBe("idle");
    go = true;
    // allow one tick
  });
});

describe("EntityModel", () => {
  test("hostile flag", () => {
    const z = new EntityModel(32, 1, new Vec3Class(0, 64, 0));
    expect(z.isHostile).toBe(true);
    expect(z.type).toBe("zombie");
  });
});

describe("Chat", () => {
  test("toString", () => {
    expect(chatToString({ text: "hi" })).toBe("hi");
  });
});

describe("Bot companions", () => {
  test("attached", () => {
    const bot = createBot({ host: "127.0.0.1", username: "S", offline: true });
    expect(bot.pvp).toBeDefined();
    expect(bot.autoEat).toBeDefined();
    expect(bot.collect).toBeDefined();
    expect(bot.tools).toBeDefined();
    expect(bot.stateMachine).toBeDefined();
    expect(bot.recipes).toBeDefined();
    expect(bot.biomes).toBeDefined();
  });
});

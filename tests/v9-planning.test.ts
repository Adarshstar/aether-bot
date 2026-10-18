/**
 * V9 Planning & Construction Tests
 */
import { describe, test, expect } from "bun:test";
import { World } from "../src/world/World";
import { createHTNPlanner } from "../src/planning/HTNPlanner";
import { createWorldModel } from "../src/planning/WorldModel";
import { createBuildPlanner } from "../src/construction/BuildPlanner";
import { getBlueprint, listBlueprints } from "../src/construction/Blueprint";
import { createSquadManager } from "../src/squad/SquadManager";
import { createWorldKnowledge } from "../src/memory/WorldKnowledge";
import { BlockRegistry } from "../src/registry/blocks";

// Mock bot for testing
const mockBot = {
  username: "TestBot",
  entity: { position: { x: 100, y: 64, z: 100 }, id: 1 },
  world: new World(),
  entities: new Map(),
  players: new Map(),
  inventory: {
    findItem: () => null,
    heldItem: { networkId: 4, count: 64, name: "cobblestone" },
  },
  pathfinder: {
    findPath: () => [],
  },
  on: () => {},
  off: () => {},
} as any;

describe("V9 HTN Planner", () => {
  test("creates planner and registers primitives", () => {
    const planner = createHTNPlanner(mockBot);
    const goals = planner.getAvailableGoals();
    expect(goals.length).toBeGreaterThan(0);
    expect(goals).toContain("gather_wood");
    expect(goals).toContain("mine_iron");
    expect(goals).toContain("build_shelter");
  });

  test("plans a simple goal", () => {
    const planner = createHTNPlanner(mockBot);
    const obs = {
      position: { x: 100, y: 64, z: 100 },
      health: 20,
      food: 20,
      oxygen: 20,
      dimension: 0,
      time: 1000,
      raining: false,
      entityCount: 0,
      playerCount: 0,
      loadedChunks: 10,
      nearestPlayer: null,
      nearestEntity: null,
      heldItem: null,
      inventorySummary: ["cobblestone x64", "iron_pickaxe x1"],
      recentFailures: [],
      timestamp: Date.now(),
    };
    const result = planner.plan("craft_iron_pickaxe", obs);
    expect(result.success).toBe(true);
    expect(result.actions.length).toBeGreaterThan(0);
  });
});

describe("V9 World Model", () => {
  test("simulates action outcomes", () => {
    const model = createWorldModel(mockBot);
    const obs = {
      position: { x: 100, y: 64, z: 100 },
      health: 20,
      food: 20,
      oxygen: 20,
      dimension: 0,
      time: 1000,
      raining: false,
      entityCount: 0,
      playerCount: 0,
      loadedChunks: 10,
      nearestPlayer: null,
      nearestEntity: null,
      heldItem: { networkId: 4, count: 64, name: "cobblestone" },
      inventorySummary: ["cobblestone x64"],
      recentFailures: [],
      timestamp: Date.now(),
    };
    const actions = [{ type: "wait", ms: 1000 } as any];
    const results = model.simulate(actions, obs);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].canExecute).toBe(true);
  });

  test("validates safe plans", () => {
    const model = createWorldModel(mockBot);
    const obs = {
      position: { x: 100, y: 64, z: 100 },
      health: 20,
      food: 20,
      oxygen: 20,
      dimension: 0,
      time: 1000,
      raining: false,
      entityCount: 0,
      playerCount: 0,
      loadedChunks: 10,
      nearestPlayer: null,
      nearestEntity: null,
      heldItem: null,
      inventorySummary: [],
      recentFailures: [],
      timestamp: Date.now(),
    };
    const actions = [{ type: "wait", ms: 1000 } as any];
    const validation = model.validatePlan(actions, obs);
    expect(validation.safe).toBe(true);
  });
});

describe("V9 Blueprint System", () => {
  test("lists built-in blueprints", () => {
    const blueprints = listBlueprints();
    expect(blueprints.length).toBeGreaterThan(0);
    const names = blueprints.map(b => b.name);
    expect(names).toContain("Simple Shelter");
    expect(names).toContain("Wall Perimeter");
  });

  test("gets blueprint by name", () => {
    const bp = getBlueprint("simple_shelter");
    expect(bp).toBeDefined();
    expect(bp?.blocks.length).toBeGreaterThan(0);
  });
});

describe("V9 Build Planner", () => {
  test("creates build plan from blueprint", () => {
    const planner = createBuildPlanner();
    const plan = planner.createPlan("simple_shelter", { x: 0, y: 64, z: 0 });
    expect(plan).not.toBeNull();
    expect(plan?.steps.length).toBeGreaterThan(0);
    expect(plan?.materials.size).toBeGreaterThan(0);
  });
});

describe("V9 Squad Manager", () => {
  test("creates squad and adds members", () => {
    const squad = createSquadManager();
    squad.addMember(mockBot, "leader");
    const status = squad.getStatus();
    expect(status.memberCount).toBe(1);
    expect(status.leader).toBe("TestBot");
  });
});

describe("V9 World Knowledge", () => {
  test("records and retrieves ore veins", () => {
    const knowledge = createWorldKnowledge(".aether-memory/test-world.json");
    const id = knowledge.recordOreVein({
      blockId: 56,
      blockName: "diamond_ore",
      position: { x: 100, y: -50, z: 200 },
      dimension: 0,
      estimatedCount: 8,
      depleted: false,
    });
    const vein = knowledge.getOreVein(id);
    expect(vein).toBeDefined();
    expect(vein?.blockName).toBe("diamond_ore");
  });

  test("finds nearby veins", () => {
    const knowledge = createWorldKnowledge(".aether-memory/test-world2.json");
    knowledge.recordOreVein({
      blockId: 15,
      blockName: "iron_ore",
      position: { x: 105, y: 64, z: 105 },
      dimension: 0,
      estimatedCount: 20,
      depleted: false,
    });
    const veins = knowledge.findNearbyVeins({ x: 100, y: 64, z: 100 }, 20, 0);
    expect(veins.length).toBeGreaterThan(0);
  });

  test("generates LLM summary", () => {
    const knowledge = createWorldKnowledge(".aether-memory/test-world3.json");
    knowledge.recordOreVein({
      blockId: 56,
      blockName: "diamond_ore",
      position: { x: 105, y: -50, z: 105 },
      dimension: 0,
      estimatedCount: 8,
      depleted: false,
    });
    const summary = knowledge.generateSummary({ x: 100, y: 64, z: 100 }, 0);
    expect(summary).toContain("diamond_ore");
  });
});

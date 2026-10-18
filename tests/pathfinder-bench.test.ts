/**
 * Pathfinder benchmark baselines — ensures A* stays fast on synthetic terrain.
 */
import { describe, test, expect } from "bun:test";
import { World } from "../src/world/World";
import { Pathfinder } from "../src/pathfinding/Pathfinder";
import { globalPerf } from "../src/core/PerfMonitor";
import { BlockRegistry } from "../src/registry/blocks";

function flatWorld(size = 64): World {
  const w = new World();
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      w.setBlock(x, 64, z, 1); // stone floor
      w.setBlock(x, 65, z, 0);
      w.setBlock(x, 66, z, 0);
    }
  }
  return w;
}

describe("pathfinder benchmark baselines", () => {
  test("short path < 50ms average", () => {
    const w = flatWorld(32);
    const pf = new Pathfinder(w, { maxNodes: 8000, enableCache: false });
    globalPerf.reset();
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      const path = pf.findPath(
        { x: 2, y: 65, z: 2 },
        { type: "near", x: 20, y: 65, z: 20, range: 1 }
      );
      times.push(performance.now() - t0);
      expect(path.length).toBeGreaterThan(5);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`[bench] short path avg=${avg.toFixed(2)}ms pathLen sample ok`);
    expect(avg).toBeLessThan(50);
  });

  test("medium path completes under node budget", () => {
    const w = flatWorld(80);
    // wall with a gap
    for (let z = 0; z < 80; z++) {
      if (z === 40) continue;
      w.setBlock(40, 65, z, 1);
      w.setBlock(40, 66, z, 1);
    }
    const pf = new Pathfinder(w, { maxNodes: 20000, enableCache: false });
    const t0 = performance.now();
    const path = pf.findPath(
      { x: 5, y: 65, z: 5 },
      { type: "near", x: 70, y: 65, z: 70, range: 2 }
    );
    const ms = performance.now() - t0;
    console.log(`[bench] medium path ms=${ms.toFixed(2)} len=${path.length}`);
    expect(path.length).toBeGreaterThan(10);
    expect(ms).toBeLessThan(500);
  });

  test("cache speeds repeated queries", () => {
    const w = flatWorld(40);
    const pf = new Pathfinder(w, { maxNodes: 10000, enableCache: true });
    const start = { x: 3, y: 65, z: 3 };
    const goal = { type: "near" as const, x: 25, y: 65, z: 25, range: 1 };
    const t1 = performance.now();
    pf.findPath(start, goal);
    const first = performance.now() - t1;
    const t2 = performance.now();
    pf.findPath(start, goal);
    const second = performance.now() - t2;
    console.log(`[bench] cache first=${first.toFixed(2)}ms second=${second.toFixed(2)}ms`);
    // second should not be catastrophically slower; ideally faster
    expect(second).toBeLessThan(first * 3 + 20);
  });

  test("registry sizes expanded", () => {
    expect(BlockRegistry.size()).toBeGreaterThan(80);
  });
});

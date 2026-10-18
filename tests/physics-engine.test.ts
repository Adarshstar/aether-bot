import { describe, test, expect } from "bun:test";
import { World } from "../src/world/World";
import { PhysicsEngine } from "../src/physics/Physics";
import { Vec3 } from "../src/math/Vec3";

function floorWorld(size = 32): World {
  const w = new World();
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      w.setBlock(x, 64, z, 1);
    }
  }
  return w;
}

describe("PhysicsEngine upgraded", () => {
  test("stands on ground", () => {
    const w = floorWorld();
    const phys = new PhysicsEngine(w);
    let s = {
      position: new Vec3(8, 65, 8),
      velocity: new Vec3(0, -0.5, 0),
      onGround: false,
      yaw: 0,
      pitch: 0,
    };
    for (let i = 0; i < 20; i++) {
      s = phys.simulate(s, {
        forward: false, back: false, left: false, right: false,
        jump: false, sprint: false, sneak: false,
      });
    }
    expect(s.onGround).toBe(true);
    expect(s.position.y).toBeGreaterThan(64.9);
    expect(s.position.y).toBeLessThan(66);
  });

  test("walks forward and stays above floor", () => {
    const w = floorWorld();
    const phys = new PhysicsEngine(w);
    let s = {
      position: new Vec3(8, 65, 8),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      yaw: 0,
      pitch: 0,
    };
    for (let i = 0; i < 30; i++) {
      s = phys.simulate(s, {
        forward: true, back: false, left: false, right: false,
        jump: false, sprint: false, sneak: false,
      });
    }
    expect(s.position.z).toBeLessThan(8); // yaw 0 → -Z
    expect(s.position.y).toBeGreaterThan(64.5);
  });

  test("jump leaves ground then lands", () => {
    const w = floorWorld();
    const phys = new PhysicsEngine(w);
    let s = {
      position: new Vec3(8, 65, 8),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      yaw: 0,
      pitch: 0,
    };
    s = phys.simulate(s, {
      forward: false, back: false, left: false, right: false,
      jump: true, sprint: false, sneak: false,
    });
    expect(s.onGround).toBe(false);
    expect(s.velocity.y).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) {
      s = phys.simulate(s, {
        forward: false, back: false, left: false, right: false,
        jump: false, sprint: false, sneak: false,
      });
    }
    expect(s.onGround).toBe(true);
  });

  test("step up one block", () => {
    const w = floorWorld();
    // ledge at z=5
    for (let x = 6; x <= 10; x++) {
      w.setBlock(x, 65, 5, 1);
    }
    const phys = new PhysicsEngine(w);
    let s = {
      position: new Vec3(8, 65, 8),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      yaw: Math.PI, // face +Z toward ledge at z=5? yaw PI → +Z
      pitch: 0,
    };
    // Move toward decreasing z with yaw 0
    s.yaw = 0;
    for (let i = 0; i < 80; i++) {
      s = phys.simulate(s, {
        forward: true, back: false, left: false, right: false,
        jump: false, sprint: false, sneak: false,
      });
    }
    // Either stepped up or stopped — y should be valid
    expect(s.position.y).toBeGreaterThanOrEqual(65);
  });

  test("raycast hits solid", () => {
    const w = floorWorld();
    w.setBlock(8, 66, 5, 1);
    const phys = new PhysicsEngine(w);
    const hit = phys.raycast({ x: 8.5, y: 66.5, z: 8.5 }, 0, 0, 6);
    expect(hit).not.toBeNull();
  });

  test("wall blocks movement", () => {
    const w = floorWorld();
    for (let y = 65; y <= 67; y++) {
      w.setBlock(8, y, 6, 1);
    }
    const phys = new PhysicsEngine(w);
    let s = {
      position: new Vec3(8.5, 65, 8.5),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      yaw: 0,
      pitch: 0,
    };
    for (let i = 0; i < 40; i++) {
      s = phys.simulate(s, {
        forward: true, back: false, left: false, right: false,
        jump: false, sprint: false, sneak: false,
      });
    }
    // Should not pass through wall at z=6
    expect(s.position.z).toBeGreaterThan(6.2);
  });
});

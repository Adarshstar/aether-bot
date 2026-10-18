/**
 * Aether PhysicsEngine — upgraded Bedrock-oriented player physics
 *
 * Features:
 * - Separating-axis AABB collision (X → Y → Z)
 * - Auto step-up (slabs / full blocks up to stepHeight)
 * - Ground sampling at multiple feet points
 * - Water / lava drag & buoyancy
 * - Ladder / scaffolding climb
 * - Ice / slime friction variants
 * - Fixed substeps for high dt stability
 * - Bedrock-tuned walk/sprint/sneak/jump speeds
 */

import { Vec3 } from "../math/Vec3";
import { BlockRegistry } from "../registry/blocks";
import type { World } from "../world/World";

export interface PhysicsState {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
  yaw: number;
  pitch: number;
  /** In liquid this tick */
  inWater?: boolean;
  inLava?: boolean;
  onClimbable?: boolean;
}

export interface ControlState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  sneak: boolean;
}

export interface PhysicsConfig {
  gravity?: number;
  jumpVel?: number;
  walkSpeed?: number;
  sprintSpeed?: number;
  sneakSpeed?: number;
  stepHeight?: number;
  playerWidth?: number;
  playerHeight?: number;
  terminalVelocity?: number;
  airDrag?: number;
  groundDrag?: number;
  waterDrag?: number;
  /** Max simulation substeps per call */
  maxSubsteps?: number;
  fixedDt?: number;
}

export class PhysicsEngine {
  private world: World;

  gravity: number;
  jumpVel: number;
  walkSpeed: number;
  sprintSpeed: number;
  sneakSpeed: number;
  stepHeight: number;
  playerWidth: number;
  playerHeight: number;
  terminalVelocity: number;
  airDrag: number;
  groundDrag: number;
  waterDrag: number;
  maxSubsteps: number;
  fixedDt: number;

  constructor(world: World, cfg: PhysicsConfig = {}) {
    this.world = world;
    this.gravity = cfg.gravity ?? 0.08;
    this.jumpVel = cfg.jumpVel ?? 0.42;
    this.walkSpeed = cfg.walkSpeed ?? 0.1;
    this.sprintSpeed = cfg.sprintSpeed ?? 0.13;
    this.sneakSpeed = cfg.sneakSpeed ?? 0.03;
    this.stepHeight = cfg.stepHeight ?? 0.6;
    this.playerWidth = cfg.playerWidth ?? 0.6;
    this.playerHeight = cfg.playerHeight ?? 1.8;
    this.terminalVelocity = cfg.terminalVelocity ?? 3.92;
    this.airDrag = cfg.airDrag ?? 0.02;
    this.groundDrag = cfg.groundDrag ?? 0.216;
    this.waterDrag = cfg.waterDrag ?? 0.8;
    this.maxSubsteps = cfg.maxSubsteps ?? 4;
    this.fixedDt = cfg.fixedDt ?? 0.05; // 20 Hz
  }

  /** Main entry — may substep for large dt */
  simulate(state: PhysicsState, controls: ControlState, dt = 0.05): PhysicsState {
    let s = this.cloneState(state);
    const steps = Math.min(this.maxSubsteps, Math.max(1, Math.ceil(dt / this.fixedDt)));
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      s = this.step(s, controls, stepDt);
    }
    return s;
  }

  private cloneState(s: PhysicsState): PhysicsState {
    return {
      position: s.position.clone(),
      velocity: s.velocity.clone(),
      onGround: s.onGround,
      yaw: s.yaw,
      pitch: s.pitch,
      inWater: s.inWater,
      inLava: s.inLava,
      onClimbable: s.onClimbable,
    };
  }

  private step(state: PhysicsState, controls: ControlState, dt: number): PhysicsState {
    const pos = state.position.clone();
    const vel = state.velocity.clone();
    let onGround = state.onGround;

    const env = this.sampleEnvironment(pos);
    const inWater = env.inWater;
    const inLava = env.inLava;
    const onClimbable = env.onClimbable;
    const frictionMul = env.ice ? 0.05 : env.slime ? 0.4 : 1;

    // ── Wish velocity (horizontal) ──
    const baseSpeed = controls.sneak
      ? this.sneakSpeed
      : controls.sprint && !controls.sneak
        ? this.sprintSpeed
        : this.walkSpeed;

    let wx = 0;
    let wz = 0;
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    if (controls.forward) {
      wx -= sin;
      wz -= cos;
    }
    if (controls.back) {
      wx += sin;
      wz += cos;
    }
    if (controls.left) {
      wx += cos;
      wz -= sin;
    }
    if (controls.right) {
      wx -= cos;
      wz += sin;
    }
    const len = Math.hypot(wx, wz);
    if (len > 1e-6) {
      wx /= len;
      wz /= len;
    }

    // Accelerate toward wish dir (not hard-set) — feels less robotic
    const accel = onGround ? 0.55 : inWater || inLava ? 0.25 : 0.12;
    const maxSpeed = baseSpeed * (inWater || inLava ? 0.6 : 1) * 2.45;
    if (len > 0) {
      vel.x += (wx * maxSpeed - vel.x) * accel;
      vel.z += (wz * maxSpeed - vel.z) * accel;
    } else if (onGround) {
      // Ground friction when no input
      const fr = 1 - this.groundDrag * frictionMul;
      vel.x *= Math.max(0, fr);
      vel.z *= Math.max(0, fr);
      if (Math.abs(vel.x) < 0.003) vel.x = 0;
      if (Math.abs(vel.z) < 0.003) vel.z = 0;
    } else {
      vel.x *= 1 - this.airDrag;
      vel.z *= 1 - this.airDrag;
    }

    // Jump
    if (controls.jump) {
      if (onGround) {
        vel.y = this.jumpVel;
        onGround = false;
      } else if (inWater || inLava) {
        vel.y = Math.min(vel.y + 0.04, 0.4);
      } else if (onClimbable) {
        vel.y = 0.15;
      }
    }

    // Climbable without jump: hold forward near ladder
    if (onClimbable && (controls.forward || controls.jump)) {
      vel.y = Math.max(vel.y, 0.12);
    }

    // Gravity / buoyancy
    if (inWater || inLava) {
      vel.y -= this.gravity * 0.3;
      vel.y *= 1 - this.waterDrag * 0.15;
      if (vel.y < -0.5) vel.y = -0.5;
    } else if (!onClimbable) {
      if (!onGround) {
        vel.y -= this.gravity;
        if (vel.y < -this.terminalVelocity) vel.y = -this.terminalVelocity;
      } else if (vel.y < 0) {
        vel.y = 0;
      }
    } else if (!controls.forward && !controls.jump) {
      vel.y = Math.max(vel.y - 0.05, -0.15); // slide down ladder slowly
    }

    // Integrate with collision (axis-separated)
    const half = this.playerWidth / 2;
    let nx = pos.x;
    let ny = pos.y;
    let nz = pos.z;

    // Scale velocity by dt relative to fixed 0.05 design point
    const scale = dt / 0.05;
    let vx = vel.x * scale;
    let vy = vel.y * scale;
    let vz = vel.z * scale;

    // --- X ---
    if (Math.abs(vx) > 1e-8) {
      const tryX = nx + vx;
      if (!this.collides(tryX, ny, nz, half)) {
        nx = tryX;
      } else {
        // Step up
        const stepped = this.tryStep(nx, ny, nz, vx, 0, half);
        if (stepped) {
          nx = stepped.x;
          ny = stepped.y;
        } else {
          vel.x = 0;
          vx = 0;
        }
      }
    }

    // --- Z ---
    if (Math.abs(vz) > 1e-8) {
      const tryZ = nz + vz;
      if (!this.collides(nx, ny, tryZ, half)) {
        nz = tryZ;
      } else {
        const stepped = this.tryStep(nx, ny, nz, 0, vz, half);
        if (stepped) {
          nz = stepped.z;
          ny = stepped.y;
        } else {
          vel.z = 0;
          vz = 0;
        }
      }
    }

    // --- Y ---
    if (Math.abs(vy) > 1e-8) {
      const tryY = ny + vy;
      if (!this.collides(nx, tryY, nz, half)) {
        ny = tryY;
        onGround = false;
      } else {
        if (vy < 0) {
          // Land on top of block
          ny = Math.floor(ny + vy) + 1 + 1e-4;
          // Snap to highest solid under feet
          const support = this.findSupportY(nx, ny, nz, half);
          if (support != null) ny = support;
          onGround = true;
        } else {
          // Ceiling
          ny = Math.floor(ny + this.playerHeight + vy) - this.playerHeight - 1e-4;
        }
        vel.y = 0;
      }
    } else {
      // Stationary Y — re-check ground
      onGround = this.isOnGround(nx, ny, nz, half);
    }

    // Prevent sinking into floor
    if (onGround) {
      const support = this.findSupportY(nx, ny + 0.2, nz, half);
      if (support != null && Math.abs(ny - support) < 0.6) ny = support;
    }

    return {
      position: new Vec3(nx, ny, nz),
      velocity: vel,
      onGround,
      yaw: state.yaw,
      pitch: state.pitch,
      inWater,
      inLava,
      onClimbable,
    };
  }

  private sampleEnvironment(pos: Vec3) {
    const x = Math.floor(pos.x);
    const y = Math.floor(pos.y);
    const z = Math.floor(pos.z);
    let inWater = false;
    let inLava = false;
    let onClimbable = false;
    let ice = false;
    let slime = false;

    for (let dy = 0; dy <= 1; dy++) {
      const id = this.world.getBlock(x, y + dy, z);
      const def = BlockRegistry.get(id);
      if (def.liquid || def.tags?.includes("water")) {
        if (def.tags?.includes("lava") || def.name.includes("lava")) inLava = true;
        else inWater = true;
      }
      if (def.tags?.includes("climb") || def.name.includes("ladder") || def.name.includes("vine") || def.name.includes("scaffolding")) {
        onClimbable = true;
      }
    }
    const below = BlockRegistry.get(this.world.getBlock(x, y - 1, z));
    if (below.name.includes("ice") || below.tags?.includes("ice")) ice = true;
    if (below.name.includes("slime")) slime = true;

    return { inWater, inLava, onClimbable, ice, slime };
  }

  /** AABB vs solid blocks */
  private collides(x: number, y: number, z: number, half: number): boolean {
    const minX = Math.floor(x - half);
    const maxX = Math.floor(x + half);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + this.playerHeight - 1e-4);
    const minZ = Math.floor(z - half);
    const maxZ = Math.floor(z + half);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          const id = this.world.getBlock(bx, by, bz);
          if (BlockRegistry.isSolid(id) && !BlockRegistry.get(id).passable) {
            // Skip non-full collision for passable solids like scaffolding handled as climbable
            if (BlockRegistry.get(id).tags?.includes("climb")) continue;
            return true;
          }
        }
      }
    }
    return false;
  }

  private isOnGround(x: number, y: number, z: number, half: number): boolean {
    const probe = y - 0.08;
    const pts = [
      [x, z],
      [x - half + 0.05, z - half + 0.05],
      [x + half - 0.05, z - half + 0.05],
      [x - half + 0.05, z + half - 0.05],
      [x + half - 0.05, z + half - 0.05],
    ];
    for (const [px, pz] of pts) {
      const bx = Math.floor(px);
      const bz = Math.floor(pz);
      const by = Math.floor(probe);
      if (BlockRegistry.isSolid(this.world.getBlock(bx, by, bz))) {
        // Ensure feet are near top of block
        if (y <= by + 1.05) return true;
      }
    }
    return false;
  }

  private findSupportY(x: number, y: number, z: number, half: number): number | null {
    let best: number | null = null;
    const pts = [
      [x, z],
      [x - half + 0.05, z],
      [x + half - 0.05, z],
      [x, z - half + 0.05],
      [x, z + half - 0.05],
    ];
    for (const [px, pz] of pts) {
      const bx = Math.floor(px);
      const bz = Math.floor(pz);
      for (let by = Math.floor(y); by >= Math.floor(y) - 2; by--) {
        if (BlockRegistry.isSolid(this.world.getBlock(bx, by, bz))) {
          const top = by + 1;
          if (best == null || top > best) best = top;
          break;
        }
      }
    }
    return best;
  }

  /** Try step up onto a block when horizontal move is blocked */
  private tryStep(
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
    half: number
  ): { x: number; y: number; z: number } | null {
    const maxStep = this.stepHeight;
    for (let step = 0.1; step <= maxStep + 0.01; step += 0.1) {
      const sy = y + step;
      if (this.collides(x, sy, z, half)) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (!this.collides(nx, sy, nz, half)) {
        // Must have support under new position
        if (this.isOnGround(nx, sy, nz, half) || this.findSupportY(nx, sy, nz, half) != null) {
          return { x: nx, y: sy, z: nz };
        }
      }
    }
    return null;
  }

  /** Raycast helper for look / dig assist */
  raycast(
    origin: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    maxDist = 5
  ): { x: number; y: number; z: number; id: number } | null {
    const dx = -Math.sin(yaw) * Math.cos(pitch);
    const dy = -Math.sin(pitch);
    const dz = -Math.cos(yaw) * Math.cos(pitch);
    const step = 0.1;
    let x = origin.x;
    let y = origin.y;
    let z = origin.z;
    for (let d = 0; d < maxDist; d += step) {
      x += dx * step;
      y += dy * step;
      z += dz * step;
      const bx = Math.floor(x);
      const by = Math.floor(y);
      const bz = Math.floor(z);
      const id = this.world.getBlock(bx, by, bz);
      if (id !== 0 && BlockRegistry.isSolid(id)) {
        return { x: bx, y: by, z: bz, id };
      }
    }
    return null;
  }
}

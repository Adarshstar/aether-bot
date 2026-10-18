/**
 * PathFollower – humanized movement:
 * imperfect sprint, occasional pauses, look-ahead, mild path wobble.
 */

import type { Bot } from "../core/Bot";
import type { Vec3 } from "../types";
import { distanceSquared } from "../types";

export interface PathFollowerOptions {
  arrivalThreshold?: number;
  sprint?: boolean;
  jumpObstacles?: boolean;
  /** Act more like a human player (pauses, variable sprint) */
  humanized?: boolean;
  /** Chance per second-ish to briefly pause while walking */
  pauseChance?: number;
}

export class PathFollower {
  private bot: Bot;
  private path: Vec3[] = [];
  private index = 0;
  private active = false;
  private opts: Required<PathFollowerOptions>;
  private tickHandler: (() => void) | null = null;
  private pauseUntil = 0;
  private lastPauseCheck = 0;
  private sprintToggle = true;

  constructor(bot: Bot, opts: PathFollowerOptions = {}) {
    this.bot = bot;
    this.opts = {
      arrivalThreshold: opts.arrivalThreshold ?? 0.65,
      sprint: opts.sprint ?? true,
      jumpObstacles: opts.jumpObstacles ?? true,
      humanized: opts.humanized ?? true,
      pauseChance: opts.pauseChance ?? 0.04,
    };
  }

  follow(path: Vec3[]): void {
    this.stop();
    if (!path.length) return;
    // Humanized: skip every other micro-waypoint on long paths for smoother feel
    if (this.opts.humanized && path.length > 12) {
      this.path = path.filter((_, i) => i === 0 || i === path.length - 1 || i % 2 === 0);
    } else {
      this.path = path;
    }
    this.index = 0;
    this.active = true;
    this.pauseUntil = 0;
    this.sprintToggle = this.opts.sprint;
    this.tickHandler = () => this.onTick();
    this.bot.on("physicsTick", this.tickHandler);
    console.log(`[PathFollower] Following ${this.path.length} waypoints (humanized=${this.opts.humanized})`);
    (this.bot as any).emit?.("pathStart", this.path);
  }

  stop(): void {
    if (!this.active && !this.tickHandler) return;
    this.active = false;
    this.path = [];
    this.index = 0;
    if (this.tickHandler) {
      this.bot.removeListener("physicsTick", this.tickHandler);
      this.tickHandler = null;
    }
    for (const c of ["forward", "back", "left", "right", "jump", "sprint"] as const) {
      this.bot.setControlState(c, false);
    }
  }

  get isFollowing() {
    return this.active;
  }
  get remaining() {
    return Math.max(0, this.path.length - this.index);
  }

  private onTick(): void {
    if (!this.active || !this.bot.entity) return;
    if (this.index >= this.path.length) {
      (this.bot as any).emit?.("goalReached");
      this.stop();
      return;
    }

    const now = Date.now();

    // Human pause: stop walking briefly as if checking surroundings
    if (this.opts.humanized && now < this.pauseUntil) {
      this.bot.setControlState("forward", false);
      this.bot.setControlState("sprint", false);
      return;
    }

    if (
      this.opts.humanized &&
      now - this.lastPauseCheck > 1000 &&
      Math.random() < this.opts.pauseChance
    ) {
      this.lastPauseCheck = now;
      this.pauseUntil = now + 180 + Math.random() * 420;
      // Glance sideways
      if (this.bot.entity) {
        const yaw = this.bot.entity.yaw + (Math.random() - 0.5) * 1.2;
        const p = this.bot.entity.position;
        this.bot.lookAt({
          x: p.x - Math.sin(yaw) * 3,
          y: p.y + 1.4,
          z: p.z - Math.cos(yaw) * 3,
        });
      }
      return;
    }

    const target = this.path[this.index];
    const pos = this.bot.entity.position;
    const distSq = distanceSquared(pos, target);

    if (distSq <= this.opts.arrivalThreshold ** 2) {
      this.index++;
      if (this.index >= this.path.length) {
        (this.bot as any).emit?.("goalReached");
        this.stop();
        return;
      }
      return;
    }

    // Look slightly ahead on path (human anticipates)
    const lookIdx = Math.min(this.index + (this.opts.humanized ? 1 : 0), this.path.length - 1);
    const look = this.path[lookIdx];
    // Mild aim noise
    if (this.opts.humanized) {
      this.bot.lookAt({
        x: look.x + (Math.random() - 0.5) * 0.15,
        y: look.y + 0.1,
        z: look.z + (Math.random() - 0.5) * 0.15,
      });
    } else {
      this.bot.lookAt(target);
    }

    this.bot.setControlState("forward", true);

    // Variable sprint — humans don't hold sprint 100% of long walks
    if (this.opts.humanized && this.opts.sprint) {
      if (Math.random() < 0.01) this.sprintToggle = !this.sprintToggle;
      // Always sprint if far from goal end
      if (this.remaining > 8) this.sprintToggle = true;
      this.bot.setControlState("sprint", this.sprintToggle);
    } else {
      this.bot.setControlState("sprint", this.opts.sprint);
    }

    const dy = target.y - pos.y;
    this.bot.setControlState("jump", this.opts.jumpObstacles && dy > 0.4);

    (this.bot as any).protocol?.sendMovement?.(
      { x: pos.x, y: pos.y, z: pos.z },
      this.bot.entity.yaw,
      this.bot.entity.pitch
    );
  }
}

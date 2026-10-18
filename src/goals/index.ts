/**
 * Advanced pathfinding goals – modern rewrite inspired by mineflayer-pathfinder
 * Optimized for Bedrock AI engine
 */

export interface NodeLike {
  x: number;
  y: number;
  z: number;
}

export abstract class Goal {
  abstract heuristic(node: NodeLike): number;
  abstract isEnd(node: NodeLike): boolean;
  hasChanged(): boolean { return false; }
  isValid(): boolean { return true; }
}

function distXZ(dx: number, dz: number): number {
  dx = Math.abs(dx); dz = Math.abs(dz);
  return Math.max(dx, dz) + Math.min(dx, dz) * 0.41421356237;
}

/** Stand exactly on a block (feet) */
export class GoalBlock extends Goal {
  constructor(public x: number, public y: number, public z: number) {
    super();
    this.x = Math.floor(x); this.y = Math.floor(y); this.z = Math.floor(z);
  }
  heuristic(n: NodeLike) {
    return distXZ(this.x - n.x, this.z - n.z) + Math.abs(this.y - n.y);
  }
  isEnd(n: NodeLike) {
    return n.x === this.x && n.y === this.y && n.z === this.z;
  }
}

/** Get within range of a point (entity follow, interact) */
export class GoalNear extends Goal {
  private rangeSq: number;
  constructor(public x: number, public y: number, public z: number, range: number) {
    super();
    this.x = Math.floor(x); this.y = Math.floor(y); this.z = Math.floor(z);
    this.rangeSq = range * range;
  }
  heuristic(n: NodeLike) {
    return distXZ(this.x - n.x, this.z - n.z) + Math.abs(this.y - n.y);
  }
  isEnd(n: NodeLike) {
    const dx = this.x - n.x, dy = this.y - n.y, dz = this.z - n.z;
    return dx * dx + dy * dy + dz * dz <= this.rangeSq;
  }
}

/** Reach XZ regardless of Y */
export class GoalXZ extends Goal {
  constructor(public x: number, public z: number) {
    super();
    this.x = Math.floor(x); this.z = Math.floor(z);
  }
  heuristic(n: NodeLike) { return distXZ(this.x - n.x, this.z - n.z); }
  isEnd(n: NodeLike) { return n.x === this.x && n.z === this.z; }
}

export class GoalNearXZ extends Goal {
  private rangeSq: number;
  constructor(public x: number, public z: number, range: number) {
    super();
    this.x = Math.floor(x); this.z = Math.floor(z);
    this.rangeSq = range * range;
  }
  heuristic(n: NodeLike) { return distXZ(this.x - n.x, this.z - n.z); }
  isEnd(n: NodeLike) {
    const dx = this.x - n.x, dz = this.z - n.z;
    return dx * dx + dz * dz <= this.rangeSq;
  }
}

/** Y level only (e.g. surface) */
export class GoalY extends Goal {
  constructor(public y: number) { super(); this.y = Math.floor(y); }
  heuristic(n: NodeLike) { return Math.abs(this.y - n.y); }
  isEnd(n: NodeLike) { return n.y === this.y; }
}

/** Composite: any sub-goal succeeds */
export class GoalCompositeAny extends Goal {
  constructor(public goals: Goal[]) { super(); }
  heuristic(n: NodeLike) {
    let best = Infinity;
    for (const g of this.goals) best = Math.min(best, g.heuristic(n));
    return best;
  }
  isEnd(n: NodeLike) { return this.goals.some((g) => g.isEnd(n)); }
}

/** Composite: all sub-goals must succeed (rare) */
export class GoalCompositeAll extends Goal {
  constructor(public goals: Goal[]) { super(); }
  heuristic(n: NodeLike) {
    return this.goals.reduce((s, g) => s + g.heuristic(n), 0);
  }
  isEnd(n: NodeLike) { return this.goals.every((g) => g.isEnd(n)); }
}

/** Invert: stay away from a point */
export class GoalInvert extends Goal {
  constructor(public goal: Goal) { super(); }
  heuristic(n: NodeLike) { return -this.goal.heuristic(n); }
  isEnd(n: NodeLike) { return !this.goal.isEnd(n); }
}

/** Follow a moving entity (revalidated each tick) */
export class GoalFollow extends Goal {
  private rangeSq: number;
  constructor(
    private getPos: () => { x: number; y: number; z: number } | null,
    range: number
  ) {
    super();
    this.rangeSq = range * range;
  }
  private target() {
    const p = this.getPos();
    if (!p) return null;
    return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
  }
  heuristic(n: NodeLike) {
    const t = this.target();
    if (!t) return 0;
    return distXZ(t.x - n.x, t.z - n.z) + Math.abs(t.y - n.y);
  }
  isEnd(n: NodeLike) {
    const t = this.target();
    if (!t) return true;
    const dx = t.x - n.x, dy = t.y - n.y, dz = t.z - n.z;
    return dx * dx + dy * dy + dz * dz <= this.rangeSq;
  }
  hasChanged() { return true; } // always recheck for moving targets
  isValid() { return this.getPos() !== null; }
}

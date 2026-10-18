/**
 * High-performance Vec3 – modern replacement for vec3 package
 */

export class Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  static from(v: { x: number; y: number; z: number } | number, y?: number, z?: number): Vec3 {
    if (typeof v === "number") return new Vec3(v, y ?? 0, z ?? 0);
    return new Vec3(v.x, v.y, v.z);
  }

  offset(dx: number, dy: number, dz: number): Vec3 {
    return new Vec3(this.x + dx, this.y + dy, this.z + dz);
  }

  add(v: Vec3): Vec3 { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  subtract(v: Vec3): Vec3 { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  scaled(s: number): Vec3 { return new Vec3(this.x * s, this.y * s, this.z * s); }
  negate(): Vec3 { return new Vec3(-this.x, -this.y, -this.z); }
  floored(): Vec3 { return new Vec3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
  rounded(): Vec3 { return new Vec3(Math.round(this.x), Math.round(this.y), Math.round(this.z)); }

  distanceTo(v: Vec3): number {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  distanceSquared(v: Vec3): number {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  equals(v: Vec3): boolean {
    return this.x === v.x && this.y === v.y && this.z === v.z;
  }

  clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }
  toArray(): [number, number, number] { return [this.x, this.y, this.z]; }
  toString(): string { return `(${this.x}, ${this.y}, ${this.z})`; }

  /** Unit vector in yaw/pitch look direction */
  static fromYawPitch(yaw: number, pitch: number): Vec3 {
    const cosP = Math.cos(pitch);
    return new Vec3(-Math.sin(yaw) * cosP, -Math.sin(pitch), -Math.cos(yaw) * cosP);
  }
}

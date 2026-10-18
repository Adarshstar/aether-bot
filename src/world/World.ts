/**
 * World Manager – fast column storage + spatial queries
 */

import { Chunk } from "./Chunk";
import type { Vec3 } from "../types";
import { distanceSquared } from "../types";
import { BlockRegistry } from "../registry/blocks";

export class World {
  private columns = new Map<string, Chunk>();
  private maxColumns = 1024; // soft limit for memory safety

  private key(cx: number, cz: number) {
    return `${cx}:${cz}`;
  }

  getColumn(cx: number, cz: number): Chunk | undefined {
    return this.columns.get(this.key(cx, cz));
  }

  getOrCreateColumn(cx: number, cz: number): Chunk {
    const k = this.key(cx, cz);
    let col = this.columns.get(k);
    if (!col) {
      if (this.columns.size >= this.maxColumns) {
        // simple eviction of arbitrary oldest (can be improved with LRU)
        const first = this.columns.keys().next().value;
        if (first) this.columns.delete(first);
      }
      col = new Chunk(cx, cz);
      this.columns.set(k, col);
    }
    return col;
  }

  setColumn(cx: number, cz: number, chunk: Chunk): void {
    this.columns.set(this.key(cx, cz), chunk);
  }

  unloadColumn(cx: number, cz: number): void {
    this.columns.delete(this.key(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    const cx = x >> 4;
    const cz = z >> 4;
    const col = this.getColumn(cx, cz);
    if (!col) return 0;
    return col.getBlock(x & 15, y, z & 15);
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    const cx = x >> 4;
    const cz = z >> 4;
    const col = this.getOrCreateColumn(cx, cz);
    col.setBlock(x & 15, y, z & 15, id);
  }

  /**
   * Fast radial search for a block matching the predicate.
   * Uses expanding diamond / shell to find nearest first.
   */
  findBlock(
    origin: Vec3,
    matching: (id: number) => boolean,
    maxDistance = 32
  ): Vec3 | null {
    const ox = Math.floor(origin.x);
    const oy = Math.floor(origin.y);
    const oz = Math.floor(origin.z);
    const max = Math.floor(maxDistance);

    // r=0 center first
    {
      const id = this.getBlock(ox, oy, oz);
      if (matching(id)) return { x: ox, y: oy, z: oz };
    }

    // Expanding hollow shells — nearest-first (faster than full volume scan)
    for (let r = 1; r <= max; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r && r > 0) {
            // vertical pillars only on outer XZ ring
            continue;
          }
          for (let dy = -r; dy <= r; dy++) {
            const x = ox + dx, y = oy + dy, z = oz + dz;
            const id = this.getBlock(x, y, z);
            if (matching(id)) return { x, y, z };
          }
        }
      }
    }
    return null;
  }

  /** Returns all loaded columns around a point within radius (in chunks) */
  getColumnsAround(cx: number, cz: number, radius: number): Chunk[] {
    const out: Chunk[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const col = this.getColumn(cx + dx, cz + dz);
        if (col) out.push(col);
      }
    }
    return out;
  }

  get loadedColumns() {
    return this.columns.size;
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return BlockRegistry.isSolid(this.getBlock(x, y, z));
  }

  isPassableAt(x: number, y: number, z: number): boolean {
    return BlockRegistry.isPassable(this.getBlock(x, y, z));
  }

  clear() {
    this.columns.clear();
  }
}

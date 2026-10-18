/**
 * Uniform spatial hash grid — O(1) insert / O(k) neighborhood queries.
 * Faster nearest-entity than linear scan of all entities.
 */

export interface SpatialPoint {
  id: number;
  x: number;
  y: number;
  z: number;
}

export class SpatialIndex<T extends SpatialPoint = SpatialPoint> {
  private cellSize: number;
  private cells = new Map<number, Map<number, T>>();
  private byId = new Map<number, { cx: number; cz: number; item: T }>();

  constructor(cellSize = 8) {
    this.cellSize = cellSize;
  }

  private pack(cx: number, cz: number): number {
    return ((cx & 0xffff) << 16) | (cz & 0xffff);
  }

  private cell(x: number, z: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  clear() {
    this.cells.clear();
    this.byId.clear();
  }

  get size() {
    return this.byId.size;
  }

  upsert(item: T) {
    const prev = this.byId.get(item.id);
    const [cx, cz] = this.cell(item.x, item.z);
    if (prev) {
      if (prev.cx === cx && prev.cz === cz) {
        prev.item = item;
        const bucket = this.cells.get(this.pack(cx, cz));
        if (bucket) bucket.set(item.id, item);
        return;
      }
      const oldBucket = this.cells.get(this.pack(prev.cx, prev.cz));
      oldBucket?.delete(item.id);
      if (oldBucket && oldBucket.size === 0) this.cells.delete(this.pack(prev.cx, prev.cz));
    }
    let bucket = this.cells.get(this.pack(cx, cz));
    if (!bucket) {
      bucket = new Map();
      this.cells.set(this.pack(cx, cz), bucket);
    }
    bucket.set(item.id, item);
    this.byId.set(item.id, { cx, cz, item });
  }

  remove(id: number) {
    const prev = this.byId.get(id);
    if (!prev) return;
    const bucket = this.cells.get(this.pack(prev.cx, prev.cz));
    bucket?.delete(id);
    if (bucket && bucket.size === 0) this.cells.delete(this.pack(prev.cx, prev.cz));
    this.byId.delete(id);
  }

  queryRadius(x: number, z: number, radius: number): T[] {
    const r = Math.ceil(radius / this.cellSize);
    const [cx, cz] = this.cell(x, z);
    const out: T[] = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const bucket = this.cells.get(this.pack(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const item of bucket.values()) out.push(item);
      }
    }
    return out;
  }

  nearest(
    x: number,
    y: number,
    z: number,
    maxDist: number,
    pred: (item: T) => boolean = () => true
  ): T | null {
    const candidates = this.queryRadius(x, z, maxDist);
    let best: T | null = null;
    let bestD = maxDist * maxDist;
    for (const item of candidates) {
      if (!pred(item)) continue;
      const dx = item.x - x;
      const dy = item.y - y;
      const dz = item.z - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }
}

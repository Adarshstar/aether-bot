/**
 * High-performance Chunk — V8: section-based sparse storage
 *
 * V7 and earlier allocated one flat Uint16Array per column up front
 * (16*384*16 = 98,304 cells ≈ 196KB per loaded column, even for columns
 * that are 90% air). V8 splits each column into 24 vertical 16x16x16
 * sections (SUBCHUNK_SIZE-aligned, matching the network SubChunk layout
 * 1:1) and only allocates a section's backing array the first time a
 * non-air block is written into it. Empty sections cost ~0 bytes instead
 * of 4096 u16 cells each, which matters once a bot holds its 1024-column
 * soft cache (`World.maxColumns`) resident at once.
 */

const SECTION_SIZE = 16;
const SECTION_VOLUME = SECTION_SIZE * SECTION_SIZE * SECTION_SIZE; // 4096

export class Chunk {
  readonly x: number;
  readonly z: number;
  private readonly sizeX = 16;
  private readonly sizeZ = 16;
  private readonly sizeY = 384;
  readonly minY = -64;
  readonly maxY = 320;
  readonly sectionCount = this.sizeY / SECTION_SIZE; // 24
  /** Lazily-allocated 16x16x16 sections; null = fully air (not yet touched) */
  private sections: (Uint16Array | null)[];
  private dirty = false;

  constructor(x: number, z: number) {
    this.x = x;
    this.z = z;
    this.sections = new Array(this.sectionCount).fill(null);
  }

  /** Section index for a world-space Y (handles the -64 offset) */
  private sectionIndexForY(y: number): number {
    return Math.floor((y - this.minY) / SECTION_SIZE);
  }

  /** Index within a 16x16x16 section, XZY-packed to match network SubChunk layout */
  private sectionLocalIndex(lx: number, y: number, lz: number): number {
    const ly = (y - this.minY) & (SECTION_SIZE - 1);
    return (lx & 15) | ((lz & 15) << 4) | (ly << 8);
  }

  inBounds(lx: number, y: number, lz: number): boolean {
    return lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && y >= this.minY && y < this.maxY;
  }

  getBlock(lx: number, y: number, lz: number): number {
    if (!this.inBounds(lx, y, lz)) return 0;
    const si = this.sectionIndexForY(y);
    const section = this.sections[si];
    if (!section) return 0; // untouched section = all air, no allocation needed
    return section[this.sectionLocalIndex(lx, y, lz)];
  }

  setBlock(lx: number, y: number, lz: number, id: number): void {
    if (!this.inBounds(lx, y, lz)) return;
    const si = this.sectionIndexForY(y);
    let section = this.sections[si];
    if (!section) {
      if (id === 0) return; // writing air into an already-air section: no-op, stay sparse
      section = new Uint16Array(SECTION_VOLUME);
      this.sections[si] = section;
    }
    section[this.sectionLocalIndex(lx, y, lz)] = id;
    this.dirty = true;
  }

  /** Bulk load (e.g. from network palette) — accepts a full-column flat array for compatibility */
  load(data: ArrayLike<number>): void {
    if (data.length !== this.sizeX * this.sizeY * this.sizeZ) return;
    // Legacy layout was (y-minY)*256 + lz*16 + lx (YZX, Y slowest).
    // Re-slice into per-section arrays, allocating only non-empty sections.
    for (let si = 0; si < this.sectionCount; si++) {
      let section: Uint16Array | null = null;
      const yBase = si * SECTION_SIZE;
      for (let ly = 0; ly < SECTION_SIZE; ly++) {
        const y = this.minY + yBase + ly;
        const srcRowBase = (yBase + ly) * 256;
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            const v = data[srcRowBase + lz * 16 + lx] ?? 0;
            if (v !== 0) {
              if (!section) section = new Uint16Array(SECTION_VOLUME);
              section[this.sectionLocalIndex(lx, y, lz)] = v;
            }
          }
        }
      }
      this.sections[si] = section;
    }
    this.dirty = false;
  }

  /** Fill a vertical column (useful for flat worlds / testing) */
  fillColumn(lx: number, lz: number, fromY: number, toY: number, id: number): void {
    for (let y = fromY; y <= toY; y++) this.setBlock(lx, y, lz, id);
  }

  /** V8: how many of the 24 sections actually have an allocated array — for perf/debug */
  get allocatedSections(): number {
    let n = 0;
    for (const s of this.sections) if (s) n++;
    return n;
  }

  get isDirty() { return this.dirty; }
  markClean() { this.dirty = false; }
}


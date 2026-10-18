/**
 * Binary min-heap – modern efficient open-set for A*
 * Inspired by mineflayer-pathfinder heap, typed & tighter
 */

export class MinHeap<T> {
  private data: T[] = [];
  constructor(private score: (item: T) => number) {}

  get size() { return this.data.length; }
  clear() { this.data.length = 0; }

  push(item: T) {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    const n = this.data.length;
    if (n === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (n > 1) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  update(item: T) {
    const i = this.data.indexOf(item);
    if (i >= 0) this.bubbleUp(i);
  }

  private bubbleUp(i: number) {
    const item = this.data[i];
    const sc = this.score(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score(this.data[parent]) <= sc) break;
      this.data[i] = this.data[parent];
      i = parent;
    }
    this.data[i] = item;
  }

  private sinkDown(i: number) {
    const n = this.data.length;
    const item = this.data[i];
    const sc = this.score(item);
    for (;;) {
      let left = i * 2 + 1;
      let right = left + 1;
      let smallest = i;
      if (left < n && this.score(this.data[left]) < (smallest === i ? sc : this.score(this.data[smallest]))) {
        smallest = left;
      }
      if (right < n && this.score(this.data[right]) < this.score(this.data[smallest])) {
        smallest = right;
      }
      if (smallest === i) break;
      this.data[i] = this.data[smallest];
      i = smallest;
    }
    this.data[i] = item;
  }
}

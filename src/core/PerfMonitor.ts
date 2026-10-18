/**
 * Lightweight performance monitor — path times, tick budgets, query counts.
 */

export class PerfMonitor {
  private samples = new Map<string, number[]>();
  private counters = new Map<string, number>();
  private maxSamples = 60;

  markStart(name: string): () => number {
    const t0 = performance.now();
    return () => {
      const dt = performance.now() - t0;
      this.record(name, dt);
      return dt;
    };
  }

  /** Add to tick budget instrumentation */
  warnThresholdMs = 45; // 45ms warning for 50ms physics tick

  record(name: string, ms: number) {
    let arr = this.samples.get(name);
    if (!arr) {
      arr = [];
      this.samples.set(name, arr);
    }
    arr.push(ms);
    if (arr.length > this.maxSamples) arr.shift();

    if (ms > this.warnThresholdMs) {
      console.warn(`[Perf] Warning: ${name} took ${ms.toFixed(2)}ms (budget=${this.warnThresholdMs}ms)`);
    }
  }

  incr(name: string, n = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + n);
  }

  avg(name: string): number {
    const arr = this.samples.get(name);
    if (!arr?.length) return 0;
    let s = 0;
    for (const v of arr) s += v;
    return s / arr.length;
  }

  snapshot(): Record<string, { avgMs: number; n: number; count?: number }> {
    const out: Record<string, { avgMs: number; n: number; count?: number }> = {};
    for (const [k, arr] of this.samples) {
      out[k] = { avgMs: this.avg(k), n: arr.length, count: this.counters.get(k) };
    }
    for (const [k, c] of this.counters) {
      if (!out[k]) out[k] = { avgMs: 0, n: 0, count: c };
    }
    return out;
  }

  reset() {
    this.samples.clear();
    this.counters.clear();
  }
}

export const globalPerf = new PerfMonitor();

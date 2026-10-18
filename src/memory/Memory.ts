/**
 * Aether V7 — Phase 4: Persistent Player Memory
 *
 * Lightweight JSON-file-backed memory of players the bot has met: first/last
 * seen, interaction count, and a short rolling log of recent chat lines.
 * Loaded at startup and flushed to disk periodically + on process exit, so
 * relationships survive bot restarts (important with the Guardian Loop
 * restarting the process every crash).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface PlayerMemoryEntry {
  username: string;
  firstSeen: number;
  lastSeen: number;
  interactionCount: number;
  /** Last few chat lines from this player, most recent last */
  recentMessages: string[];
  /** Freeform notes the bot/LLM can attach (e.g. "likes mining", "is the admin") */
  notes: string[];
}

export interface MemoryOptions {
  file?: string;
  maxRecentMessages?: number;
  maxNotes?: number;
  /** Autosave interval in ms (default 30s) */
  autosaveMs?: number;
}

interface MemoryData {
  players: Record<string, PlayerMemoryEntry>;
  version: 1;
}

export class AetherMemory {
  private data: MemoryData = { players: {}, version: 1 };
  private file: string;
  private maxRecentMessages: number;
  private maxNotes: number;
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: MemoryOptions = {}) {
    this.file = opts.file ?? ".aether-memory/players.json";
    this.maxRecentMessages = opts.maxRecentMessages ?? 10;
    this.maxNotes = opts.maxNotes ?? 20;
    this.load();
    const autosaveMs = opts.autosaveMs ?? 30_000;
    this.timer = setInterval(() => this.flush(), autosaveMs);
    process.on("exit", () => this.flush());
  }

  private load() {
    try {
      if (existsSync(this.file)) {
        const raw = readFileSync(this.file, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.players) {
          this.data = parsed;
        }
      }
    } catch (err: any) {
      console.warn("[Memory] failed to load, starting fresh:", err?.message ?? err);
    }
  }

  flush() {
    if (!this.dirty) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch (err: any) {
      console.warn("[Memory] failed to save:", err?.message ?? err);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }

  private entryFor(username: string): PlayerMemoryEntry {
    const key = username.toLowerCase();
    let e = this.data.players[key];
    if (!e) {
      e = {
        username,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        interactionCount: 0,
        recentMessages: [],
        notes: [],
      };
      this.data.players[key] = e;
    }
    return e;
  }

  /** Record a chat line from a player */
  noteInteraction(username: string, message: string) {
    const e = this.entryFor(username);
    e.lastSeen = Date.now();
    e.interactionCount++;
    e.recentMessages.push(message.slice(0, 200));
    while (e.recentMessages.length > this.maxRecentMessages) e.recentMessages.shift();
    this.dirty = true;
  }

  /** Attach a freeform note (e.g. from LLM "remember" action) */
  addNote(username: string, note: string) {
    const e = this.entryFor(username);
    e.notes.push(note.slice(0, 300));
    while (e.notes.length > this.maxNotes) e.notes.shift();
    this.dirty = true;
  }

  get(username: string): PlayerMemoryEntry | null {
    return this.data.players[username.toLowerCase()] ?? null;
  }

  isKnown(username: string): boolean {
    return username.toLowerCase() in this.data.players;
  }

  all(): PlayerMemoryEntry[] {
    return Object.values(this.data.players);
  }

  /** Short text summary for a player, suitable for LLM system-prompt injection */
  summaryFor(username: string): string | null {
    const e = this.get(username);
    if (!e) return null;
    const ageMin = Math.round((Date.now() - e.firstSeen) / 60000);
    const parts = [`Known player ${e.username}, met ~${ageMin}min ago, ${e.interactionCount} interactions.`];
    if (e.notes.length) parts.push(`Notes: ${e.notes.slice(-3).join("; ")}`);
    return parts.join(" ");
  }
}

export function createMemory(opts?: MemoryOptions) {
  return new AetherMemory(opts);
}

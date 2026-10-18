/**
 * V8 Structured Logger
 * Rotates logs, prefixes with timestamps, and keeps Aether machine-readable.
 */
import { appendFileSync, statSync, renameSync } from "fs";

const LOG_FILE = "logs/aether.log";
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

export function log(level: "INFO" | "WARN" | "ERROR", message: string, data?: any) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    data
  };

  try {
    if (statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      renameSync(LOG_FILE, LOG_FILE + ".1");
    }
  } catch {}

  appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}

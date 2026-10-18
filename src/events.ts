/**
 * Canonical event names for Aether bots
 */
export const AetherEvents = {
  login: "login",
  spawn: "spawn",
  disconnect: "disconnect",
  error: "error",
  inject_allowed: "inject_allowed",
  chat: "chat",
  physicsTick: "physicsTick",
  entitySpawn: "entitySpawn",
  entityGone: "entityGone",
  entityMoved: "entityMoved",
  health: "health",
  death: "death",
  blockUpdate: "blockUpdate",
  move: "move",
  inventory: "inventory",
  pathStart: "pathStart",
  pathStop: "pathStop",
  goalReached: "goalReached",
} as const;

export type AetherEventName = (typeof AetherEvents)[keyof typeof AetherEvents];

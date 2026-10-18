/**
 * Personality traits that shape human-like bot behavior.
 * Values are 0..1 unless noted.
 */

export interface PersonalityTraits {
  /** Seeks new areas and chat topics */
  curiosity: number;
  /** Avoids danger, retreats early */
  caution: number;
  /** Chats and responds to players */
  sociability: number;
  /** Prefers combat / chase */
  aggression: number;
  /** Less movement when idle; longer pauses */
  laziness: number;
  /** How often to look around / fidget */
  expressiveness: number;
  /** Reaction delay multiplier (1 = normal human) */
  reactionTime: number;
  /** Display name flavor for chat */
  style: "friendly" | "quiet" | "chaotic" | "serious" | "playful";
}

export type PersonalityPreset =
  | "default"
  | "explorer"
  | "guard"
  | "social"
  | "coward"
  | "berserker"
  | "afk_buddy";

const PRESETS: Record<PersonalityPreset, PersonalityTraits> = {
  default: {
    curiosity: 0.55,
    caution: 0.45,
    sociability: 0.5,
    aggression: 0.35,
    laziness: 0.3,
    expressiveness: 0.5,
    reactionTime: 1,
    style: "friendly",
  },
  explorer: {
    curiosity: 0.9,
    caution: 0.35,
    sociability: 0.4,
    aggression: 0.25,
    laziness: 0.15,
    expressiveness: 0.6,
    reactionTime: 0.9,
    style: "playful",
  },
  guard: {
    curiosity: 0.25,
    caution: 0.4,
    sociability: 0.3,
    aggression: 0.75,
    laziness: 0.2,
    expressiveness: 0.35,
    reactionTime: 0.75,
    style: "serious",
  },
  social: {
    curiosity: 0.5,
    caution: 0.4,
    sociability: 0.95,
    aggression: 0.2,
    laziness: 0.4,
    expressiveness: 0.8,
    reactionTime: 1.1,
    style: "friendly",
  },
  coward: {
    curiosity: 0.3,
    caution: 0.95,
    sociability: 0.45,
    aggression: 0.05,
    laziness: 0.35,
    expressiveness: 0.55,
    reactionTime: 1.3,
    style: "quiet",
  },
  berserker: {
    curiosity: 0.4,
    caution: 0.1,
    sociability: 0.25,
    aggression: 0.95,
    laziness: 0.1,
    expressiveness: 0.7,
    reactionTime: 0.65,
    style: "chaotic",
  },
  afk_buddy: {
    curiosity: 0.2,
    caution: 0.5,
    sociability: 0.7,
    aggression: 0.1,
    laziness: 0.85,
    expressiveness: 0.4,
    reactionTime: 1.4,
    style: "quiet",
  },
};

export function createPersonality(
  preset: PersonalityPreset | Partial<PersonalityTraits> = "default"
): PersonalityTraits {
  if (typeof preset === "string") {
    return { ...PRESETS[preset] };
  }
  return { ...PRESETS.default, ...preset };
}

export function reactionDelayMs(p: PersonalityTraits, baseMs = 200): number {
  // Human-like: 150–600ms scaled by trait + small jitter
  const v = baseMs * p.reactionTime * (0.7 + Math.random() * 0.6);
  return Math.max(80, Math.min(900, v));
}

export function shouldAct(probability: number, traitBoost = 0): boolean {
  return Math.random() < Math.min(1, Math.max(0, probability + traitBoost));
}

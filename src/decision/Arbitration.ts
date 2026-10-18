/**
 * V8: Control arbitration between the reactive DecisionEngine and the LLM-driven Agent.
 *
 * Problem this fixes: DecisionEngine and Agent previously ran as two fully independent
 * loops that could both issue bot.goTo / bot.combat.attack / bot.pathFollower.follow in
 * the same tick window — e.g. the LLM planner mid-executing a multi-step "go mine iron"
 * plan while DecisionEngine's guard-mode reactive logic also tries to path the bot
 * toward a zombie. Whichever call landed last silently won, with no coordination, which
 * made behavior nondeterministic and could strand the LLM plan mid-path.
 *
 * Fix: a tiny priority-stack arbiter. Any subsystem that wants to drive movement/combat
 * must first `claim()` control at its priority tier. A claim only succeeds if no other
 * owner currently holds a higher-priority claim that hasn't expired. Survival-critical
 * reactive behavior (low HP flee/eat, nearby hostile in guard mode) always outranks the
 * LLM's proposals, matching the V8 plan: "LLM Agent proposes, reactive DecisionEngine
 * overrides only for survival-critical events."
 */

export enum Priority {
  IDLE = 0,
  /** LLM planner proposing a multi-step action (mine, build, travel, chat) */
  LLM_PROPOSAL = 10,
  /** Personality-driven social/explore behavior in autonomous mode */
  SOCIAL = 20,
  /** Player-issued direct commands (!goto, !follow) */
  COMMAND = 40,
  /** Guard-mode / autonomous combat against a detected hostile */
  COMBAT = 60,
  /** Low HP / starving / drowning — always wins */
  SURVIVAL_CRITICAL = 100,
}

interface ControlClaim {
  owner: string;
  priority: Priority;
  expiresAt: number;
}

export class Arbiter {
  private current: ControlClaim | null = null;

  /**
   * Attempt to take control at the given priority. Succeeds if nobody holds a strictly
   * higher, non-expired claim, or if the same owner is renewing its own claim.
   * `holdMs` is how long this claim stays valid without being renewed (default 1200ms —
   * comfortably longer than both the DecisionEngine tick (~450ms) and a single Agent
   * action's typical duration).
   */
  claim(owner: string, priority: Priority, holdMs = 1200): boolean {
    const now = Date.now();
    if (this.current && this.current.owner !== owner && this.current.expiresAt > now && this.current.priority > priority) {
      return false;
    }
    this.current = { owner, priority, expiresAt: now + holdMs };
    return true;
  }

  /** Release a claim early (e.g. mode switched back to idle, combat target died) */
  release(owner: string): void {
    if (this.current?.owner === owner) this.current = null;
  }

  /** True once an expired claim has naturally lapsed — lets lower priority back in */
  private prune(): void {
    if (this.current && this.current.expiresAt <= Date.now()) this.current = null;
  }

  get activeOwner(): string | null {
    this.prune();
    return this.current?.owner ?? null;
  }

  get activePriority(): Priority {
    this.prune();
    return this.current?.priority ?? Priority.IDLE;
  }

  /** Can `owner` act right now at `priority`? (does not take the claim) */
  canAct(owner: string, priority: Priority): boolean {
    this.prune();
    return !this.current || this.current.owner === owner || this.current.priority <= priority;
  }
}

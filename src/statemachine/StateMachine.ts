/**
 * Behavior state machine – mineflayer-statemachine inspired
 */

export type StateTransition = {
  parent: string;
  child: string;
  when: () => boolean;
};

export abstract class BehaviorState {
  abstract name: string;
  onEnter?(): void;
  onExit?(): void;
  onUpdate?(): void;
}

export class StateMachine {
  private states = new Map<string, BehaviorState>();
  private transitions: StateTransition[] = [];
  private current: string | null = null;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  addState(state: BehaviorState) {
    this.states.set(state.name, state);
  }

  addTransition(t: StateTransition) {
    this.transitions.push(t);
  }

  start(initial: string, intervalMs = 100) {
    this.current = initial;
    this.states.get(initial)?.onEnter?.();
    this.running = true;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.current) this.states.get(this.current)?.onExit?.();
    this.current = null;
  }

  private tick() {
    if (!this.running || !this.current) return;
    this.states.get(this.current)?.onUpdate?.();
    for (const t of this.transitions) {
      if (t.parent === this.current && t.when()) {
        this.states.get(this.current)?.onExit?.();
        this.current = t.child;
        this.states.get(this.current)?.onEnter?.();
        break;
      }
    }
  }

  get state() { return this.current; }
}

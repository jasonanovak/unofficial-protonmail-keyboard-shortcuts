// Action Registry — see DESIGN.md §3.5.
//
// Flat map of action ID → Action. The contract between the Keybinding Engine
// (which knows keystrokes) and the Selector Module (which knows the DOM).
// New shortcuts are added by registering an Action here.

import type { Scope } from "./scope-detector.js";

export type ActionContext = {
  actionId: string;
};

export type Action = {
  id: string;
  scopes: Scope[];
  defaultBinding: string;
  label: string;
  run: (ctx: ActionContext) => void;
  /**
   * Optional gate. Returning false aborts the dispatch BEFORE the engine
   * calls preventDefault/stopPropagation, so the keystroke continues to
   * its natural handler. Used by compose-scope shortcuts to defer Esc /
   * Ctrl+Enter / Ctrl+K to an open sub-modal's own handler.
   */
  canFire?: (ctx: ActionContext) => boolean;
};

export class ActionRegistry {
  private readonly byId = new Map<string, Action>();

  register(action: Action): void {
    if (this.byId.has(action.id)) {
      throw new Error(`Duplicate action id: ${action.id}`);
    }
    this.byId.set(action.id, action);
  }

  registerAll(actions: Iterable<Action>): void {
    for (const a of actions) this.register(a);
  }

  get(id: string): Action | undefined {
    return this.byId.get(id);
  }

  all(): Action[] {
    return [...this.byId.values()];
  }

  forScope(scope: Scope): Action[] {
    return this.all().filter(
      (a) => a.scopes.includes(scope) || a.scopes.includes("global"),
    );
  }

  /**
   * Returns true if the action fired, false if it was unknown, gated by its
   * canFire predicate, or threw. Callers (the engine) use the return value to
   * decide whether to consume the keystroke (preventDefault + stopPropagation).
   */
  dispatch(actionId: string): boolean {
    const action = this.byId.get(actionId);
    if (!action) {
      console.warn("[upmks] dispatch: unknown action", actionId);
      return false;
    }
    if (action.canFire && !action.canFire({ actionId })) {
      return false;
    }
    try {
      action.run({ actionId });
      return true;
    } catch (err) {
      console.error("[upmks] action threw", actionId, err);
      return false;
    }
  }
}

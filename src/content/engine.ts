// Keybinding Engine — see DESIGN.md §3.4.
//
// Wraps hotkeys-js for SINGLE-key bindings (with optional modifiers and
// comma-separated alternatives) and implements its own two-step sequence
// layer on top, because hotkeys-js v3.x does not actually support
// multi-step sequences — its parser strips whitespace from key strings,
// so `"g i"` collapses to a single-key registration on `g` alone, with
// every `g X` binding piling up under the same keycode and firing
// together. Sequences here are detected by the presence of whitespace in
// the binding string, intercepted in the capture phase before hotkeys-js
// sees them, and dispatched after a prefix → second-key match.

import hotkeys from "hotkeys-js";
import type { Scope } from "./scope-detector.js";

const ALL_SCOPES: ReadonlyArray<Scope> = ["global", "list", "reading", "composing"];
const SEQUENCE_TIMEOUT_MS = 1000;

export type Binding = {
  actionId: string;
  scopes: Scope[];
  keys: string;
};

export type EngineDeps = {
  dispatch: (actionId: string) => void;
};

type SequenceStep = {
  actionId: string;
  scopes: Scope[];
  secondKey: string;
  allowsEditable: boolean;
};

function expandScopes(scopes: Scope[]): Scope[] {
  return scopes.includes("global") ? [...ALL_SCOPES] : scopes;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return !(target as HTMLInputElement).readOnly;
  }
  return false;
}

function isSequence(keys: string): boolean {
  // A binding is a sequence only if any single comma-separated variant
  // contains whitespace. "command+a, ctrl+a" is two single-key alternatives,
  // not a sequence — the inner space is just commaformatting.
  return keys.split(",").some((part) => /\s/.test(part.trim()));
}

function parseSequence(keys: string): { prefix: string; second: string } | null {
  // Sequences don't currently support comma-alternatives (we have no need for
  // it). Take the first comma-separated variant and split it on whitespace.
  const first = keys.split(",")[0] ?? "";
  const parts = first.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const [prefix, second] = parts;
  if (!prefix || !second) return null;
  return { prefix, second };
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

// Convert a KeyboardEvent into the same syntax hotkeys-js would parse, so a
// stored binding "shift+8" matches an event with shiftKey + code === "Digit8".
// Letter and digit keys use event.code (location-based) to match hotkeys-js's
// keyCode-based behavior. Everything else falls back to event.key lowercase.
function canonicalKey(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.shiftKey) parts.push("shift");
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.metaKey) parts.push("command");

  // Proton's `useBubbleIframeEvents` re-dispatches synthesized KeyboardEvents
  // into the parent and doesn't set `code` on them, so guard against undefined.
  const code = event.code ?? "";
  let main: string;
  if (code.startsWith("Key")) {
    main = code.slice(3).toLowerCase();
  } else if (code.startsWith("Digit")) {
    main = code.slice(5);
  } else {
    main = (event.key ?? "").toLowerCase();
  }
  parts.push(main);
  return parts.join("+");
}

export class KeybindingEngine {
  private bindings: Binding[] = [];
  private currentScope: Scope = "global";
  private sequences = new Map<string, SequenceStep[]>();
  private waitingPrefix: string | null = null;
  private waitingScope: Scope | null = null;
  private sequenceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sequenceListener: (event: KeyboardEvent) => void;

  constructor(private readonly deps: EngineDeps) {
    // Allow every keystroke through the hotkeys-js filter; per-binding
    // editable-target gating happens inside each handler.
    hotkeys.filter = () => true;
    this.sequenceListener = (e) => this.onKeydownForSequences(e);
    document.addEventListener("keydown", this.sequenceListener, true);
  }

  setBindings(next: Binding[]): void {
    this.unbindAll();
    this.bindings = next;
    this.sequences.clear();

    for (const b of next) {
      if (isSequence(b.keys)) {
        this.registerSequence(b);
      } else {
        this.registerSingle(b);
      }
    }
  }

  setScope(scope: Scope): void {
    this.currentScope = scope;
    hotkeys.setScope(scope);
  }

  destroy(): void {
    this.unbindAll();
    document.removeEventListener("keydown", this.sequenceListener, true);
    this.clearWaiting();
  }

  private registerSingle(b: Binding): void {
    const allowsEditableTarget = b.scopes.includes("composing");
    for (const scope of expandScopes(b.scopes)) {
      // capture: true is what lets us pre-empt Proton's editor handlers
      // (Ctrl+Enter / Ctrl+K inside rooster) and the browser's own
      // Ctrl+A default. Returning false from the handler tells hotkeys-js
      // to call preventDefault + stopPropagation, killing the event for
      // any downstream listeners.
      //
      // We deliberately do NOT skip synthesized (`isTrusted: false`)
      // events: Proton's rooster init calls `iframeDocument.open()`,
      // which wipes any listeners our iframe content script attached.
      // The iframe-side handler effectively doesn't exist for compose
      // shortcuts; what does work is Proton's `useBubbleIframeEvents`
      // re-dispatching iframe keystrokes onto the parent as synthesized
      // events, which we handle here.
      hotkeys(b.keys, { scope, capture: true }, (event) => {
        if (!allowsEditableTarget && isEditableTarget(event.target)) {
          return; // let the keystroke continue to the focused input
        }
        event.preventDefault();
        this.deps.dispatch(b.actionId);
        return false;
      });
    }
  }

  private registerSequence(b: Binding): void {
    const parsed = parseSequence(b.keys);
    if (!parsed) {
      console.warn("[upmks] could not parse sequence binding:", b.keys);
      return;
    }
    const step: SequenceStep = {
      actionId: b.actionId,
      scopes: b.scopes,
      secondKey: parsed.second,
      allowsEditable: b.scopes.includes("composing"),
    };
    const list = this.sequences.get(parsed.prefix) ?? [];
    list.push(step);
    this.sequences.set(parsed.prefix, list);
  }

  private unbindAll(): void {
    for (const b of this.bindings) {
      if (isSequence(b.keys)) continue; // sequences are not in hotkeys-js
      for (const scope of expandScopes(b.scopes)) {
        hotkeys.unbind(b.keys, scope);
      }
    }
    this.bindings = [];
  }

  private scopeMatches(declared: Scope[], current: Scope): boolean {
    return declared.includes(current) || declared.includes("global");
  }

  private clearWaiting(): void {
    this.waitingPrefix = null;
    this.waitingScope = null;
    if (this.sequenceTimer !== null) {
      clearTimeout(this.sequenceTimer);
      this.sequenceTimer = null;
    }
  }

  private onKeydownForSequences(event: KeyboardEvent): void {
    // Modifier-only keydowns (just Shift, Ctrl, etc.) shouldn't reset state.
    if (MODIFIER_KEYS.has(event.key)) return;

    const key = canonicalKey(event);

    if (this.waitingPrefix !== null) {
      const candidates = this.sequences.get(this.waitingPrefix) ?? [];
      const waitingScope = this.waitingScope ?? "global";
      const match = candidates.find(
        (c) => c.secondKey === key && this.scopeMatches(c.scopes, waitingScope),
      );
      this.clearWaiting();
      if (match) {
        if (!match.allowsEditable && isEditableTarget(event.target)) return;
        event.preventDefault();
        // stopImmediatePropagation, not stopPropagation: hotkeys-js attaches
        // its keydown listener to the same document in the same capture
        // phase, and stopPropagation only blocks subsequent targets — not
        // sibling listeners on the same target. Without this, the second
        // key in a sequence (e.g. `a` after `g`) ALSO fires its single-key
        // binding, dispatching both `goto.archive` and `archive`.
        event.stopImmediatePropagation();
        this.deps.dispatch(match.actionId);
      }
      // If no match, fall through — let hotkeys-js process the second key.
      return;
    }

    // Not currently waiting — check if this key is a sequence prefix that
    // fires in the current scope.
    const candidates = this.sequences.get(key) ?? [];
    const eligible = candidates.find((c) =>
      this.scopeMatches(c.scopes, this.currentScope),
    );
    if (!eligible) return;
    if (!eligible.allowsEditable && isEditableTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    this.waitingPrefix = key;
    this.waitingScope = this.currentScope;
    this.sequenceTimer = setTimeout(
      () => this.clearWaiting(),
      SEQUENCE_TIMEOUT_MS,
    );
  }
}

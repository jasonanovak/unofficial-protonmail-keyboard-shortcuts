// Scope Detector — see DESIGN.md §3.3.
//
// Determines which Proton Mail "scope" the user is currently in.
// Scopes are ordered by priority: composing > reading > list > global.

export type Scope = "global" | "list" | "reading" | "composing";

const SCOPE_PRIORITY: Scope[] = ["composing", "reading", "list", "global"];

export type ScopeListener = (scope: Scope) => void;

type DetectorState = {
  current: Scope;
  listeners: Set<ScopeListener>;
  observer: MutationObserver | null;
  cleanups: Array<() => void>;
};

// Source-of-truth selectors (Proton WebClients @ checkout time):
//   composing: applications/mail/src/app/components/composer/ComposerFrame.tsx
//   reading:   applications/mail/src/app/components/message/MessageView.tsx
//   list:      applications/mail/src/app/components/list/MailboxListContainer.tsx
const COMPOSE_SELECTOR = "section.composer";
const READING_SELECTOR = 'article[data-testid^="message-view-"]';
const LIST_SELECTOR =
  'section[aria-label="Message list"], [data-testid^="message-list-"]';

function highestScope(active: Set<Scope>): Scope {
  for (const s of SCOPE_PRIORITY) {
    if (active.has(s)) return s;
  }
  return "global";
}

function rootDoc(): Document {
  // Scope is determined by the parent app's DOM, not whichever iframe we
  // happen to be running in. Both the rooster compose body and Proton's
  // sandboxed message-rendering iframe live in same-origin frames inside
  // mail.proton.me, so this access succeeds; cross-origin would throw and
  // we fall back to the local document.
  if (window === window.top) return document;
  try {
    const parent = window.parent.document;
    if (parent) return parent;
  } catch {
    /* cross-origin */
  }
  return document;
}

function detectActiveScopes(): Set<Scope> {
  // List and reading can both be present (split view); priority resolves
  // which one becomes the engine's active scope. See DESIGN.md §3.3.
  const doc = rootDoc();
  const active = new Set<Scope>(["global"]);
  if (doc.querySelector(COMPOSE_SELECTOR)) active.add("composing");
  if (doc.querySelector(READING_SELECTOR)) active.add("reading");
  if (doc.querySelector(LIST_SELECTOR)) active.add("list");
  return active;
}

function wrapHistory(onChange: () => void): () => void {
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (...args) {
    const ret = origPush.apply(this, args);
    onChange();
    return ret;
  };
  history.replaceState = function (...args) {
    const ret = origReplace.apply(this, args);
    onChange();
    return ret;
  };
  window.addEventListener("popstate", onChange);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener("popstate", onChange);
  };
}

const SINGLETON_KEY = "__upmksScopeDetector__" as const;

type Singleton = {
  state: DetectorState;
};

declare global {
  interface Window {
    [SINGLETON_KEY]?: Singleton;
  }
}

export function startScopeDetector(initialListener?: ScopeListener): {
  current: () => Scope;
  subscribe: (l: ScopeListener) => () => void;
  stop: () => void;
} {
  // Idempotent on re-injection (DESIGN.md §3.2).
  if (window[SINGLETON_KEY]) {
    const existing = window[SINGLETON_KEY].state;
    if (initialListener) {
      existing.listeners.add(initialListener);
      initialListener(existing.current);
    }
    return apiFor(existing);
  }

  const state: DetectorState = {
    current: highestScope(detectActiveScopes()),
    listeners: new Set(),
    observer: null,
    cleanups: [],
  };

  if (initialListener) {
    state.listeners.add(initialListener);
  }

  const recompute = () => {
    const next = highestScope(detectActiveScopes());
    if (next !== state.current) {
      state.current = next;
      for (const l of state.listeners) l(next);
    }
  };

  // History wrapping only matters in the top frame — the parent's history
  // is what changes on SPA navigation, and iframes inherit those changes
  // via the parent-document MutationObserver below.
  if (window === window.top) {
    state.cleanups.push(wrapHistory(recompute));
  }

  // Observe the root document's body, even from inside an iframe. This is
  // what makes a rooster instance pick up "composing" and a sandboxed
  // message-body iframe pick up "reading" instead of being stuck on a
  // single hardcoded scope.
  const observerTarget = rootDoc().body;
  state.observer = new MutationObserver(recompute);
  state.observer.observe(observerTarget, { childList: true, subtree: true });

  window[SINGLETON_KEY] = { state };

  // Emit the initial scope synchronously so subscribers have a value.
  for (const l of state.listeners) l(state.current);

  return apiFor(state);
}

function apiFor(state: DetectorState) {
  return {
    current: () => state.current,
    subscribe: (l: ScopeListener) => {
      state.listeners.add(l);
      l(state.current);
      return () => state.listeners.delete(l);
    },
    stop: () => {
      state.observer?.disconnect();
      state.observer = null;
      for (const c of state.cleanups) c();
      state.cleanups.length = 0;
      state.listeners.clear();
      delete window[SINGLETON_KEY];
    },
  };
}

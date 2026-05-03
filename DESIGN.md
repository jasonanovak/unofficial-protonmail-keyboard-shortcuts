Unofficial Proton Mail Keyboard Shortcuts Extension
Engineering Design Document

# 1. Overview

Implements the requirements in `PRD.md`: a Manifest V3 web extension for Chrome and Firefox that captures user keystrokes on the Proton Mail web client and dispatches them as actions against the page DOM. Shortcuts are user-customizable and persist locally.

This document records the architectural decisions, identifies the load-bearing risks (Proton DOM changes are #1), and specifies enough structure that a contributor can start implementing without re-deriving the design.

## 1.1 Decisions in scope

These were settled before this doc was written; the rest of the doc builds on them.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **DOM-driven dispatch.** The content script finds Proton UI elements and clicks/manipulates them. | Synthetic key events would inherit Proton's focus-dependent behavior — exactly what the PRD wants to fix. |
| 2 | **Native Proton shortcuts assumed disabled.** The user toggles them off in Proton settings; this extension is the sole shortcut handler on the page. | Removes the conflict-resolution problem entirely. The Options page should remind the user to disable them on first run. |
| 3 | **Manifest V3 only, single codebase.** Build per-target artifacts from one source tree. | MV3 is supported on Firefox 109+ and is mandatory on Chrome. MV2 carries no value here. |
| 4 | **Plain TypeScript Options page, no UI framework.** | Settings are a static list with edit-in-place. A framework adds bundle size and build complexity for no leverage. |
| 5 | **`browser.storage.local` only, no sync.** | Avoids the 100KB sync quota and cross-device merge logic. Export/import deferred. |
| 6 | **Defaults match Proton's documented shortcuts.** | Existing Proton users get muscle-memory parity; the extension's value-add is consistency-across-views and customization, not a new shortcut vocabulary. |
| 7 | **Per-folder bindings** (`g i` → inbox, `g a` → archive, etc.). | Matches Proton's existing scheme and gives power users direct navigation. |
| 8 | **E2E tests against a real Proton account in scope.** | The whole project is a wager that we can drive Proton's DOM reliably; tests against the real thing are the only honest verification. |
| 9 | **`browser.*` namespace via `webextension-polyfill`.** All extension API calls go through the polyfill, never `chrome.*` directly. | Firefox supports `browser.*` natively with Promises; the polyfill provides the same surface on Chrome. One code path, no per-browser branches. |

# 2. Architecture

```
┌─────────────────────────── Browser tab on mail.proton.me ─────────────────────────────┐
│                                                                                       │
│   ┌──────────────────────────────  Content Script  ──────────────────────────────┐    │
│   │                                                                              │    │
│   │   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐                 │    │
│   │   │ Scope        │   │ Keybinding   │   │ Action           │                 │    │
│   │   │ Detector     │──▶│ Engine       │──▶│ Registry         │──▶ DOM actions │    │
│   │   │ (URL + obs.) │   │ (hotkeys-js) │   │ (id → handler)   │                 │    │
│   │   └──────────────┘   └──────▲───────┘   └────────▲─────────┘                 │    │
│   │                             │                    │                           │    │
│   │                             │                    ▼                           │    │
│   │                      ┌──────┴──────┐      ┌─────────────┐                    │    │
│   │                      │ Settings    │      │ Selector    │                    │    │
│   │                      │ (storage)   │      │ Module      │                    │    │
│   │                      └──────▲──────┘      └─────────────┘                    │    │
│   └─────────────────────────────┼──────────────────────────────────────────────-─┘    │
│                                 │                                                     │
└─────────────────────────────────┼─────────────────────────────────────────────────────┘
                                  │ browser.storage.local
                                  ▼
                         ┌──────────────────┐
                         │  Options page    │  (tab opened from extension icon)
                         │  plain TS + HTML │
                         └──────────────────┘
```

No background service worker in v1. Content script reads/writes storage directly; the Options page does the same. Storage change events (`browser.storage.onChanged`) are how the content script picks up rebinds without a tab reload.

**Cross-browser API rule.** All extension API calls go through `import browser from "webextension-polyfill"`. `chrome.*` must not appear in source outside the polyfill itself — enforced by an ESLint `no-restricted-globals` rule. The polyfill normalizes Chrome's mixed callback/Promise surface to the Promise-only `browser.*` shape that Firefox ships natively, and ships its own TypeScript types (so `@types/chrome` is not a dependency).

This abstraction does *not* cover the manifest. `background.service_worker` (Chrome) vs `background.scripts` (Firefox event page) and `browser_specific_settings.gecko.id` (Firefox-only) remain manifest-template differences handled by the build script (§5).

# 3. Components

## 3.1 Manifest

Single source manifest template at `src/manifest.template.json`, processed at build time into `dist/chrome/manifest.json` and `dist/firefox/manifest.json`. Differences:

- Firefox requires `browser_specific_settings.gecko.id`.
- Chrome's `background.service_worker` vs. Firefox's `background.scripts` — irrelevant here since v1 has no background script.

Permissions (minimum viable set):
- `storage` — for keybindings.
- `host_permissions: ["https://mail.proton.me/*"]` — content script injection target.

`content_scripts` runs at `document_idle` with `all_frames: false`. The compose iframe (if any) is handled by the parent script via DOM traversal rather than a separate injection — keeps the scope detector authoritative.

## 3.2 Content script entry

Lifecycle:
1. Load settings from `browser.storage.local` (with defaults baked in if first run).
2. Subscribe to `browser.storage.onChanged` to reload bindings live.
3. Initialize the Scope Detector.
4. Initialize the Keybinding Engine with the current scope.
5. Wire up window/route observers to push scope changes into the engine.

Idempotent on re-injection (extension reload during dev).

## 3.3 Scope Detector

Determines which of `{list, reading, composing, global}` is active. Proton Mail is a SPA, so:

- **Route signal**: URL pathname (`/inbox`, `/inbox/<id>`, etc.) — wrap `history.pushState`/`replaceState` plus listen to `popstate`. SPAs don't emit a stock event for programmatic navigation; the wrap is the canonical workaround.
- **DOM signal**: a `MutationObserver` on `document.body` for the compose modal's mount/unmount and for the message-view pane.

The detector emits a `scope` value. Multiple scopes can be "additive" — `composing` always wins for compose-only shortcuts even when the underlying view is `list`. Implementation: scope is an ordered set; the engine's lookup checks scopes in priority order (`composing` > `reading` > `list` > `global`).

## 3.4 Keybinding Engine

Wraps `hotkeys-js`. Responsibilities:

- Register all currently-active bindings on scope entry; unregister on scope exit.
- Support all three shortcut forms from the PRD:
  - Single key (`c`).
  - Modifier combo (`shift+r`).
  - Sequence (`g i`) — `hotkeys-js` natively supports multi-step combos in its v3 API; we use that rather than rolling our own buffer.
- **contenteditable filter override**: `hotkeys-js` skips events from inputs/textareas/contenteditables by default. The compose scope must opt back in (so `Ctrl+Enter` to send works while typing). Done via `hotkeys.filter` per-scope.

The engine never reads selectors or touches the DOM directly — it only resolves keystroke → action ID and calls `actionRegistry.dispatch(id)`.

## 3.5 Action Registry

A flat map of action ID → handler. Each entry declares:

```ts
type Action = {
  id: string;                       // e.g. "reply", "goto.inbox"
  scopes: Scope[];                  // where it's valid
  defaultBinding: string;           // hotkeys-js syntax
  run: (ctx: Context) => void;      // performs the DOM action
  label: string;                    // for the Options page
};
```

This is the only file new shortcuts get added to. The registry is the contract between the engine and the DOM layer — engine asks "does action X exist for scope Y?", registry answers and runs it.

## 3.6 Selector Module

All knowledge of Proton's DOM lives here, in one file. Each lookup is a named export with a fallback chain:

```ts
export const replyButton = () =>
  query('[data-testid="message-view:reply"]')
  ?? query('button[aria-label*="Reply" i]:not([aria-label*="all" i])');
```

This is the file most likely to break when Proton ships UI changes. Keeping it isolated means a Proton-side change is a one-file PR. Every selector chain ends with an aria-label or role-based fallback, since `data-testid` is the most volatile.

A startup **selector probe** runs the most critical selectors once after each navigation and logs (to `console.warn` and a small banner in the Options page) any that returned null. This is how the extension fails loudly instead of silently swallowing broken bindings.

## 3.7 Settings storage

Schema:

```ts
type Settings = {
  version: 1;
  bindings: Record<string /* action id */, string /* hotkeys syntax */>;
};
```

A migration hook (`migrate(stored)`) runs on read; v1 just returns as-is. Defaults are merged at read time so newly added actions get their default binding without a forced reset.

## 3.8 Options page

Single HTML file + TypeScript. Layout:

- Top banner: "Disable Proton's built-in shortcuts in Settings → General → Shortcuts" with a link.
- Sections per scope (Global, Message list, Reading, Composing).
- Each row: action label, current binding (chip), "Edit" button.
- Edit captures the next keystroke(s) using `hotkeys-js` in record mode, validates uniqueness within scope, saves to storage.
- "Restore defaults" button at the bottom.
- Selector-probe diagnostics shown if any selectors are currently failing on the user's mail tab (queried via `browser.tabs.sendMessage` to the content script).

No router, no framework. A few hundred lines of TS.

# 4. Default bindings

Sourced from https://proton.me/support/keyboard-shortcuts — the implementation will enumerate from that page rather than copying a possibly-stale list into this doc. The PRD's CUJs map onto Proton's existing shortcuts cleanly: compose (`c`), reply (`r`), reply-all (`shift+r`), forward (`shift+f`), archive (`e`), trash (`#`), star (`s`), mark unread (`u`), prev/next (`k`/`j`), go-to-folder sequences (`g` then `i`/`d`/`s`/`a`/`t`/`.`).

If Proton's docs and live behavior disagree, **live behavior wins** and the discrepancy gets logged in the implementation PR. Capture date alongside the binding list so future-you can tell when defaults were last reconciled.

The canonical defaults live in `src/content/actions.ts` with a header comment recording the reconciliation date and the WebClients source paths consulted. The example bindings in this doc are illustrative; reconcile against the file when in doubt.

# 5. Cross-browser build

Recommended: **TypeScript + esbuild + a ~50-line build script.** Build script does:

1. Compile + bundle content script and options script with esbuild. The `webextension-polyfill` import is bundled into both — the polyfill is small (~5 KB) and there's no benefit to externalizing it.
2. Read `manifest.template.json`, emit Chrome and Firefox variants. This is where `background.service_worker` vs `background.scripts` and the Firefox-only `browser_specific_settings.gecko.id` get applied — the polyfill does not address manifest differences.
3. Copy static assets (icons, options HTML).
4. Optionally run `web-ext lint` on the Firefox build.

Lint rule: a `no-restricted-globals` ESLint entry for `chrome` keeps `browser.*` as the only API surface in source. The build will fail CI if `chrome.*` is referenced outside an explicit allowlist (the polyfill itself, if vendored).

Why not Vite/WXT/Plasmo: those are reasonable, but for a project this size the meta-framework's lifecycle abstractions cost more reading than they save in writing. Esbuild + a script is ~100 lines, transparent, and easy to debug. **This decision is cheap to revisit** if the build script grows past ~200 lines or hot-reload becomes painful.

Loading during dev:
- Chrome: `chrome://extensions` → Load unpacked → `dist/chrome`.
- Firefox: `about:debugging` → Load Temporary Add-on → `dist/firefox/manifest.json`.

# 6. Testing strategy

Three layers, in order of reliability per dollar of effort:

## 6.1 Unit (Vitest, happy-dom)

- Keybinding engine: scope transitions, sequence detection, conflict detection, contenteditable filter rules.
- Settings storage: schema migration, default merging, change-event propagation.
- Action registry: lookup-by-scope, missing-action handling.
- Selector module: tested against committed HTML fixtures (sanitized snapshots from a real session).

These run on every commit. Fast, deterministic, no Proton account needed.

## 6.2 Selector smoke (Playwright, headless, real account)

- Loads each scope (list / reading / composing).
- For each critical selector, asserts it resolves to a visible element.
- Runs nightly in CI. **This is the canary for Proton DOM changes** — when this fails, the selector module needs an update.

## 6.3 End-to-end (Playwright, real account)

> Interactive MCP-driven verification (Firefox via `firefox-devtools-mcp` and Chrome via `chrome-devtools-mcp`) is what we use today and is documented in `TEST_PLAN.md`. The Phase 6 work below is the *durable, unattended* version of that — converted to Playwright so it runs in CI without a session.


- Loads the extension, signs in, performs each action via shortcut, asserts the expected DOM transition.
- Tagged `@smoke` (subset, ~10 actions, runs on every PR) and `@full` (every action, runs nightly).
- Account credentials via env vars; never committed.
- Account is dedicated to testing — not a real user's mailbox.
- Test setup creates fresh fixture messages each run (via Proton's web UI, not API) so tests aren't dependent on prior state.
- Sign-in flow: assume the test account has 2FA off; CAPTCHA is the residual flake risk and is documented as such rather than engineered around.

# 7. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Proton ships a UI change that breaks selectors | High | High | Selector module isolation; nightly smoke; on-page warning when probe fails. |
| Proton CSP blocks injected behavior | Low | High | Content scripts run in an isolated world and don't need eval; verify early in implementation. |
| `hotkeys-js` doesn't fit one of the shortcut forms | Low | Medium | Spike the three forms in Phase 2 before committing the engine surface. |
| User forgets to disable native Proton shortcuts | High | Low | First-run banner on Options page; selector probe can also detect double-fire by watching for unexpected DOM transitions. |
| 2FA / CAPTCHA flakes E2E sign-in | Medium | Medium | Persist a logged-in storage state between Playwright runs; document manual refresh procedure. |

# 8. Out of scope for v1

- Settings sync across devices.
- Import/export of bindings.
- Conflict resolution between user binding and Proton native (we assume natives are off).
- Localized UI strings.
- Telemetry.
- The "insert link" compose action — Proton's compose may or may not expose this via a stable DOM target. Phase 3 will spike it; if the DOM is hostile, this single action gets deferred to v1.1 rather than blocking the release.

# 9. Phased delivery

1. **Phase 1 — Scaffold.** Repo layout, build script, manifest, empty content script that logs scope changes, Options page that lists defaults read-only. *Exit criteria: extension loads in both browsers and prints scope on navigation.*
2. **Phase 2 — Engine spike.** Three actions end-to-end: `compose`, `reply`, `archive`. Proves DOM-driven dispatch works and HotKeys.js handles all three shortcut forms. *Exit criteria: those three shortcuts work on a real Proton account.*
3. **Phase 3 — Full action set.** Every action from the PRD's CUJs; per-folder navigation. Selector probe in place. *Exit criteria: all PRD CUJs satisfied with default bindings.*
4. **Phase 4 — Customization.** Edit-in-place rebinding in the Options page; storage change propagation. *Exit criteria: user can rebind any action and have it take effect without reloading.*
5. **Phase 5 — Ship.** Cross-browser parity verification (interactive MCP-driven matrix run on both Firefox and Chrome — see `TEST_PLAN.md`), store listing artifacts (icons, screenshots, copy). *Exit criteria: both browsers verified end-to-end against a real account, listing copy reviewed for the "no implication of officialness" branding rule, store listings ready to submit.*
6. **Phase 6 — Test + CI.** Vitest unit suite, selector smoke against committed HTML fixtures, Playwright extension loading + persisted auth, `@smoke`/`@full` E2E suites, CI pipelines. *Exit criteria: nightly green; per-PR runs lint + unit + smoke E2E; selector-smoke failures auto-open issues.* Doesn't gate Phase 5 — matrix-driven verification in `TEST_MATRIX.md` / `TEST_PLAN.md` is enough for v1; this phase locks it in for the long term.

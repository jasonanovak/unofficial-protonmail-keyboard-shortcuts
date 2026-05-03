# Implementation TODO

Derived from `DESIGN.md` §9 (Phased delivery). Each phase ends with a verification task that maps to that phase's exit criteria.

## Phase 1 — Scaffold

Exit criteria: extension loads in both browsers and prints scope on navigation.

- [x] **Initialize repo config.** package.json with scripts, tsconfig.json (strict TS, ES2022), .gitignore (dist/, node_modules/, .env), ESLint config including `no-restricted-globals` forbidding `chrome` outside an allowlist (per §3.2 cross-browser API rule).
- [x] **Install dependencies.** Runtime: `hotkeys-js`, `webextension-polyfill`. Dev: `typescript`, `esbuild`, `eslint`, `vitest`, `happy-dom`, `@playwright/test`, `web-ext` (for Firefox lint).
- [x] **Write manifest.template.json.** At `src/manifest.template.json`. Permissions: `storage`. `host_permissions: ["https://mail.proton.me/*"]`. `content_scripts` at `document_idle`, `all_frames: false`. `options_ui` pointing at the options page. Placeholders for the per-target differences (`gecko.id`, background field) per §3.1.
- [x] **Implement build script (esbuild + per-target manifest emit).** Bundle content + options scripts (webextension-polyfill bundled in). Emit `dist/chrome/manifest.json` and `dist/firefox/manifest.json` with the gecko.id and background-field differences applied. Copy static assets (icons, options.html). Optionally run `web-ext lint` against the Firefox build.
- [x] **Implement Scope Detector.** Per §3.3. Wrap `history.pushState`/`replaceState` and listen to `popstate` for SPA route changes. `MutationObserver` on `document.body` for compose modal and message-view pane mount/unmount. Emit current scope as ordered set with priority `composing` > `reading` > `list` > `global`. Idempotent on re-injection.
- [x] **Implement content script entry shell.** Per §3.2. Load settings from `browser.storage.local` with baked-in defaults on first run, subscribe to `browser.storage.onChanged` for live reload, init Scope Detector, log scope changes. Re-injection-safe.
- [x] **Create Options page shell.** Single `options.html` plus minimal `options.ts` reading defaults and listing them per scope. No edit functionality yet — that lands in Phase 4. Plain TS, no framework.
- [x] **Verify extension loads and logs scope in Chrome + Firefox.** Manual. Load `dist/chrome` via `chrome://extensions`, `dist/firefox` via `about:debugging`. Sign into Proton, navigate inbox/message/compose, confirm console reflects scope transitions in both browsers.

## Phase 2 — Engine spike

Exit criteria: `compose`, `reply`, and `archive` shortcuts work on a real Proton account.

- [x] **Implement Keybinding Engine.** Per §3.4. Wraps hotkeys-js: register on scope entry, unregister on exit. Single / combo / sequence forms. Per-scope contenteditable filter override (compose scope opts back in for `Ctrl+Enter` while typing). Engine resolves keystroke → action ID and calls `actionRegistry.dispatch` — never touches the DOM directly.
- [x] **Define Action type and Action Registry skeleton.** Per §3.5. `Action = { id, scopes, defaultBinding, run, label }`. Registry exposes lookup-by-scope and dispatch. The contract between engine and selector layer; new shortcuts are added here.
- [x] **Implement Selector Module with compose/reply/archive selectors.** Per §3.6. One file, named exports per selector with fallback chains ending in aria-label/role lookups. Pattern set here is what later selectors follow.
- [x] **Wire compose / reply / archive actions end-to-end.** Three actions registered, bound to Proton defaults (`c`, `r`, `e`), dispatched through the engine to DOM clicks via the Selector Module.
- [x] **Verify three shortcuts work on real Proton account.** Both browsers. Native Proton shortcuts disabled in Proton settings during this check.

## Phase 3 — Full action set

Exit criteria: all PRD CUJs satisfied with default bindings.

- [x] **Enumerate Proton default bindings; reconcile docs vs live.** Per §4. Walk live UI with shortcuts on; cross-check against https://proton.me/support/keyboard-shortcuts. Live behavior wins; record discrepancies and reconciliation date alongside the binding list.
- [x] **Implement message-list actions.** Mark read/unread, delete, star, selection navigation. Scoped to `list`.
- [x] **Implement reading-view actions.** Reply-all, forward, mark unread, delete, prev/next. Prev/next stays put when no neighbor exists.
- [x] **Implement compose actions (close, send) and spike insert-link.** Close + send wired against compose-scope selectors. Insert-link is a spike: ship if Proton's compose exposes a stable DOM target; defer to v1.1 per §8 if hostile.
- [x] **Implement per-folder go-to bindings.** `g i` / `g d` / `g s` / `g a` / `g t` / `g .` for inbox, drafts, sent, archive, trash, starred. Global scope.
- [x] **Implement Selector Probe.** Per §3.6. After each navigation, run critical selectors; `console.warn` any that return null. Expose results via `browser.tabs.sendMessage` so the Options page can render a diagnostics banner.
- [x] **Implement Settings storage adapter.** Per §3.7. Schema `{ version: 1, bindings: Record<actionId, hotkeysSyntax> }`. `migrate()` runs on read (v1: no-op). Defaults merged at read time so newly added actions get their default without forcing a reset. Idempotent writes safe across multiple tabs.

## Phase 3.5 — Keyboard-driven message selection

Closes the "click first, then shortcut works" gap surfaced in the Phase 3 test matrix. Proton's toolbar Mark-as-read/unread/move-to-X buttons only render when messages are selected; without keyboard nav + selection, list-scope shortcuts are workflow-blocked behind a mouse click. Exit criteria: every list-scope row in `TEST_MATRIX.md` is fully Pass without the mouse.

- [ ] **Find per-row message-list selectors.** Locate the data-testid (or stable selector) for individual list rows AND for the row-level select checkbox. WebClients source paths will narrow it. Output goes into `selectors.ts`.
- [ ] **Implement focused-row tracking in list scope.** Track which row is currently "focused" without depending on Proton's internal state. Auto-focus the first row when scope enters `list` so the workflow doesn't require a click. State lives in the content script (parent frame only).
- [ ] **Add list-nav actions — focusNext / focusPrev.** Bound to `down` / `up`. Move browser focus to the next/previous row using the tracker, `scrollIntoView` on transition. No message opens.
- [ ] **Add list selection actions — toggleSelect, openFocused.** `x` (or `space`) toggles the focused row's checkbox; `enter` opens the focused row in reading view. Once these work, the existing list-scope toolbar shortcuts are reachable purely from the keyboard.
- [ ] **Re-verify list scope test matrix.** Walk every list-scope row in `TEST_MATRIX.md` without using the mouse — all should now Pass.

## Phase 4 — Customization

Exit criteria: user can rebind any action and have it take effect without reloading.

- [ ] **Build Options page UI.** Per §3.8. Sections per scope (Global / Message list / Reading / Composing). Each row: action label, current-binding chip, Edit button. Top banner reminds user to disable Proton native shortcuts.
- [ ] **Implement record-mode keystroke capture.** Use hotkeys-js record mode (or equivalent) to capture the next keystroke / sequence after Edit is clicked. Display captured keys live; allow cancel.
- [ ] **Validate uniqueness within scope on rebind.** Inline error if the key is already taken in the same scope; refuse the save. Keys may be reused across non-overlapping scopes.
- [ ] **Wire "Restore defaults" button.** Single button at bottom. Confirms before clearing user overrides. Writes default bindings back to storage; `storage.onChanged` triggers content-script rebind.
- [ ] **Verify live rebind without tab reload.** Change a binding in Options, switch to Proton tab, confirm new binding fires immediately and old one no longer does. Verifies `storage.onChanged` → engine re-registration path.

## Phase 5 — Test + ship

Exit criteria: nightly green, both browsers verified, listing copy reviewed for the branding rule.

- [ ] **Set up Vitest + unit tests (engine, registry, storage).** Per §6.1. Configure with happy-dom. Cover engine (scope transitions, sequences, conflict detection, contenteditable filter), registry (lookup-by-scope, missing-action), storage (migration, default merge, change events).
- [ ] **Commit sanitized HTML fixtures + selector unit tests.** Per §6.1. Capture HTML snapshots of list / reading / compose from a real session; sanitize PII; commit under `tests/fixtures/`. Selector unit tests assert each named selector resolves against its fixture.
- [ ] **Set up Playwright with extension loading + persisted auth.** Per §6.3. Launch Chromium and Firefox with the built extension. Persist logged-in storage state between runs to dodge CAPTCHA. Credentials via `PROTON_USER` / `PROTON_PASS` env vars, never committed. Document the manual-refresh procedure when state expires.
- [ ] **Implement @smoke (~10 actions) and @full E2E suites.** Per §6.3. `@smoke` runs on every PR; `@full` covers every action and runs nightly. Each test fires a shortcut and asserts the resulting DOM transition. Setup creates fresh fixture messages via Proton's web UI.
- [ ] **Wire CI pipelines.** Per §6.2/§6.3. PR pipeline: lint + unit + `@smoke` E2E in Chromium. Nightly: selector smoke (canary for Proton DOM changes) + `@full` E2E in both Chromium and Firefox. Selector-smoke failures auto-open an issue.
- [ ] **Verify Firefox parity end-to-end.** Run the full action list manually against the Firefox build on a real account. Catches any `browser.*` polyfill edge cases or manifest-template gaps that unit/E2E missed.
- [ ] **Prepare store listing (icons, screenshots, copy review).** Generate icon set at sizes required by Chrome Web Store and AMO. Capture Options-page and shortcut-in-action screenshots. Write the listing description; review for the PRD branding rule that no copy implies the extension is official.

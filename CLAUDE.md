# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A cross-browser (Firefox + Chrome) Manifest V3 web extension named **"Unofficial Proton Mail Keyboard Shortcuts Extension"** that layers customizable keyboard shortcuts onto the Proton Mail web client. Proton Mail's built-in shortcuts behave differently depending on focus and aren't user-customizable; this extension fixes both. See `PRD.md` for authoritative goals and CUJs and `DESIGN.md` for the architecture.

Branding constraint from the PRD: never imply the extension is official. The word "Unofficial" is part of the name. The manifest name is shortened to "Unofficial Proton Mail Keyboard Shortcuts" to fit AMO's 45-char cap; the full name including "Extension" is for store listings.

## Common commands

- `npm run build` — emits `dist/chrome/` and `dist/firefox/` from the same source.
- `npm run build:chrome` / `npm run build:firefox` — single-target builds.
- `npm run watch` — esbuild watch mode for both targets.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint over `src/` and `scripts/`. The config bans `chrome.*` outside the polyfill (use `browser.*` from `webextension-polyfill`).
- `npm run lint:firefox` — `web-ext lint dist/firefox`. Useful before submitting to AMO.
- `npm run test` / `npm run test:watch` — Vitest. (Phase 5; not yet wired to anything in v1.)

Loading during dev:
- Chrome: `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome/`.
- Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox/manifest.json`.

## Sibling reference checkouts

These are **read-only references** living next to this repo, not dependencies to modify:

- `../WebClients/applications/mail` — the Proton Mail web client source. Read this to understand the DOM, view states, and how Proton's native shortcuts are implemented. When changing selectors, look here for the canonical `data-testid`s — Proton's webpack does not strip them in production.
- `../hotkeys-js` — the input-capture library. Bundled via npm; the source is here for reference.

When investigating "how does Proton Mail do X today," start by grepping `../WebClients/applications/mail`.

## Shortcut semantics (from PRD)

A "keyboard shortcut" in this project is any of three forms, handled uniformly by the input layer:
1. Single key (e.g. `a`)
2. Modifier combo pressed simultaneously (e.g. `Shift+R`)
3. Short key sequence (e.g. `g` then `i`)

Shortcuts must work consistently across message-list, reading, and composing views. Solving focus-dependent inconsistency is a core motivation — any design that re-introduces "only works when X is focused" defeats the purpose.

## Architecture (one-line orientation)

`src/content/` is the content script. Scope Detector → Keybinding Engine (hotkeys-js + custom sequence layer) → Action Registry → Selector Module → DOM. Cross-browser via `webextension-polyfill` (`browser.*` only, never `chrome.*`). Build is a small esbuild script that emits per-target manifests. Read `DESIGN.md` §2 for the full picture.

---

# Implementation notes

Things learned by writing and debugging this extension that aren't obvious from the source or other docs. Read this section before debugging shortcuts that "should work but don't" — most of these will save a wrong-direction debugging session.

## hotkeys-js gotchas

The library's surface is misleading. These bit us hard.

### Sequences are not supported in v3
`hotkeys-js` v3.13.x does **not** support multi-step sequences. Its `getKeys` parser strips all whitespace from the key string, so `"g i"` collapses to `"gi"`, `code()` gives the keycode for `g`, and every `g X` binding piles up under that single keycode and fires together when you press `g`. We discovered this when `g i` triggered all eight `goto.*` actions plus the single-key `i` binding.

We rolled our own two-step sequence layer in `src/content/engine.ts` (`onKeydownForSequences`). Sequences (anything with whitespace) are intercepted in capture phase before hotkeys-js sees them; single-key bindings still go through hotkeys-js. The hand-rolled layer has a 1-second timeout and tracks the prefix → second-key match.

### `*` is the wildcard, not asterisk
`hotkeys('*', handler)` listens for **every** key, not the asterisk character. To bind the literal `*` on US layouts use `shift+8`. We bind star to `shift+8` and `goto.starred` to `g shift+8`.

### Capture flag is sticky on the first call
hotkeys-js attaches the document-level keydown listener exactly once, on the first `hotkeys(...)` call, and uses that call's `capture` value for the listener's lifetime. Subsequent `hotkeys(...)` calls do not re-attach. Mixing `capture: true` and `capture: false` bindings would silently fail; we pass `capture: true` on every single-key binding.

### Capture phase is required, not optional
Bubble-phase listeners are too late for several keys we care about:
- `Ctrl+A` — the browser's "select all" runs after bubble.
- `Ctrl+Enter` — Proton's rooster editor has its own handler.
- `Ctrl+K` — rooster handles link insertion.

`capture: true` runs us before any element-level handlers and before the browser default. Combined with `event.preventDefault()` + `return false` (which makes hotkeys-js call `stopPropagation`), we get the keystroke and nobody else does.

## Rooster compose iframe

The single most surprising thing in this codebase.

### The iframe is `about:blank` and we DO inject into it
Rooster mounts a `<iframe ref={iframeRef} />` in `WebClients/packages/components/components/editor/rooster/RoosterEditor.tsx` with no `src` or `srcdoc`. So the iframe URL is `about:blank`, which `match_about_blank: true` in the manifest covers. Our content script injects.

### …but Proton wipes us moments later
`useInitRooster.ts` calls `iframeDocument.open()` then `iframeDocument.write(...)` to populate the editor. `document.open()` creates a brand-new document object inside the iframe and replaces the previous one — destroying every event listener we attached, plus the singleton flag we use to dedupe re-injection. After init, the iframe-side path is effectively dead. Our content script ran, but its effects are gone.

### Compose-scope shortcuts work via Proton's bubble shim
Proton has `useBubbleIframeEvents` (in `WebClients/.../rooster`) that catches keystrokes inside the iframe and re-dispatches synthesized `KeyboardEvent`s onto the parent. The **parent's** hotkeys-js handler picks up these synthesized events and fires `compose.send` / `compose.insertLink` / etc. That's why compose shortcuts work even though the iframe-side handler doesn't.

### `event.isTrusted` is a TRAP — do not filter on it
The synthesized events from `useBubbleIframeEvents` have `isTrusted: false`. The natural-looking optimization "skip non-trusted events to avoid double-fire" looks correct on paper but **silently kills every compose-scope shortcut**, because the iframe-side path that the supposed double-fire would come from doesn't exist (Proton wiped it). I added this filter and it broke compose for an entire test cycle. Don't add it back.

### Synthesized events miss `event.code`
Proton's `useBubbleIframeEvents` constructs the new `KeyboardEvent` without setting `code`. `canonicalKey` in `engine.ts` guards `event.code ?? ""` for this reason. Anything that reads `event.code` must do the same — `.startsWith` on undefined throws.

## Scope detection across frames

Each frame runs the content script (`all_frames: true`), but the iframe's local document doesn't have the markers we look for (`section.composer`, `article[data-testid^="message-view-"]`, `section[aria-label="Message list"]`). Those live in the parent. The scope detector queries `window.parent.document` (same-origin in this app) instead of its own `document`.

A previous version hardcoded `"composing"` for any iframe context — that broke reading-scope shortcuts when focus was inside Proton's sandboxed message-rendering iframe (which is a different iframe than rooster, also same-origin). The "use parent" approach handles both: rooster inherits "composing" because parent has the composer open; the message-body iframe inherits "reading" because parent has the message-view article.

## Proton DOM quirks

### `data-testid`s survive production builds
Proton's webpack config doesn't strip `data-testid` attributes, so they're a reliable primary selector. Back them up with an `aria-label` regex fallback — aria copy is more stable than testid naming. The selector module (`src/content/selectors.ts`) follows this pattern.

### Sidebar `humanID`s vary by user setting
The `LABEL_IDS_TO_HUMAN` map in `WebClients/packages/shared/lib/mail/constants.ts` includes both `drafts` / `all-drafts`, `sent` / `all-sent`, and `all-mail` / `almost-all-mail`. Which one shows in the sidebar depends on the user's `ShowMoved` mail setting and how Proton has decided to render the "all mail" entry. The `sidebarLink` helper in `selectors.ts` accepts multiple humanIDs and tries each.

### URLs have a `/u/<n>/` prefix
Don't write URL pattern matches that assume `/inbox` is at the root — Proton uses `/u/0/inbox` etc. for multi-account routing. An early scope-detector regex assumed bare paths and missed the prefix.

### Toolbar action buttons require selection
The `toolbar:read`, `toolbar:unread`, `toolbar:movetotrash`, etc. buttons are not in the DOM until at least one message is selected. Pressing the corresponding shortcut dispatches correctly but the selector returns `null` and we warn. This is workflow-dependent, not a code bug. Phase 3.5 closes the gap with keyboard-driven row focus + selection.

### Star icons are per-row
`item-star-true` / `item-star-false` testids are per-row in the message list. With nothing focused, `querySelector` returns the first match — which is the first row's star, not "the message I meant." Like the toolbar buttons, this becomes correct once Phase 3.5's focused-row tracker lands.

## Development workflow

### Reload the extension AND the Proton tab
The single most-common cause of "my fix didn't work." Reloading the extension via `chrome://extensions` or `about:debugging` does not replace already-running content scripts in open tabs. Until the Proton tab is reloaded, the previous content script code is still in effect. After every code change, reload the extension and reload the tab.

### Verification is human-in-the-loop
There is no E2E framework wired up yet (Playwright is a Phase 5 task). The only way to verify a shortcut works is to load the build into Chrome/Firefox, sign into a real Proton account, and walk `TEST_MATRIX.md`. Sessions can't drive a real Proton session, so handoffs to the user happen frequently. Don't claim a fix works until the matrix shows Pass.

### Iframe content script logs `[upmks] [frame] ...`
The boot log distinguishes top-frame from iframe instances. If you don't see the `[frame]` line when the user opens compose, the iframe content script isn't loading and the cross-frame scope detection / cross-frame selectors won't work.

### Native Proton shortcuts must be off in Settings
Decision #2 in `DESIGN.md` is "assume natives are disabled." Tests that don't disable Proton's native shortcuts will see double-fire (Proton + us). Always start a test session by toggling them off in Proton Mail Settings → General → Keyboard shortcuts.

## Engine semantics worth knowing

### `expandScopes` and what "global" means
A binding declared with `scopes: ["global"]` gets registered in **every** scope (`global`, `list`, `reading`, `composing`). That's what makes `n` (compose) fire anywhere. A binding declared with `scopes: ["list"]` only fires when current scope is `list`. There's no implicit "fire everywhere" — you have to include `"global"`.

### Editable target gating is per-binding, not global
The engine's `hotkeys.filter` is set to always return true. Each registered binding decides for itself whether to fire when the keystroke target is an input/contenteditable: bindings whose declared scopes include `"composing"` fire from editables (so `Ctrl+Enter` works while typing the body); all others don't (so `n` doesn't fire while typing a subject). This is the right cut — a global "if scope is composing, allow" is too coarse and lets `n` fire from To/Subject inputs.

### Comma-separated bindings are alternatives, not sequences
`"command+a, ctrl+a"` is **two single-key bindings** that hotkeys-js fires for either combo. The space after the comma is formatting. A naive `isSequence` that does `/\s/.test(keys)` will mis-detect this as a two-step sequence (prefix `"command+a,"`, second `"ctrl+a"`) and the binding will silently never fire — no console log, no error, just nothing. Sequence detection must be per-variant: `keys.split(",").some(part => /\s/.test(part.trim()))`. We hit this with `Ctrl+A`, `Ctrl+Enter`, and `Ctrl+K` and spent a long time in the wrong neighborhood debugging it.

### Sequence prefix is consumed even on no match
When the user presses `g` (a registered sequence prefix), our SequenceDispatcher always `preventDefault`s + `stopPropagation`s and enters waiting state. If the second key doesn't match a known sequence, we drop out of waiting state and let the second key flow through normally. The `g` itself is not delivered to anyone. This means typing the literal letter `g` in a non-editable focus context is "lost" — not a real concern in practice because non-editable focus targets don't accept text input anyway.

## Manifest / permissions tricks

### `browser.tabs.query({ url })` works without `"tabs"` permission
We have `host_permissions: ["https://mail.proton.me/*"]`. That alone is enough to query and message tabs matching that URL. The broader `"tabs"` permission would unlock cross-origin tab metadata we don't need; skipping it is a real privacy win.

### `match_about_blank: true` is needed AND sufficient for rooster
Don't bother with `match_origin_as_fallback` — rooster uses plain `about:blank`, not `about:srcdoc`. (Verified by reading `RoosterEditor.tsx`.) `match_about_blank: true` covers it.

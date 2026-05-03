# Unofficial Proton Mail Keyboard Shortcuts Extension

> **Unofficial.** Not affiliated with, endorsed by, or supported by Proton AG.

A cross-browser (Chrome + Firefox) extension that layers user-customizable keyboard shortcuts onto the [Proton Mail](https://proton.me/mail) web client.

## Why

Proton Mail has built-in keyboard shortcuts, but they have two problems this extension addresses:

1. **They behave differently depending on which part of the page has focus.** Pressing `r` does one thing in the list, another in a message, and nothing at all if the wrong element is focused.
2. **They aren't user-customizable.**

This extension fixes both. Shortcuts are dispatched consistently across views (message list / reading / composing) and you can rebind any of them via the Options page.

## Status

Pre-release. The shortcut engine, default bindings, and Phase 1–3 verification are done. The rebinding UI (Phase 4), keyboard-driven message selection (Phase 3.5), and the test/CI/store-listing milestones (Phase 5) are open. See [TODO.md](TODO.md) for the full task list.

Not on the Chrome Web Store or AMO yet — install from source as below.

## Install (development build)

```
git clone git@github.com:jasonanovak/unofficial-protonmail-keyboard-shortcuts.git
cd unofficial-protonmail-keyboard-shortcuts
npm install
npm run build
```

This emits `dist/chrome/` and `dist/firefox/`.

Load unpacked:

- **Chrome** — `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/chrome/`.
- **Firefox** — `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → select `dist/firefox/manifest.json`.

Then open <https://mail.proton.me>, sign in, and **turn off Proton's built-in shortcuts** in *Settings → General → Keyboard shortcuts*. The extension assumes the natives are off; if they're on, both will fire and most shortcuts will misbehave.

## Default shortcuts

These match Proton's documented defaults (reconciled against the live WebClients source). All are customizable via the Options page once Phase 4 ships; for now the defaults are what you get.

**Global** (work anywhere in mail.proton.me)

| Key | Action |
|-----|--------|
| `n` | Compose new message |
| `g i` | Go to Inbox |
| `g d` | Go to Drafts |
| `g e` | Go to Sent |
| `g a` | Go to Archive |
| `g s` | Go to Spam |
| `g t` | Go to Trash |
| `g *` | Go to Starred (Shift+8) |
| `g m` | Go to All Mail |

**Message list**

| Key | Action |
|-----|--------|
| `r` / `u` | Mark as read / unread |
| `t` / `s` / `a` / `i` | Move to Trash / Spam / Archive / Inbox |
| `*` | Toggle star |
| `Ctrl+A` (`Cmd+A` on Mac) | Select all in list |

**Reading a message**

| Key | Action |
|-----|--------|
| `r` / `Shift+R` | Reply / Reply all |
| `Shift+F` | Forward |
| `u` | Mark as unread |
| `t` / `s` / `a` / `i` | Move to Trash / Spam / Archive / Inbox |
| `*` | Toggle star |
| `j` / `k` | Next / previous message |

**Composing**

| Key | Action |
|-----|--------|
| `Esc` | Close composer |
| `Ctrl+Enter` (`Cmd+Enter`) | Send |
| `Ctrl+K` (`Cmd+K`) | Insert link |

> Sequence shortcuts (`g i`, `g a`, etc.) are *two key presses* — press `g`, then the second key within ~1 second.

## Privacy

The extension:

- Runs only on `https://mail.proton.me/*`.
- Stores your shortcut preferences locally in `browser.storage.local`.
- Does **not** transmit any data anywhere — no telemetry, no remote calls.
- Does **not** request the broad `tabs` permission. The only listed permissions are `storage` and `host_permissions` for mail.proton.me.

## Development

```
npm run build           # both targets
npm run build:chrome    # single target
npm run build:firefox
npm run watch           # esbuild watch
npm run typecheck       # tsc --noEmit
npm run lint            # ESLint over src/ and scripts/
npm run lint:firefox    # web-ext lint dist/firefox
```

The codebase is intentionally small and unframeworked: TypeScript + esbuild + a ~50-line build script. Cross-browser API access goes through `webextension-polyfill` (`browser.*` only — `chrome.*` is banned by an ESLint rule).

## Documentation

- **[PRD.md](PRD.md)** — product goals, CUJs, branding constraints.
- **[DESIGN.md](DESIGN.md)** — architecture and the eight numbered design decisions the project is built on.
- **[CLAUDE.md](CLAUDE.md)** — orientation for new contributors (and AI assistants); also a notebook of non-obvious debugging lessons (the rooster compose iframe wipe, hotkeys-js's lack of sequence support, scope detection across frames, …).
- **[TODO.md](TODO.md)** — phased task list with checked-off and pending items.
- **[TEST_MATRIX.md](TEST_MATRIX.md)** — manual verification checklist.
- **[TEST_PLAN.md](TEST_PLAN.md)** — interactive verification via either the `firefox-devtools` or `chrome-devtools` MCP server. The Firefox path requires the [`inputsimulation` fork of firefox-devtools-mcp](https://github.com/jasonanovak/firefox-devtools-mcp/tree/inputsimulation) (upstream lacks the `press_key` tool the plan depends on). The Chrome path requires `chrome-devtools-mcp` started with the `--categoryExtensions` flag (default-disabled).

## License

MIT — see `package.json`.

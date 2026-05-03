# Automated Test Plan

The executable counterpart of `TEST_MATRIX.md`. Uses the `firefox-devtools` MCP server to drive a real Firefox session and verify outcomes by **comparing DOM snapshots before and after each shortcut**. Console logs are diagnostic only — they're useful when a test fails to figure out *why*, but the pass/fail signal is always observable user-facing state.

`TEST_MATRIX.md` remains the human checklist. This plan is what a session runs when the goal is "do a verification pass with keystrokes but without requiring a human to press them."

## Preconditions

- `dist/firefox/` exists. Run `npm run build` if not.
- Firefox is running with the MCP server attached. Verify with `mcp__firefox-devtools__get_firefox_info`.
- A Proton Mail test account is signed in **and** native shortcuts have been disabled (Settings → General → Keyboard shortcuts). Decision #2 in `DESIGN.md` is "natives are off"; leaving them on causes double-fire and the matrix is meaningless.
- Inbox has at least 3 messages, including at least one **unread** message and at least one already **starred** message. Some assertions need both states.
- Manual sign-in has happened once in the profile this MCP session uses, so storage persists across runs (CAPTCHA / 2FA make scripted auth brittle).

## One-time setup per session

```
# 1. Install the unpacked extension. `path` must be absolute; resolve from
# the repo root: <repo>/dist/firefox
mcp__firefox-devtools__install_extension({
  type: "path",
  path: "<absolute-path-to-repo>/dist/firefox"
})

# 2. Open Proton Mail at the inbox so list scope is the starting state
mcp__firefox-devtools__navigate_page({ url: "https://mail.proton.me/u/0/inbox" })

# 3. Confirm the page is at the inbox (URL via list_pages, DOM via snapshot)
mcp__firefox-devtools__list_pages()
# expect the selected tab's url to end in /u/0/inbox
mcp__firefox-devtools__take_snapshot({ selector: "section[aria-label='Message list']" })
# expect at least 3 message rows
```

If the snapshot is empty or the URL is wrong, fix before continuing.

## Per-test pattern

Every test runs the same five-step shape. **Verification is always a comparison of two snapshots.** Console reads, when used, are only for diagnosing a fail.

```
1. Position    — navigate / click_by_uid as needed to put the page in the
                 required precondition.
2. Pre-snap    — take_snapshot scoped to the region we expect to change.
                 This is the baseline; capture exactly what we'll re-check.
3. Press       — press_key({ key: "..." }) (or two press_keys back-to-back
                 for sequence shortcuts like `g i`).
4. Post-snap   — take_snapshot with the *same* selector / scope as pre-snap.
5. Assert      — compare. The test row below names the specific DOM
                 difference that distinguishes pass from fail.
```

For tests whose effect is a URL change rather than DOM mutation (folder navigation), the comparison is between `list_pages()` results before and after — same shape, different observation tool. The principle ("compare before and after the keypress") is unchanged.

Two-key sequences (`g i`, `g d`, etc.) are two `press_key` calls in immediate succession; the engine's sequence timeout is 1 s and back-to-back tool calls easily meet that. `*` is bound as `shift+8` (hotkeys-js's `*` is its wildcard — see CLAUDE.md), so press it as `press_key({ key: "shift+8" })`.

## Tests

Each row specifies the snapshot scope to use for both pre and post (so they're comparable), and the assertion that must hold in the post relative to the pre.

### Global scope

| # | Action | Position | Press | Snapshot scope | Pre vs post assertion |
|---|--------|----------|-------|----------------|------------------------|
| G1 | Compose | inbox, no composer open | `n` | `body` (or `main`) | `section.composer` absent in pre, present in post |
| G2 | Inbox | navigate to `/u/0/archive` first | `g`, `i` | `list_pages()` URL | URL ends `/inbox` in post |
| G3 | Drafts | inbox | `g`, `d` | `list_pages()` URL | URL ends `/drafts` or `/all-drafts` in post |
| G4 | Sent | inbox | `g`, `e` | `list_pages()` URL | URL ends `/sent` or `/all-sent` in post |
| G5 | Archive | inbox | `g`, `a` | `list_pages()` URL | URL ends `/archive` in post |
| G6 | Spam | inbox | `g`, `s` | `list_pages()` URL | URL ends `/spam` in post |
| G7 | Trash | inbox | `g`, `t` | `list_pages()` URL | URL ends `/trash` in post |
| G8 | Starred | inbox | `g`, `shift+8` | `list_pages()` URL | URL ends `/starred` in post |
| G9 | All Mail | inbox | `g`, `m` | `list_pages()` URL | URL ends `/all-mail` or `/almost-all-mail` in post |

After each navigation test, navigate back to the inbox before the next test:

```
mcp__firefox-devtools__navigate_page({ url: "https://mail.proton.me/u/0/inbox" })
```

### List scope

These need at least one message **selected** (checkbox checked). Until Phase 3.5 lands keyboard-driven row selection, click a row's checkbox first via `take_snapshot` + `click_by_uid`. After P3.5 this becomes `press_key({ key: "x" })`.

```
# Run once before the list-scope block:
mcp__firefox-devtools__take_snapshot({
  selector: "section[aria-label='Message list']",
  includeAttributes: true,
})
# Find a row checkbox uid (look for [type='checkbox'] in the snapshot tree),
# then:
mcp__firefox-devtools__click_by_uid({ uid: "<checkbox-uid>" })
```

| # | Action | Press | Snapshot scope | Pre vs post assertion |
|---|--------|-------|----------------|------------------------|
| L1 | Mark read | `r` | the selected row | unread badge / data-attr present in pre, absent in post |
| L2 | Mark unread | `u` | the selected row | unread badge / data-attr absent in pre, present in post |
| L3 | Trash | `t` | `section[aria-label='Message list']` | row count decreases by 1; the previously-selected message-id absent in post |
| L4 | Spam | `s` | `section[aria-label='Message list']` | row count decreases by 1 |
| L5 | Archive | `a` | `section[aria-label='Message list']` | row count decreases by 1 |
| L6 | Inbox (only meaningful in archive/trash/spam) | navigate to `/u/0/archive`, select a row, then `i` | `section[aria-label='Message list']` (in archive) | row count decreases by 1 |
| L7 | Star | `shift+8` | the selected row | row's `[data-testid="item-star-true"]` flips to `item-star-false` (or the inverse) |
| L8 | Select all | `ctrl+a` | `section[aria-label='Message list']` | every row's checkbox `aria-checked="true"` (or equivalent) in post; mostly unchecked in pre |

L3/L4/L5/L6 are destructive. Either run them against a folder with disposable fixtures, or skip and rely on the dispatch log alone.

### Reading scope

Setup: open a message.

```
mcp__firefox-devtools__take_snapshot({
  selector: "section[aria-label='Message list']",
})
# Find a message row uid (the row container, not the checkbox), then:
mcp__firefox-devtools__click_by_uid({ uid: "<row-uid>" })
mcp__firefox-devtools__take_snapshot({
  selector: "article[data-testid^='message-view-']",
})
# Confirm a message-view article is present (this is also the snapshot
# scope for several reading tests below).
```

| # | Action | Press | Snapshot scope | Pre vs post assertion |
|---|--------|-------|----------------|------------------------|
| R1 | Reply | `r` | `body` | `section.composer` absent in pre, present in post |
| R2 | Reply all | `shift+r` | `body` | `section.composer` absent in pre, present in post (recipient list with >1 entry — secondary check) |
| R3 | Forward | `shift+f` | `body` | `section.composer` absent in pre, present in post |
| R4 | Mark unread | `u` | `body` | `article[data-testid^='message-view-']` present in pre, absent in post (Proton returns to list) |
| R5 | Trash | `t` | `body` | message-view article present in pre, absent in post |
| R6 | Spam | `s` | `body` | message-view article present in pre, absent in post |
| R7 | Archive | `a` | `body` | message-view article present in pre, absent in post |
| R8 | Inbox (from archive/trash/spam) | `i` | `body` | message-view article present in pre, absent in post |
| R9 | Star | `shift+8` | `article[data-testid^='message-view-']` (or its star icon container) | star icon's data-testid (`item-star-true` ↔ `item-star-false`) flips |
| R10 | Next message | `j` | `article[data-testid^='message-view-']` | the article's data-testid suffix (the conversation index) changes |
| R11 | Prev message | `k` | `article[data-testid^='message-view-']` | the article's data-testid suffix changes |

R5/R6/R7/R8 are destructive — open a different message after each, or work off a folder of fixtures.

### Composing scope

Setup: open compose with `n` first.

```
mcp__firefox-devtools__press_key({ key: "n" })
mcp__firefox-devtools__take_snapshot({ selector: "section.composer" })
# expect the composer container; confirm before continuing
```

For tests C2 and C3, focus must be inside the rooster body iframe. The iframe's data-testid is `rooster-iframe`. Click into it:

```
mcp__firefox-devtools__take_snapshot({ selector: "section.composer" })
# Find the iframe uid, then:
mcp__firefox-devtools__click_by_uid({ uid: "<rooster-iframe-uid>" })
```

| # | Action | Setup focus | Press | Snapshot scope | Pre vs post assertion |
|---|--------|-------------|-------|----------------|------------------------|
| C1a | Close (subject focused) | click subject input | `Escape` | `body` | `section.composer` present in pre, absent in post |
| C1b | Close (body focused) | click into rooster iframe | `Escape` | `body` | `section.composer` present in pre, absent in post |
| C2 | Send (body focused, draft has body) | type body text, click into rooster body | `ctrl+enter` | `body` | `section.composer` present in pre, absent in post; "Message sent" toast `[role="status"]` (or similar) appears |
| C3 | Insert link (body focused) | click into rooster body | `ctrl+k` | `body` | link insertion modal `[role="dialog"]` absent in pre, present in post |

Send and insert-link rely on Proton's `useBubbleIframeEvents` re-dispatching iframe keystrokes onto the parent document (see CLAUDE.md "Rooster compose iframe"). If the post-snapshot assertion fails, suspect that bubble path before suspecting the binding — verify by looking at console for `[upmks] dispatch compose.send`.

### Edge cases / regressions

These tests verify shortcuts **don't fire** in editable contexts. The assertion is "pre and post snapshots are equivalent" — i.e., the keystroke produced ordinary input, not a dispatch.

| # | Behavior | Position | Press | Snapshot scope | Pre vs post assertion |
|---|----------|----------|-------|----------------|------------------------|
| E1 | `n` does NOT compose from search box | click the inbox search box | `n` | `section.composer` (expecting NOT present) and the search input value | post: still no `section.composer`; search input value gained an `n` |
| E2 | `n` does NOT compose from compose To | open compose, click To input | `n` | the To input element | post: To input value gained an `n`; only one `section.composer` (no second one opened) |
| E3 | `g i` does NOT navigate from compose body | open compose, click into rooster iframe body | `g`, `i` | `list_pages()` URL and the rooster iframe body | post: URL unchanged; body text contains the typed `gi` |

E2 and E3 require reading the input value via `take_snapshot({ includeText: true })` and checking the input's value-equivalent text in the snapshot.

## Cleanup

Restore a known state at the end of a test pass:

```
mcp__firefox-devtools__navigate_page({ url: "https://mail.proton.me/u/0/inbox" })
mcp__firefox-devtools__clear_console_messages()
mcp__firefox-devtools__screenshot_page({ format: "png" })
```

The screenshot is for the run record.

## Diagnostic helpers

When an assertion fails, **then** look at the console — that's where the design's signals live:

```
mcp__firefox-devtools__list_console_messages({ textContains: "[upmks]", limit: 30 })
```

What to look for:
- `[upmks] dispatch <id>` — handler fired (engine + sequence layer working).
- `[upmks] <id> selector did not resolve; nothing to click` — handler fired but the selector module didn't find the DOM target. Check `selectors.ts` against the current Proton DOM.
- No dispatch line at all — the keystroke didn't reach our engine. Check scope (`[upmks] scope → ...`), check `isSequence`/`parseSequence` mis-classification, check that the iframe content script booted (`[upmks] [frame] loaded settings`).

## Known limitations

- **Selector drift in destructive tests.** Tests that mutate state (move to trash/spam/archive) need fresh fixtures each pass. The plan doesn't yet provision them; for now run destructive tests against a folder you don't mind churning, or skip and confirm via the diagnostic console reads.
- **Phase 3.5 gap**: list-scope toolbar shortcuts (mark-read/unread/move-to-X) require selection in the DOM. Until P3.5 lands keyboard-driven row selection, the plan must click the row checkbox first via `click_by_uid`. After P3.5, that click is replaced with `press_key({ key: "x" })` (or whatever the toggleSelect default ends up being).
- **2FA / CAPTCHA on first sign-in**: not in scope. The plan assumes a profile where the Proton session is already established and persisted.
- **Cross-browser**: this plan runs Firefox via the firefox-devtools MCP. A Chrome equivalent needs a Chrome MCP or a Playwright bridge — out of scope until Phase 5.
- **Modifier key naming**: `press_key` accepts `meta` for the platform "command" key on macOS and `ctrl` on Linux/Windows. Our bindings register both (`command+enter, ctrl+enter`); pick the modifier that matches the test machine.
- **Snapshot scoping is selector-dependent.** When the scope selector itself disappears or changes (Proton ships a UI update), snapshots fail to capture anything — that's a *test-infra* failure, not a shortcut failure. The selector probe (DESIGN.md §3.6) is what catches that on the runtime side; the test plan inherits the same fragility.

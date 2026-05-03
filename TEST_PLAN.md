# Automated Test Plan

The executable counterpart of `TEST_MATRIX.md`. Uses either the `firefox-devtools` MCP server (Firefox) or the `chrome-devtools` MCP server (Chrome) to drive a real browser session, and verifies outcomes by **comparing DOM snapshots before and after each shortcut**. Console logs are diagnostic only — they're useful when a test fails to figure out *why*, but the pass/fail signal is always observable user-facing state.

`TEST_MATRIX.md` remains the human checklist. This plan is what a session runs when the goal is "do a verification pass with keystrokes but without requiring a human to press them."

## Preconditions

Common to both browsers:

- `dist/firefox/` (or `dist/chrome/`) exists. Run `npm run build` if not.
- A Proton Mail test account is signed in **and** native shortcuts have been disabled (Settings → General → Keyboard shortcuts). Decision #2 in `DESIGN.md` is "natives are off"; leaving them on causes double-fire and the matrix is meaningless.
- Inbox has at least 3 messages, including at least one **unread** message and at least one already **starred** message. Some assertions need both states.

Browser-specific:

**Firefox path.** Run with the [`inputsimulation` fork of firefox-devtools-mcp](https://github.com/jasonanovak/firefox-devtools-mcp/tree/inputsimulation). Upstream `firefox-devtools-mcp` does not expose `press_key`, which the entire plan depends on. If `mcp__firefox-devtools__press_key` is missing from the available tool list, you have the wrong MCP server. The Firefox MCP reuses its temp profile across reconnects, so a one-time manual sign-in persists.

**Chrome path.** Run with `chrome-devtools-mcp` started with `--categoryExtensions` (default-disabled). In `~/.claude.json`, the args entry should be:
```json
"args": ["chrome-devtools-mcp@latest", "--categoryExtensions"]
```
The Chrome MCP launches a fresh user-data-dir on each connect by default, so you'll need to sign into Proton manually each session. To make sign-in stick across sessions, pass `--userDataDir=<absolute-path>` so the profile persists; reuse the same path on subsequent runs.

## Modifier-key syntax differs between MCPs

The single biggest copy-paste hazard. Same shortcut, different `press_key` payload:

| Action | Firefox MCP | Chrome MCP |
|--------|-------------|------------|
| Mark all (Ctrl+A) | `"ctrl+a"` | `"Control+A"` |
| Reply all (Shift+R) | `"shift+r"` | `"Shift+R"` |
| Send (Cmd+Enter) | `"command+enter"` | `"Meta+Enter"` |
| Star (Shift+8) | `"shift+8"` | `"Shift+8"` |
| Folder nav (g i) | `"g"` then `"i"` | `"g"` then `"i"` |

Firefox MCP follows hotkeys-js syntax (lowercase, `command`/`ctrl`/`alt`/`shift`). Chrome MCP follows DevTools convention (capitalized, `Control`/`Shift`/`Alt`/`Meta`). Letter and digit keys are unchanged.

## One-time setup per session

**Firefox:**
```
mcp__firefox-devtools__install_extension({
  type: "path",
  path: "<absolute-path-to-repo>/dist/firefox"
})
mcp__firefox-devtools__navigate_page({ url: "https://mail.proton.me/u/0/inbox" })
mcp__firefox-devtools__list_pages()                              # confirm URL
mcp__firefox-devtools__take_snapshot({ selector: "section[aria-label='Message list']" })
```

**Chrome:**
```
mcp__chrome-devtools__install_extension({
  path: "<absolute-path-to-repo>/dist/chrome"
})
mcp__chrome-devtools__list_extensions()                          # confirm install
mcp__chrome-devtools__navigate_page({ type: "url", url: "https://mail.proton.me/u/0/inbox" })
# If redirected to account.proton.me/mail, sign in manually in the MCP browser.
mcp__chrome-devtools__list_pages()                               # confirm URL
mcp__chrome-devtools__take_snapshot()
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

**Quirk to know about:** in compose scope, `Escape` is `compose.close` regardless of focus context. If a sub-modal is open inside the composer (e.g., the link-insert modal C3 spawns), pressing Esc closes the **whole composer**, not just the modal — our binding fires before Proton's modal handler. Run C3 → C2 → C1 in that order, or open a fresh composer between sub-modal tests, to avoid the chain consuming the Esc you wanted for the modal. See CLAUDE.md "Engine semantics worth knowing".

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
# Firefox MCP
mcp__firefox-devtools__list_console_messages({ textContains: "[upmks]", limit: 30 })

# Chrome MCP — note: defaults to "since last navigation"; pass
# includePreservedMessages to see boot logs after navigation.
mcp__chrome-devtools__list_console_messages({
  includePreservedMessages: true,
  pageSize: 30,
  types: ["debug", "info", "warn"]
})
```

What to look for:
- `[upmks] dispatch <id>` — handler fired (engine + sequence layer working).
- `[upmks] <id> selector did not resolve; nothing to click` — handler fired but the selector module didn't find the DOM target. Check `selectors.ts` against the current Proton DOM.
- No dispatch line at all — the keystroke didn't reach our engine. Check scope (`[upmks] scope → ...`), check `isSequence`/`parseSequence` mis-classification, check that the iframe content script booted (`[upmks] [frame] loaded settings`).

## Known limitations

- **Selector drift in destructive tests.** Tests that mutate state (move to trash/spam/archive) need fresh fixtures each pass. The plan doesn't yet provision them; for now run destructive tests against a folder you don't mind churning, or skip and confirm via the diagnostic console reads.
- **2FA / CAPTCHA on first sign-in**: not in scope. The plan assumes a profile where the Proton session is already established. On Firefox MCP this happens once and persists; on Chrome MCP it must be redone each session unless `--userDataDir` is configured.
- **Modifier key naming**: see the table at the top of this doc — Firefox MCP uses hotkeys-js syntax (`command+enter`, `ctrl+a`), Chrome MCP uses DevTools convention (`Meta+Enter`, `Control+A`). Our bindings register both `command+enter, ctrl+enter` so Linux + macOS both work; pick the modifier the MCP expects, not the one the binding uses.
- **Snapshot scoping is selector-dependent.** When the scope selector itself disappears or changes (Proton ships a UI update), snapshots fail to capture anything — that's a *test-infra* failure, not a shortcut failure. The selector probe (DESIGN.md §3.6) is what catches that on the runtime side; the test plan inherits the same fragility.
- **Page-render race after `navigate_page`**: the compose button (and other top-frame DOM) may not be in the DOM the moment navigation resolves. Pressing `n` immediately after `navigate_page` can miss; if `dispatch compose` fires but the warn says "selector did not resolve", press `n` again after taking a snapshot to confirm DOM is settled. Same applies to other navigation-then-shortcut chains.

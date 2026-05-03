# Test Matrix

Manual verification of default bindings against PRD CUJs. Reload the extension in both browsers, sign into Proton Mail, **disable Proton's native shortcuts** (Settings → General → Keyboard shortcuts), then walk the matrix.

Mac users: `Ctrl+X` cells use `Cmd+X` instead.

| Scope | Shortcut | Action | Pass/Fail | Notes |
|-------|----------|--------|-----------|-------|
| Global | `n` | Open compose | Pass | |
| Global | `g i` | Go to Inbox | Pass | |
| Global | `g d` | Go to Drafts | Pass | |
| Global | `g e` | Go to Sent | Pass | |
| Global | `g a` | Go to Archive | Pass | |
| Global | `g s` | Go to Spam | Pass | |
| Global | `g t` | Go to Trash | Pass | |
| Global | `g *` | Go to Starred | Pass | |
| Global | `g m` | Go to All Mail | Pass | |
| List | `r` | Mark as read | Pass | |
| List | `u` | Mark as unread | Pass | |
| List | `t` | Move to Trash | Pass | |
| List | `s` | Move to Spam | Pass | |
| List | `a` | Move to Archive | Pass | |
| List | `i` | Move to Inbox | Pass | |
| List | `*` | Toggle star | Failed | The top message in the list is starred not the message selected |
| List | `Ctrl+A` | Select all in list | Failed | All content on page highlighted. No console logging. |
| Reading | `r` | Reply | Pass | Pass |
| Reading | `Shift+R` | Reply all | Pass | |
| Reading | `Shift+F` | Forward | Pass | |
| Reading | `u` | Mark as unread | Pass | |
| Reading | `t` | Move to Trash | Pass | |
| Reading | `s` | Move to Spam | Pass | |
| Reading | `a` | Move to Archive | Pass | |
| Reading | `i` | Move to Inbox | Pass | |
| Reading | `*` | Toggle star | Failed | |
| Reading | `j` | Next message | Pass | |
| Reading | `k` | Previous message | Pass | |
| Composing | `Esc` | Close composer (test from subject, to, AND body) | Pass | |
| Composing | `Ctrl+Enter` | Send (test from body, not just subject) | Failed | No console logging |
| Composing | `Ctrl+K` | Insert link (in body) | Failed | No console logging |

## Edge cases / regressions to spot-check

| Behavior | Pass/Fail | Notes |
|----------|-----------|-------|
| `n` does NOT fire when typing in search box | Pass | |
| `n` does NOT fire when typing in compose To / Subject / body | Pass | |
| `g i` does NOT fire when "gi" is typed in subject/body | Pass | |

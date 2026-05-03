// Action definitions — see DESIGN.md §3.5 and §4.
//
// Default bindings reconciled against Proton Mail live behavior on
// 2026-05-02 by reading the WebClients source. Sources of truth:
//   applications/mail/src/app/hooks/mailbox/usePageHotkeys.tsx
//   applications/mail/src/app/hooks/mailbox/useMailboxHotkeys.tsx
//   applications/mail/src/app/hooks/mailbox/useFolderNavigationHotkeys.ts
//   applications/mail/src/app/hooks/message/useMessageHotkeys.tsx
//   packages/shared/lib/shortcuts/mail.ts
//
// When a default below differs from DESIGN.md §4's example list, live
// behavior won (per the doc's reconciliation rule).
//
// Each Action declares its scopes, default binding, and a run() that drives
// the DOM via the Selector Module. The engine and registry stay DOM-unaware.
//
// Scope notes:
//   "global"    — fires anywhere not explicitly captured below.
//   "list"      — message list scope. Same key may bind a different action
//                 in "reading" (e.g., R = mark-read in list, reply in reading).
//   "reading"   — message-open scope.
//   "composing" — compose modal open. Bindings in this scope opt back into
//                 firing from inputs/contenteditables (see engine §3.4).
//
// Cross-platform modifier keys: Proton uses Cmd on Mac and Ctrl elsewhere;
// hotkeys-js doesn't auto-resolve, so we bind both as comma-separated
// alternatives (e.g. "command+enter, ctrl+enter").

import type { Action } from "./registry.js";
import { selectors } from "./selectors.js";

const LOG_PREFIX = "[upmks]";

function clickOrWarn(actionId: string, el: HTMLElement | null): void {
  if (el) {
    el.click();
  } else {
    console.warn(LOG_PREFIX, actionId, "selector did not resolve; nothing to click");
  }
}

// Phase 3.5: keyboard-driven row navigation and selection. The "focused"
// row is whatever row natively has browser focus (Proton rows are
// tabindex=0 + role="region"); when nothing has focus, fall back to the
// first row. Nav actions only refocus — they don't open the message.

function focusedOrFirstRow(): HTMLElement | null {
  return selectors.focusedListRow() ?? selectors.listRows()[0] ?? null;
}

function focusListRowDelta(actionId: string, delta: number): void {
  const rows = selectors.listRows();
  if (rows.length === 0) {
    console.warn(LOG_PREFIX, actionId, "no rows in list");
    return;
  }
  const current = selectors.focusedListRow();
  let nextIdx: number;
  if (current) {
    const idx = rows.indexOf(current);
    nextIdx = Math.max(0, Math.min(rows.length - 1, idx + delta));
  } else {
    nextIdx = delta > 0 ? 0 : rows.length - 1;
  }
  const target = rows[nextIdx];
  if (!target) return;
  target.focus();
  target.scrollIntoView({ block: "nearest" });
}

// Folder navigation goes through URL assignment, not sidebar clicks. Proton
// collapses Archive / Spam / Trash / All Mail behind a "More" toggle when
// folder lists get long, so the sidebar links aren't always present in the
// DOM. Navigating to /u/<n>/<humanId> works regardless of sidebar state and
// preserves the user's account prefix.
function topWindow(): Window {
  try {
    return window.top ?? window;
  } catch {
    return window;
  }
}

function navigateToFolderPath(humanId: string): void {
  const top = topWindow();
  const path = top.location.pathname;
  const match = /^(\/u\/\d+\/)/.exec(path);
  const prefix = match ? match[1] : "/u/0/";
  top.location.href = `${prefix}${humanId}`;
}

const navigateToFolder = (
  id: string,
  label: string,
  binding: string,
  humanId: string,
): Action => ({
  id,
  label,
  scopes: ["global"],
  defaultBinding: binding,
  run: () => navigateToFolderPath(humanId),
});

export const ALL_ACTIONS: Action[] = [
  // ── Global ──────────────────────────────────────────────────────────────
  {
    id: "compose",
    label: "Compose new message",
    scopes: ["global"],
    defaultBinding: "n",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.composeButton()),
  },
  navigateToFolder("goto.inbox", "Go to Inbox", "g i", "inbox"),
  navigateToFolder("goto.drafts", "Go to Drafts", "g d", "drafts"),
  navigateToFolder("goto.sent", "Go to Sent", "g e", "sent"),
  navigateToFolder("goto.archive", "Go to Archive", "g a", "archive"),
  navigateToFolder("goto.spam", "Go to Spam", "g s", "spam"),
  navigateToFolder("goto.trash", "Go to Trash", "g t", "trash"),
  // hotkeys-js treats `*` as the "any key" wildcard, not the literal
  // asterisk, so we use `shift+8` (the US-layout chord that produces `*`).
  // EU layouts can rebind via the Options page once Phase 4 ships.
  navigateToFolder("goto.starred", "Go to Starred", "g shift+8", "starred"),
  navigateToFolder("goto.allMail", "Go to All Mail", "g m", "all-mail"),

  // ── Message list ────────────────────────────────────────────────────────
  {
    id: "list.markRead",
    label: "Mark as read",
    scopes: ["list"],
    defaultBinding: "r",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.markReadButton()),
  },
  {
    id: "list.selectAll",
    label: "Select all messages",
    scopes: ["list"],
    defaultBinding: "command+a, ctrl+a",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.selectAllCheckbox()),
  },
  {
    id: "list.focusNext",
    label: "Focus next message",
    scopes: ["list"],
    defaultBinding: "down",
    run: ({ actionId }) => focusListRowDelta(actionId, +1),
  },
  {
    id: "list.focusPrev",
    label: "Focus previous message",
    scopes: ["list"],
    defaultBinding: "up",
    run: ({ actionId }) => focusListRowDelta(actionId, -1),
  },
  {
    id: "list.toggleSelect",
    label: "Toggle message selection",
    scopes: ["list"],
    defaultBinding: "x",
    run: ({ actionId }) => {
      const row = focusedOrFirstRow();
      if (!row) {
        console.warn(LOG_PREFIX, actionId, "no rows to select");
        return;
      }
      clickOrWarn(actionId, selectors.rowCheckbox(row));
    },
  },
  {
    id: "list.openFocused",
    label: "Open focused message",
    scopes: ["list"],
    defaultBinding: "enter",
    run: ({ actionId }) => {
      const row = focusedOrFirstRow();
      if (!row) {
        console.warn(LOG_PREFIX, actionId, "no rows to open");
        return;
      }
      row.click();
    },
  },

  // ── Reading view ────────────────────────────────────────────────────────
  {
    id: "reply",
    label: "Reply",
    scopes: ["reading"],
    defaultBinding: "r",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.replyButton()),
  },
  {
    id: "replyAll",
    label: "Reply all",
    scopes: ["reading"],
    defaultBinding: "shift+r",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.replyAllButton()),
  },
  {
    id: "forward",
    label: "Forward",
    scopes: ["reading"],
    defaultBinding: "shift+f",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.forwardButton()),
  },
  {
    id: "prevMessage",
    label: "Previous message",
    scopes: ["reading"],
    defaultBinding: "k",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.prevMessageButton()),
  },
  {
    id: "nextMessage",
    label: "Next message",
    scopes: ["reading"],
    defaultBinding: "j",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.nextMessageButton()),
  },

  // ── Shared list + reading (the toolbar covers both views) ───────────────
  {
    id: "markUnread",
    label: "Mark as unread",
    scopes: ["list", "reading"],
    defaultBinding: "u",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.markUnreadButton()),
  },
  {
    id: "archive",
    label: "Archive",
    scopes: ["list", "reading"],
    defaultBinding: "a",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.archiveButton()),
  },
  {
    id: "trash",
    label: "Move to Trash",
    scopes: ["list", "reading"],
    defaultBinding: "t",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.trashButton()),
  },
  {
    id: "spam",
    label: "Move to Spam",
    scopes: ["list", "reading"],
    defaultBinding: "s",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.spamButton()),
  },
  {
    id: "moveToInbox",
    label: "Move to Inbox",
    scopes: ["list", "reading"],
    defaultBinding: "i",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.inboxButton()),
  },
  {
    id: "star",
    label: "Star / unstar",
    scopes: ["list", "reading"],
    // See note on goto.starred: `*` is hotkeys-js's wildcard, so bind the chord.
    defaultBinding: "shift+8",
    run: ({ actionId }) => {
      // Prefer the row-level star of the currently-focused row. Falls back
      // to the message-view star icon (reading scope, no list focus).
      const focused = selectors.focusedListRow();
      if (focused) {
        const star = selectors.rowStar(focused);
        if (star) {
          star.click();
          return;
        }
      }
      clickOrWarn(actionId, selectors.starButton());
    },
  },

  // ── Composing ───────────────────────────────────────────────────────────
  {
    id: "compose.close",
    label: "Close composer",
    scopes: ["composing"],
    defaultBinding: "escape",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.composerCloseButton()),
  },
  {
    id: "compose.send",
    label: "Send",
    scopes: ["composing"],
    defaultBinding: "command+enter, ctrl+enter",
    run: ({ actionId }) => clickOrWarn(actionId, selectors.composerSendButton()),
  },
  {
    id: "compose.insertLink",
    label: "Insert link",
    scopes: ["composing"],
    defaultBinding: "command+k, ctrl+k",
    run: ({ actionId }) =>
      clickOrWarn(actionId, selectors.editorInsertLinkButton()),
  },
];

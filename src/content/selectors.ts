// Selector Module — see DESIGN.md §3.6.
//
// All knowledge of Proton's DOM lives here. Each lookup is a named export
// with a fallback chain ending in an aria-label or role-based query, since
// data-testid is the most volatile. Selectors are also cross-frame aware:
// each query searches the current document, then the parent (when running
// in an iframe), then any same-origin child iframes. This is what lets
// compose-scope shortcuts fire from inside the rooster iframe and still
// click the parent's send button.
//
// Selector sources (Proton WebClients @ 2026-05-02):
//   compose button:    applications/mail/.../sidebar/MailSidebarPrimaryButton.tsx
//   reply / replyAll / forward:
//                      applications/mail/.../message/extrasHeader/HeaderExpanded.tsx
//   list toolbar move/read buttons:
//                      applications/mail/.../toolbar/MoveButtons.tsx
//                      applications/mail/.../toolbar/ReadUnreadButtons.tsx
//                      applications/mail/.../toolbar/SelectAll.tsx
//                      applications/mail/.../toolbar/NavigationControls.tsx
//   star:              applications/mail/.../list/ItemStar.tsx
//   composer actions:  applications/mail/.../composer/actions/ComposerActions/...
//                      applications/mail/.../composer/ComposerTitleBar.tsx
//   editor toolbar:    packages/components/components/editor/toolbar/Toolbar.tsx
//   sidebar nav:       applications/mail/.../sidebar/SidebarItem.tsx

type Doc = Document;

function* candidateDocuments(): Generator<Doc> {
  yield document;
  if (window !== window.top) {
    try {
      const parent = window.parent.document;
      if (parent) yield parent;
    } catch {
      // cross-origin parent — ignore
    }
  }
  for (const iframe of document.querySelectorAll<HTMLIFrameElement>("iframe")) {
    try {
      const doc = iframe.contentDocument;
      if (doc) yield doc;
    } catch {
      // cross-origin child — ignore
    }
  }
}

function query<T extends HTMLElement = HTMLElement>(selector: string): T | null {
  for (const doc of candidateDocuments()) {
    const el = doc.querySelector<T>(selector);
    if (el) return el;
  }
  return null;
}

function findByAriaLabel(
  pattern: RegExp,
  exclude?: RegExp,
): HTMLElement | null {
  for (const doc of candidateDocuments()) {
    const candidates = doc.querySelectorAll<HTMLElement>("button, a, [role='button']");
    for (const el of candidates) {
      const label = el.getAttribute("aria-label") ?? "";
      if (!pattern.test(label)) continue;
      if (exclude && exclude.test(label)) continue;
      return el;
    }
  }
  return null;
}

// ─── Compose / reply / forward / archive (Phase 2 + reading-view extensions) ─

export const composeButton = (): HTMLElement | null =>
  query('[data-testid="sidebar:compose"]') ??
  query('[data-testid="sidebar:compose-bar"]') ??
  findByAriaLabel(/new message/i) ??
  findByAriaLabel(/compose/i);

export const replyButton = (): HTMLElement | null =>
  query('[data-testid="message-view:reply"]') ??
  findByAriaLabel(/^reply$/i) ??
  findByAriaLabel(/reply(?! all)/i, /reply all/i);

export const replyAllButton = (): HTMLElement | null =>
  query('[data-testid="message-view:reply-all"]') ??
  findByAriaLabel(/reply all/i);

export const forwardButton = (): HTMLElement | null =>
  query('[data-testid="message-view:forward"]') ??
  findByAriaLabel(/^forward$/i);

// ─── Toolbar actions (work in list view, and in reading view via the same toolbar) ─

export const archiveButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:movetoarchive"]') ??
  query('[data-testid="message-view:movetoarchive"]') ??
  findByAriaLabel(/move to archive/i) ??
  findByAriaLabel(/^archive$/i);

export const trashButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:movetotrash"]') ??
  query('[data-testid="message-header-expanded:move-to-trash"]') ??
  findByAriaLabel(/move to trash/i);

export const spamButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:movetospam"]') ??
  query('[data-testid="message-view-more-dropdown:move-to-spam"]') ??
  findByAriaLabel(/move to spam/i);

export const inboxButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:movetoinbox"]') ??
  query('[data-testid="message-header-expanded:move-trashed-to-inbox"]') ??
  query('[data-testid="message-header-expanded:move-spam-to-inbox"]') ??
  findByAriaLabel(/move to inbox/i);

export const markReadButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:read"]') ??
  findByAriaLabel(/^mark as read$/i);

export const markUnreadButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:unread"]') ??
  query('[data-testid="message-header-expanded:mark-as-unread"]') ??
  findByAriaLabel(/^mark as unread$/i);

export const selectAllCheckbox = (): HTMLElement | null =>
  query('[data-testid="toolbar:select-all-checkbox"]') ??
  findByAriaLabel(/select all messages/i);

// ─── Star / unstar — toggles, so we accept either state ─

export const starButton = (): HTMLElement | null =>
  query('[data-testid="item-star-true"]') ??
  query('[data-testid="item-star-false"]') ??
  findByAriaLabel(/^(star|unstar) message$/i);

// ─── Reading-view navigation (toolbar) ─

export const prevMessageButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:previous-element"]') ??
  findByAriaLabel(/previous (message|conversation)/i);

export const nextMessageButton = (): HTMLElement | null =>
  query('[data-testid="toolbar:next-element"]') ??
  findByAriaLabel(/next (message|conversation)/i);

// ─── Modal detection ─
// Returns true if any Proton modal/dialog is currently visible. Used by the
// canFire gates on compose-scope shortcuts so that, for example, pressing
// Esc while the Insert Link modal is open closes the modal (Proton's own
// handler) rather than the entire composer.
//
// Proton's `ModalTwo` component (the standard modal as of 2026-05-02) uses
// `.modal-two-backdrop--in` for the visible state — no role="dialog" or
// aria-modal attribute. The bare `.modal-two-backdrop` (without --in)
// LINGERS in the DOM after the modal closes, so we must only match the
// --in modifier. ARIA selectors are forward-compat fallbacks.

const MODAL_SELECTOR =
  '.modal-two-backdrop--in, [role="dialog"], [aria-modal="true"]';

export function isModalOpen(): boolean {
  for (const doc of candidateDocuments()) {
    if (doc.querySelector(MODAL_SELECTOR)) return true;
  }
  return false;
}

// ─── Composer ─

export const composerSendButton = (): HTMLElement | null =>
  query('[data-testid="composer:send-button"]') ??
  findByAriaLabel(/^send$/i);

export const composerCloseButton = (): HTMLElement | null =>
  query('[data-testid="composer:close-button"]') ??
  findByAriaLabel(/close composer/i);

export const editorInsertLinkButton = (): HTMLElement | null =>
  query('[data-testid="editor-insert-link"]') ??
  findByAriaLabel(/insert link/i);

// ─── Message list rows (Phase 3.5) ─
// Rows are <div role="region" tabindex="0"> with data-element-id; the
// row-level checkbox lives inside via data-testid="item-checkbox" and is
// matched to its row by data-item-id === parent's data-element-id.

const ROW_SELECTOR =
  'div[data-shortcut-target="item-container"][data-element-id]';
const ROW_CHECKBOX_SELECTOR = 'input[data-testid="item-checkbox"]';

export function listRows(): HTMLElement[] {
  for (const doc of candidateDocuments()) {
    const els = doc.querySelectorAll<HTMLElement>(ROW_SELECTOR);
    if (els.length > 0) return Array.from(els);
  }
  return [];
}

export function focusedListRow(): HTMLElement | null {
  // Proton uses native :focus / document.activeElement on rows — see
  // CLAUDE.md "Star icons are per-row" and the Phase 3.5 work in TODO.md.
  for (const doc of candidateDocuments()) {
    const active = doc.activeElement;
    if (active instanceof HTMLElement) {
      const row = active.closest<HTMLElement>(ROW_SELECTOR);
      if (row) return row;
    }
  }
  return null;
}

export function rowCheckbox(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>(ROW_CHECKBOX_SELECTOR);
}

export function rowStar(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>(
    '[data-testid="item-star-true"], [data-testid="item-star-false"]',
  );
}

// ─── Sidebar / folder navigation ─

const sidebarLink = (...humanIds: string[]) => (): HTMLElement | null => {
  // Some folders surface under multiple humanIDs depending on the user's
  // "Show moved" setting (e.g., drafts vs all-drafts). Try each in order.
  for (const id of humanIds) {
    const byTestid = query(`[data-testid="navigation-link:${id}"]`);
    if (byTestid) return byTestid;
  }
  for (const id of humanIds) {
    const byHref = query(`a[href$="/${id}"]`);
    if (byHref) return byHref;
  }
  return null;
};

export const inboxLink = sidebarLink("inbox");
export const draftsLink = sidebarLink("drafts", "all-drafts");
export const sentLink = sidebarLink("sent", "all-sent");
export const archiveLink = sidebarLink("archive");
export const spamLink = sidebarLink("spam");
export const trashLink = sidebarLink("trash");
export const starredLink = sidebarLink("starred");
export const allMailLink = sidebarLink("almost-all-mail", "all-mail");

export const selectors = {
  isModalOpen,
  listRows,
  focusedListRow,
  rowCheckbox,
  rowStar,
  composeButton,
  replyButton,
  replyAllButton,
  forwardButton,
  archiveButton,
  trashButton,
  spamButton,
  inboxButton,
  markReadButton,
  markUnreadButton,
  selectAllCheckbox,
  starButton,
  prevMessageButton,
  nextMessageButton,
  composerSendButton,
  composerCloseButton,
  editorInsertLinkButton,
  inboxLink,
  draftsLink,
  sentLink,
  archiveLink,
  spamLink,
  trashLink,
  starredLink,
  allMailLink,
};

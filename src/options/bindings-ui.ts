// Shared bindings UI — used by both the options page and the toolbar popup.
//
// Owns rendering, edit-in-place recording, conflict detection, and persistence.
// The caller passes a root element; this module owns everything inside it
// and subscribes to settings changes for its lifetime.

import {
  loadSettings,
  saveSettings,
  subscribeSettings,
} from "../settings/storage.js";
import {
  DEFAULT_SETTINGS,
  type StoredSettings,
} from "../settings/schema.js";
import { ALL_ACTIONS } from "../content/actions.js";
import type { Action } from "../content/registry.js";
import type { Scope } from "../content/scope-detector.js";
import { canonicalKey, MODIFIER_KEYS } from "../key-syntax.js";

const SCOPE_ORDER: Scope[] = ["global", "list", "reading", "composing"];
const SCOPE_LABELS: Record<Scope, string> = {
  global: "Global",
  list: "Message list",
  reading: "Reading a message",
  composing: "Composing",
};
const RECORD_TIMEOUT_MS = 1000;
const LOG_PREFIX = "[upmks/bindings-ui]";

let mountRoot: HTMLElement | null = null;
let currentSettings: StoredSettings = { ...DEFAULT_SETTINGS };
let recordingActionId: string | null = null;
let recordedSteps: string[] = [];
let recordTimer: ReturnType<typeof setTimeout> | null = null;
const errorByActionId = new Map<string, string>();

function effectiveBinding(action: Action, settings: StoredSettings): string {
  return settings.bindings[action.id] ?? action.defaultBinding;
}

function actionsForScope(scope: Scope): Action[] {
  return ALL_ACTIONS.filter((a) => a.scopes.includes(scope));
}

function expandScopes(scopes: Scope[]): Scope[] {
  return scopes.includes("global") ? [...SCOPE_ORDER] : scopes;
}

function displayKeys(keys: string): string {
  return keys
    .split(",")
    .map((variant) => {
      const trimmed = variant.trim();
      if (/\s/.test(trimmed)) {
        return trimmed.split(/\s+/).join(" then ");
      }
      return trimmed;
    })
    .join(" / ");
}

function findConflict(
  actionId: string,
  keys: string,
  settings: StoredSettings,
): Action | null {
  const newAction = ALL_ACTIONS.find((a) => a.id === actionId);
  if (!newAction) return null;
  const newScopes = new Set(expandScopes(newAction.scopes));
  for (const other of ALL_ACTIONS) {
    if (other.id === actionId) continue;
    if (effectiveBinding(other, settings) !== keys) continue;
    const otherScopes = new Set(expandScopes(other.scopes));
    for (const s of newScopes) {
      if (otherScopes.has(s)) return other;
    }
  }
  return null;
}

function startRecording(actionId: string): void {
  if (recordingActionId) cancelRecording();
  recordingActionId = actionId;
  recordedSteps = [];
  errorByActionId.delete(actionId);
  document.addEventListener("keydown", onRecordKeydown, true);
  render();
}

function cancelRecording(): void {
  if (recordTimer !== null) clearTimeout(recordTimer);
  recordTimer = null;
  recordingActionId = null;
  recordedSteps = [];
  document.removeEventListener("keydown", onRecordKeydown, true);
  render();
}

async function commitRecording(): Promise<void> {
  if (!recordingActionId || recordedSteps.length === 0) {
    cancelRecording();
    return;
  }
  const actionId = recordingActionId;
  const keys = recordedSteps.join(" ");
  const conflict = findConflict(actionId, keys, currentSettings);
  if (conflict) {
    errorByActionId.set(actionId, `Conflicts with "${conflict.label}"`);
    cancelRecording();
    return;
  }
  const action = ALL_ACTIONS.find((a) => a.id === actionId);
  const next: StoredSettings = {
    version: 1,
    bindings: { ...currentSettings.bindings },
  };
  if (action && keys === action.defaultBinding) {
    delete next.bindings[actionId];
  } else {
    next.bindings[actionId] = keys;
  }
  cancelRecording();
  try {
    await saveSettings(next);
  } catch (err) {
    console.error(LOG_PREFIX, "save failed", err);
    errorByActionId.set(actionId, "Failed to save");
    render();
  }
}

function onRecordKeydown(event: KeyboardEvent): void {
  if (!recordingActionId) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancelRecording();
    return;
  }
  if (MODIFIER_KEYS.has(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  recordedSteps.push(canonicalKey(event));
  render();
  if (recordTimer !== null) clearTimeout(recordTimer);
  recordTimer = setTimeout(() => {
    void commitRecording();
  }, RECORD_TIMEOUT_MS);
}

async function resetAction(actionId: string): Promise<void> {
  const next: StoredSettings = {
    version: 1,
    bindings: { ...currentSettings.bindings },
  };
  delete next.bindings[actionId];
  errorByActionId.delete(actionId);
  await saveSettings(next);
}

export async function restoreDefaults(): Promise<void> {
  const ok = window.confirm(
    "Restore all default shortcuts? This clears every customization.",
  );
  if (!ok) return;
  errorByActionId.clear();
  await saveSettings({ version: 1, bindings: {} });
}

function render(): void {
  if (!mountRoot) return;
  mountRoot.replaceChildren();

  for (const scope of SCOPE_ORDER) {
    const actions = actionsForScope(scope);
    if (actions.length === 0) continue;

    const section = document.createElement("section");
    section.className = "scope-section";

    const heading = document.createElement("h3");
    heading.textContent = SCOPE_LABELS[scope];
    section.appendChild(heading);

    for (const action of actions) {
      section.appendChild(renderRow(action));
    }
    mountRoot.appendChild(section);
  }
}

function renderRow(action: Action): HTMLElement {
  const row = document.createElement("div");
  row.className = "binding-row";
  row.dataset.actionId = action.id;

  const label = document.createElement("span");
  label.className = "binding-label";
  label.textContent = action.label;
  row.appendChild(label);

  const controls = document.createElement("div");
  controls.className = "binding-controls";
  const isRecording = recordingActionId === action.id;
  const isOverride = Object.prototype.hasOwnProperty.call(
    currentSettings.bindings,
    action.id,
  );

  if (isRecording) {
    const status = document.createElement("span");
    status.className = "chip chip--recording";
    status.textContent =
      recordedSteps.length > 0
        ? displayKeys(recordedSteps.join(" "))
        : "Press shortcut…";
    controls.appendChild(status);

    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "Esc to cancel";
    controls.appendChild(hint);
  } else {
    const chip = document.createElement("span");
    chip.className = "chip" + (isOverride ? " chip--override" : "");
    chip.textContent = displayKeys(effectiveBinding(action, currentSettings));
    controls.appendChild(chip);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startRecording(action.id));
    controls.appendChild(editBtn);

    if (isOverride) {
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "reset";
      resetBtn.textContent = "Reset";
      resetBtn.addEventListener("click", () => {
        void resetAction(action.id);
      });
      controls.appendChild(resetBtn);
    }
  }

  const error = errorByActionId.get(action.id);
  if (error) {
    const err = document.createElement("span");
    err.className = "binding-error";
    err.textContent = error;
    controls.appendChild(err);
  }

  row.appendChild(controls);
  return row;
}

export async function mountBindingsUI(root: HTMLElement): Promise<void> {
  mountRoot = root;
  currentSettings = await loadSettings();
  render();
  subscribeSettings((next) => {
    currentSettings = next;
    render();
  });
}

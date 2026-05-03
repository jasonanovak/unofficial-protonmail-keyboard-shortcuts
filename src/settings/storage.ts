// Settings storage adapter — see DESIGN.md §3.7.
//
// Wraps browser.storage.local with a typed schema, default merging, a
// migrate() hook for future schema versions, and a subscription helper.
// Multiple tabs can race on first-read; migrations are deterministic so
// concurrent writes converge (the JSON-equality check skips no-op writes).

import browser from "webextension-polyfill";
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  type StoredSettings,
} from "./schema.js";

/**
 * Convert a stored value (possibly from an older schema version) into the
 * current StoredSettings shape. v1 is the only version today; future
 * versions branch on the `version` field.
 */
export function migrate(stored: unknown): StoredSettings {
  if (typeof stored !== "object" || stored === null) {
    return { ...DEFAULT_SETTINGS };
  }
  const s = stored as Partial<StoredSettings>;
  return {
    version: 1,
    bindings: { ...DEFAULT_SETTINGS.bindings, ...(s.bindings ?? {}) },
  };
}

export async function loadSettings(): Promise<StoredSettings> {
  const all = await browser.storage.local.get(STORAGE_KEY);
  const raw = all[STORAGE_KEY];
  if (raw === undefined) {
    await browser.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
    return { ...DEFAULT_SETTINGS };
  }
  const migrated = migrate(raw);
  if (JSON.stringify(migrated) !== JSON.stringify(raw)) {
    await browser.storage.local.set({ [STORAGE_KEY]: migrated });
  }
  return migrated;
}

export async function saveSettings(settings: StoredSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

export function subscribeSettings(
  cb: (next: StoredSettings) => void,
): () => void {
  const listener = (
    changes: Record<string, browser.Storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== "local") return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    cb(migrate(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

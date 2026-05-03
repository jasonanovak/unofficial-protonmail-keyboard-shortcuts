// Settings schema — see DESIGN.md §3.7.
//
// Phase 1: minimal { version, bindings } shape. The full storage adapter
// (defaults merging, migrate hook, change-event propagation as a typed API)
// lands in Phase 3 — see TODO.md "Implement Settings storage adapter".

export type StoredSettings = {
  version: 1;
  bindings: Record<string, string>;
};

export const STORAGE_KEY = "settings";

export const DEFAULT_SETTINGS: StoredSettings = {
  version: 1,
  bindings: {},
};

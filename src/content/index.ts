// Content script entry — see DESIGN.md §3.2.
//
// Runs in the top frame AND in same-origin iframes (manifest sets
// all_frames: true) so compose-scope shortcuts can fire from inside the
// rooster editor. The Selector Probe and message listener for the Options
// page only run in the top frame to avoid duplicate diagnostics.

import browser from "webextension-polyfill";
import { startScopeDetector, type Scope } from "./scope-detector.js";
import { KeybindingEngine, type Binding } from "./engine.js";
import { ActionRegistry, type Action } from "./registry.js";
import { ALL_ACTIONS } from "./actions.js";
import { runProbe, getLatestProbe } from "./probe.js";
import { loadSettings, subscribeSettings } from "../settings/storage.js";
import type { StoredSettings } from "../settings/schema.js";

const LOG_PREFIX = "[upmks]";
const SINGLETON_FLAG = "__upmksContentBooted__" as const;

declare global {
  interface Window {
    [SINGLETON_FLAG]?: true;
  }
}

function effectiveBindings(
  actions: Action[],
  settings: StoredSettings,
): Binding[] {
  return actions.map((a) => ({
    actionId: a.id,
    scopes: a.scopes,
    keys: settings.bindings[a.id] ?? a.defaultBinding,
  }));
}

async function main() {
  if (window[SINGLETON_FLAG]) {
    console.debug(LOG_PREFIX, "already booted; skipping");
    return;
  }
  window[SINGLETON_FLAG] = true;

  const isTopFrame = window === window.top;

  const settings = await loadSettings();
  console.info(LOG_PREFIX, isTopFrame ? "[top]" : "[frame]", "loaded settings", settings);

  const registry = new ActionRegistry();
  registry.registerAll(ALL_ACTIONS);

  const engine = new KeybindingEngine({
    dispatch: (id) => {
      console.debug(LOG_PREFIX, "dispatch", id);
      registry.dispatch(id);
    },
  });
  engine.setBindings(effectiveBindings(registry.all(), settings));

  subscribeSettings((next) => {
    console.info(LOG_PREFIX, "settings changed; re-binding");
    engine.setBindings(effectiveBindings(registry.all(), next));
  });

  startScopeDetector((scope: Scope) => {
    console.info(LOG_PREFIX, "scope →", scope);
    engine.setScope(scope);
    if (isTopFrame) runProbe();
  });

  if (isTopFrame) {
    runProbe();
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: string }).type === "getProbeResult"
      ) {
        return Promise.resolve(getLatestProbe());
      }
      return undefined;
    });
  }
}

main().catch((err) => {
  console.error(LOG_PREFIX, "boot failed", err);
});

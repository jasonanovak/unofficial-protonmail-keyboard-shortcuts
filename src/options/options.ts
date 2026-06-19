// Options page entry — see DESIGN.md §3.8.
//
// The bindings UI itself lives in `bindings-ui.ts` so the toolbar popup can
// reuse the same render/edit/save logic. This file owns options-tab-only
// chrome: the version label, the diagnostics probe, and wiring up the
// external "Restore defaults" button.

import browser from "webextension-polyfill";
import { mountBindingsUI, restoreDefaults } from "./bindings-ui.js";

const LOG_PREFIX = "[upmks/options]";

async function setVersionLabel(): Promise<void> {
  const manifest = browser.runtime.getManifest();
  const versionEl = document.getElementById("version");
  if (versionEl && manifest.version) {
    versionEl.textContent = manifest.version;
  }
}

type ProbeResult = {
  results: Record<string, "ok" | "missing">;
  ranAt: number;
};

async function fetchProbe(): Promise<ProbeResult | null> {
  const tabs = await browser.tabs.query({ url: "https://mail.proton.me/*" });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return null;
  try {
    return (await browser.tabs.sendMessage(tabId, {
      type: "getProbeResult",
    })) as ProbeResult | null;
  } catch {
    return null;
  }
}

async function renderProbe(): Promise<void> {
  const diag = document.getElementById("diagnostics");
  if (!diag) return;
  const probe = await fetchProbe();
  if (!probe) {
    diag.hidden = true;
    return;
  }
  const failed = Object.entries(probe.results)
    .filter(([, v]) => v === "missing")
    .map(([k]) => k);
  if (failed.length === 0) {
    diag.hidden = true;
    return;
  }
  diag.hidden = false;
  diag.textContent =
    `Selectors not resolving in your open Proton tab: ${failed.join(", ")}. ` +
    "Proton may have shipped a UI change; the selector module needs an update.";
}

async function main(): Promise<void> {
  await setVersionLabel();

  const root = document.getElementById("bindings-root");
  if (root) await mountBindingsUI(root);

  await renderProbe();

  const restoreBtn = document.getElementById("restore-defaults");
  if (restoreBtn) {
    restoreBtn.addEventListener("click", () => {
      void restoreDefaults();
    });
  }
}

main().catch((err) => {
  console.error(LOG_PREFIX, "boot failed", err);
});

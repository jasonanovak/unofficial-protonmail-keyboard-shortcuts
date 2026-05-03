// Options page entry — see DESIGN.md §3.8.
//
// Phase 1: read-only render of whatever bindings the storage adapter currently
// returns (empty in P1; populated once actions land in P2/P3). Edit-in-place
// rebinding lands in Phase 4.

import browser from "webextension-polyfill";
import { loadSettings, subscribeSettings } from "../settings/storage.js";
import type { StoredSettings } from "../settings/schema.js";

type Scope = "global" | "list" | "reading" | "composing";

const SCOPE_ORDER: Scope[] = ["global", "list", "reading", "composing"];
const SCOPE_LABELS: Record<Scope, string> = {
  global: "Global",
  list: "Message list",
  reading: "Reading a message",
  composing: "Composing",
};

function render(settings: StoredSettings) {
  const root = document.getElementById("bindings-root");
  if (!root) return;
  root.replaceChildren();

  const hasAny = Object.keys(settings.bindings).length > 0;
  if (!hasAny) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent =
      "No actions registered yet. Once shortcuts ship, they'll appear here grouped by scope.";
    root.appendChild(empty);
    return;
  }

  for (const scope of SCOPE_ORDER) {
    const section = document.createElement("section");
    section.className = "scope-section";

    const heading = document.createElement("h3");
    heading.textContent = SCOPE_LABELS[scope];
    section.appendChild(heading);

    // Phase 1: scope filtering depends on the Action Registry (P2). For now,
    // we just show every stored binding under "Global" and leave other
    // sections empty so the layout is visible.
    if (scope === "global") {
      for (const [actionId, keys] of Object.entries(settings.bindings)) {
        const row = document.createElement("div");
        row.className = "binding-row";

        const label = document.createElement("span");
        label.textContent = actionId;
        row.appendChild(label);

        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = keys;
        row.appendChild(chip);

        section.appendChild(row);
      }
    } else {
      const placeholder = document.createElement("p");
      placeholder.className = "placeholder";
      placeholder.textContent = "—";
      section.appendChild(placeholder);
    }

    root.appendChild(section);
  }
}

async function setVersionLabel() {
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
  // Find an open Proton Mail tab and ask its content script for the latest
  // selector probe result. host_permissions for mail.proton.me is what makes
  // tabs.query and tabs.sendMessage work without the broader "tabs" permission.
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

async function renderProbe() {
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

async function main() {
  await setVersionLabel();
  render(await loadSettings());
  await renderProbe();

  subscribeSettings(render);
}

main().catch((err) => {
  console.error("[upmks/options] boot failed", err);
});

// Toolbar popup entry — mounts the same bindings UI used by the options
// page. Popup chrome is intentionally minimal; the diagnostics probe
// and version footer stay on the options tab.

import browser from "webextension-polyfill";
import {
  mountBindingsUI,
  restoreDefaults,
} from "../options/bindings-ui.js";

const LOG_PREFIX = "[upmks/popup]";

async function main(): Promise<void> {
  const versionEl = document.getElementById("version");
  if (versionEl) {
    versionEl.textContent = browser.runtime.getManifest().version;
  }

  const root = document.getElementById("bindings-root");
  if (root) await mountBindingsUI(root);

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

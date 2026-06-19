// Background entry — opens the options page on first install so users
// land directly in shortcut customization without hunting for it.
//
// Triggers only on `reason: "install"` — not on updates, reloads, or
// browser restarts.

import browser from "webextension-polyfill";

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void browser.runtime.openOptionsPage();
  }
});

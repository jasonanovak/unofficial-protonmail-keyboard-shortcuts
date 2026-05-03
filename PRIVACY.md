# Privacy Policy — Unofficial Proton Mail Keyboard Shortcuts Extension

_Last updated: 2026-05-02._

This extension is unofficial and not affiliated with, endorsed by, or supported by Proton AG.

## Summary

The extension does not collect, transmit, sell, share, or otherwise handle any user data outside of the local browser. It makes no network requests of its own.

## What the extension does

The extension layers a customizable keyboard shortcut engine onto the Proton Mail web client at `https://mail.proton.me/`. When you press a configured shortcut while a Proton Mail tab is focused, the extension finds the corresponding UI element on the page and clicks it on your behalf — the same as if you had clicked it with the mouse.

## What the extension reads

To find the right element to click for a given shortcut, the extension reads the public DOM (page structure) of `https://mail.proton.me/` and its same-origin frames (the rooster compose editor, message body iframe). This reading happens **inside your browser**. The content the extension reads — message subjects, sender names, whatever you have on screen — is never written down, transmitted, or stored.

## What the extension stores

A single record under the key `settings` in your browser's local extension storage (`browser.storage.local`). The record contains:

- The schema version (currently `1`).
- A map of action ID to user-customized binding (only the keys you've rebound; defaults aren't stored).

Example:
```json
{ "version": 1, "bindings": { "compose": "b" } }
```

That data stays in your browser. It is not synced to any cloud service, including Proton's. If you want it on another device, you have to set the bindings there yourself.

## Permissions the extension requests, and why

| Permission | What it allows | Why we need it |
|------------|----------------|----------------|
| `storage` | Read/write `browser.storage.local`. | Persist your customized bindings. |
| `host_permissions: ["https://mail.proton.me/*"]` | Run a content script on Proton Mail. | The shortcut engine has to be inside the page to read keystrokes and find UI elements. |

We deliberately do **not** request the broader `tabs` permission, the `<all_urls>` host permission, or any storage/network permissions beyond what's listed.

## What the extension does not do

- No telemetry. No analytics.
- No remote configuration. No update channel beyond your browser's normal extension auto-update.
- No third-party scripts at runtime. The bundled JavaScript is a small TypeScript build plus the [`hotkeys-js`](https://github.com/jaywcjlove/hotkeys) library, both committed to the project's source repository.
- No requests to Proton, to us, or to any third party. The extension never opens a network connection of its own.

## Open source

The full source is published under the MIT license at <https://github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts>. Anyone can read every line that runs in their browser.

## Contact

Privacy questions or concerns: file an issue at <https://github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts/issues>.

## Changes to this policy

If the extension's data behavior changes, this file will be updated and the change recorded in git history. Material changes will also be noted in the GitHub releases section.

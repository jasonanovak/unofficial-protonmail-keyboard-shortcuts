# Store Listing Copy — drafts

Drafts of the copy needed to submit the extension to the Chrome Web Store and Firefox AMO. All wording is constrained by the PRD branding rule: never imply that the extension is official.

## Listing title

**`Unofficial Proton Mail Keyboard Shortcuts Extension`** (51 chars)

The full PRD-mandated name. Use it as the visible store listing title even though the manifest's `name` field is shortened to `Unofficial Proton Mail Keyboard Shortcuts` to fit AMO's 45-char manifest cap.

## Short summary

> Customizable keyboard shortcuts for the Proton Mail web client. Unofficial — not affiliated with Proton AG.

(110 chars; fits Chrome's 132-char and AMO's 250-char short summary limits.)

## Long description

> **Unofficial** — this extension is not affiliated with, endorsed by, or supported by Proton AG.
>
> Proton Mail has built-in keyboard shortcuts, but they have two problems this extension solves:
>
> 1. They behave differently depending on which part of the page has focus. Pressing `r` does one thing in the message list, another in a reading pane, and nothing at all if the wrong element is focused.
> 2. They aren't user-customizable.
>
> This extension layers a consistent, fully-customizable shortcut engine onto the Proton Mail web client at mail.proton.me. Every shortcut works the same regardless of which element is focused, and you can rebind any of them via the extension's Options page.
>
> ## What you get out of the box
>
> Defaults match Proton's documented shortcuts so existing users feel at home:
>
> **Anywhere in mail.proton.me**
> • `n` — Compose new message
> • `g i` / `g d` / `g e` / `g a` / `g s` / `g t` / `g *` / `g m` — Inbox / Drafts / Sent / Archive / Spam / Trash / Starred / All Mail
>
> **Message list**
> • `r` / `u` — Mark as read / unread
> • `t` / `s` / `a` / `i` — Move to Trash / Spam / Archive / Inbox
> • `*` — Toggle star
> • `↑` / `↓` — Move keyboard focus through the list
> • `x` — Toggle selection on the focused row
> • `Enter` — Open the focused message
> • `Ctrl+A` (Cmd+A on Mac) — Select all
>
> **Reading a message**
> • `r` / `Shift+R` — Reply / Reply all
> • `Shift+F` — Forward
> • `u` / `t` / `s` / `a` / `i` / `*` — Mark unread / Trash / Spam / Archive / Inbox / Star
> • `j` / `k` — Next / previous message
>
> **Composing**
> • `Esc` — Close composer
> • `Ctrl+Enter` (Cmd+Enter) — Send
> • `Ctrl+K` (Cmd+K) — Insert link
>
> Every binding above can be customized in the Options page. Rebinds take effect immediately — no tab reload.
>
> ## Privacy
>
> The extension does not collect, transmit, sell, or share any user data.
>
> • Runs only on `https://mail.proton.me/*`.
> • Stores your customized bindings locally in your browser. Nothing is synced or uploaded.
> • Makes zero network requests of its own. No telemetry, no analytics, no remote configuration.
> • Requests only the `storage` permission and host access to mail.proton.me. Does not request the broader `tabs` permission.
>
> Full privacy policy: https://github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts/blob/main/PRIVACY.md
>
> ## Setup
>
> 1. Install the extension.
> 2. Open Proton Mail and **disable Proton's own keyboard shortcuts** in *Settings → General → Keyboard shortcuts*. The extension is the sole shortcut handler; leaving Proton's natives on causes double-fire.
> 3. (Optional) Visit the extension's Options page to customize bindings.
>
> ## Open source
>
> Full source under the MIT license: https://github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts
>
> Issues, suggestions, and contributions are welcome at the GitHub repo.

## Category / tags

- **Chrome Web Store category:** Productivity.
- **AMO category:** Productivity (or "Other" if Productivity isn't allowed for mail-targeting extensions).
- **Tags:** `proton`, `proton mail`, `keyboard shortcuts`, `productivity`, `email`.

## Required URLs

- **Homepage:** `https://github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts`
- **Support / issues:** `https://github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts/issues`
- **Privacy policy:** `https://github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts/blob/main/PRIVACY.md`

## Single-purpose declaration (Chrome Web Store)

> The single purpose of this extension is to provide customizable keyboard shortcuts for the Proton Mail web client at mail.proton.me.

## Permissions justification (Chrome Web Store)

- **`storage`:** to persist user-customized keyboard binding preferences locally in the browser.
- **`host_permissions: ["https://mail.proton.me/*"]`:** the content script must run on the Proton Mail web client to capture keystrokes and dispatch them as clicks on Proton Mail UI elements. This is the extension's core function and the only site it operates on.

(No remote-code permission needed — the extension does not load remote code.)

## AMO-specific notes

- **Self-hosted vs. listed:** AMO listing requires reviewer approval (~1–7 days). Self-hosting via signed `.xpi` is faster but harder to discover.
- **Source code submission:** AMO requires the source code if a build/minify step is involved. Provide the link to the GitHub repo and reference the commit hash that matches the submitted `.xpi`.
- **Reviewer notes (paste into the AMO submission form):**
  > Build instructions: `npm install && npm run build:firefox`. Output is `dist/firefox/`. Source repository: github.com/jasonanovak/unofficial-protonmail-keyboard-shortcuts at the commit hash matching this submission's version.
  >
  > Bundled dependencies: `hotkeys-js` (MIT) and `webextension-polyfill` (MPL-2.0), both pulled from npm at build time and bundled into `content.js` and `options.js`. No remote code is loaded at runtime.
  >
  > The extension reads the public DOM of mail.proton.me to dispatch keyboard shortcuts as clicks. It transmits no data and stores only user-customized binding preferences in browser.storage.local.
  >
  > To test: install on Firefox 109+, open mail.proton.me, sign in, disable Proton's own shortcuts in Settings → General → Keyboard shortcuts, then try `n` (compose), `g i` (go to inbox), `r` (reply when reading a message), etc. See README.md for the full default binding list.

## Chrome Web Store-specific notes

- **Developer fee:** $5 one-time for a Chrome Web Store developer account.
- **Single purpose:** declared above.
- **Permissions:** declared above.
- **Privacy practices form:** answer "No, the extension does not collect or use any user data" — backed by PRIVACY.md.

## Open follow-ups

- Screenshots (1280×800 minimum, both stores prefer 1280×800):
  - Options page with default bindings visible.
  - Options page in record mode (showing "Press shortcut..." chip) — demonstrates customization.
  - Compose / reading / list views — purely cosmetic; the shortcut work is invisible in static screenshots.
- Promotional images (Chrome Web Store, optional but recommended):
  - 440×280 small tile.
  - 920×680 marquee.
- Final `web-ext build` (Firefox) and `zip` (Chrome) of `dist/<target>/` for upload.

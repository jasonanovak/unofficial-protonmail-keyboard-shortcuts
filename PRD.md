Unofficial Proton Mail Keyboard Shortcuts Extension
Product Requirements Document

# Goal

The Proton Mail web client has support for keyboard shortcuts but I find them limited in several dimensions:
- They behave differently depending on which part of a window has focus;
- A user can't customize them

The goal of this project is to build a web browser extension that will work on either Firefox or Chrome that will allow a user to:
1. Use keyboard shortcuts to control the Proton Mail web client
2. Let the user customize those keyboard shortcuts (some shortcuts may not be customizable)

## References

Proton Mail's native keyboard shortcuts are defined here: https://proton.me/support/keyboard-shortcuts

The directory ../WebClients/applications/mail contains the code for Proton Mail's web client.

## Architecture

The directory ../hotkeys-js contains the code for HotKeys.js, an input capture library that should be used for purposes of capturing the keyboard input.

## CUJs

For purposes of these CUJs a keyboard shortcut, a key, "use the keyboard", "use a keyboard shortcut" are all used interchangably and can either be: 
 - a single key press, e.g. "a" 
 - a combination of key presses at the same time, e.g. Shift + R
 - or a key sequence in a short timeframe, e.g. g then i

When a user is in the message list:
 - They should be able to select messages and mark them as read / unread, delete them, or star them using the keyboard.

When a user is reading a message
 - They should be able to use a keyboard shortcut to reply, reply all, forward, mark the message unread, or delete the message. 
 - They should be able to use the keyboard to go to the previous or next message. 
   - If there's no previous or next message, the view should stay on the message.

When a user is composing a message
 - They should be able to use a keyboard shorcut to close the compose window.
 - They should be able to use a keyboard shorcut to send the message
 - They should be able to use a keyboard shorcut to insert a link

In all views a user should be able to use a keyboard shortcut to:
 - Switch folders;
 - Start composing a message

## Branding

The extension should be called the "Unofficial Proton Mail Keyboard Shortcuts Extension". 
There should be no references suggesting that the extension is official.
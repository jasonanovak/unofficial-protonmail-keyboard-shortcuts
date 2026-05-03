// Shared key-syntax helpers used by the engine (matching events to
// bindings) and the Options page (recording new bindings). Both must
// produce the same string format for the same keystroke, otherwise a
// recorded binding wouldn't match when the user actually presses it.
//
// The format mirrors hotkeys-js: lowercase main key, modifiers prefixed
// with "shift+" / "ctrl+" / "alt+" / "command+" in that order. Letter and
// digit keys use event.code (location-based) so layouts where shifted
// digits produce different characters still match.

export const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return !(target as HTMLInputElement).readOnly;
  }
  return false;
}

export function canonicalKey(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.shiftKey) parts.push("shift");
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.metaKey) parts.push("command");

  // Proton's `useBubbleIframeEvents` re-dispatches synthesized KeyboardEvents
  // into the parent and doesn't set `code` on them, so guard against undefined.
  const code = event.code ?? "";
  let main: string;
  if (code.startsWith("Key")) {
    main = code.slice(3).toLowerCase();
  } else if (code.startsWith("Digit")) {
    main = code.slice(5);
  } else {
    main = (event.key ?? "").toLowerCase();
  }
  parts.push(main);
  return parts.join("+");
}

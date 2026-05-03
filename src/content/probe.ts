// Selector Probe — see DESIGN.md §3.6.
//
// On boot and after each navigation, run a small set of "should always be
// present" selectors and surface failures via console.warn and a diagnostics
// channel that the Options page can poll. This is the early-warning system
// for Proton DOM changes — when these probes fail, the selector module
// (selectors.ts) is the file that needs updating.
//
// Action-specific selectors are deliberately NOT probed here: many of them
// only appear when context is right (e.g., trash button only shows when
// messages are selected). Those selectors warn at dispatch time instead.

import { composeButton, inboxLink } from "./selectors.js";

export type ProbeStatus = "ok" | "missing";

export type ProbeResult = {
  results: Record<string, ProbeStatus>;
  ranAt: number;
};

const ALWAYS_PRESENT: ReadonlyArray<readonly [string, () => HTMLElement | null]> = [
  ["composeButton", composeButton],
  ["inboxLink", inboxLink],
];

let latest: ProbeResult | null = null;

export function runProbe(): ProbeResult {
  const results: Record<string, ProbeStatus> = {};
  const failed: string[] = [];
  for (const [name, fn] of ALWAYS_PRESENT) {
    const found = fn() != null;
    results[name] = found ? "ok" : "missing";
    if (!found) failed.push(name);
  }
  if (failed.length > 0) {
    console.warn("[upmks] selector probe missing elements:", failed);
  }
  latest = { results, ranAt: Date.now() };
  return latest;
}

export function getLatestProbe(): ProbeResult | null {
  return latest;
}

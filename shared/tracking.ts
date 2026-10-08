import type { ActivityKind, Child } from "./types.js";

export function trackerEnabled(
  child: Pick<Child, "settings"> | undefined,
  kind: ActivityKind,
): boolean {
  const tracker = kind === "wake" || kind === "skipped_nap" ? "sleep" : kind;
  return child?.settings.visibleTrackers.includes(tracker) ?? false;
}

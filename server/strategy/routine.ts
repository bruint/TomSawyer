import type { SleepContext } from "./context.js";

export function ageProfile(months: number) {
  if (months < 2) return { naps: 5, windows: [60, 60, 60, 60, 60, 60] };
  if (months < 4) return { naps: 4, windows: [80, 90, 90, 100, 100] };
  if (months < 6) return { naps: 3, windows: [120, 135, 150, 150] };
  if (months < 9) return { naps: 3, windows: [150, 165, 180, 180] };
  if (months < 14) return { naps: 2, windows: [180, 210, 240] };
  if (months < 30) return { naps: 1, windows: [300, 300] };
  return { naps: 0, windows: [360] };
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function routineFor(context: SleepContext) {
  const { ageMonths, recentNapCounts, child } = context;
  const profile = ageProfile(ageMonths);
  const counts =
    ageMonths < 3
      ? [4, 5]
      : ageMonths < 6
        ? [3, 4]
        : ageMonths < 14
          ? [2, 3]
          : ageMonths < 24
            ? [1, 2]
            : [0, 1];
  const historicalCount =
    recentNapCounts.length >= 3 ? median(recentNapCounts) : null;
  if (historicalCount !== null) {
    counts.push(Math.floor(historicalCount), Math.ceil(historicalCount));
  }
  // After a late or long nap, an earlier night with no further nap can be a
  // useful option even when the day ends below the usual age-based count.
  if (context.consumedNaps > 0 && context.consumedNaps < Math.min(...counts)) {
    const window = wakeWindow(
      wakeWindowsFor(context, context.consumedNaps),
      context.consumedNaps,
      context.active ? context.activeMinutes : context.lastNapMinutes,
    );
    const bed = (context.active ? context.now : context.awakeSince).plus({
      minutes: window,
    });
    if (
      bed >= context.usualBed.minus({ hours: 2 }) &&
      bed <= context.latestBed
    ) {
      counts.push(context.consumedNaps);
    }
  }
  counts.push(Math.max(profile.naps, Math.min(6, context.consumedNaps)));
  if (child.settings.napCount !== null) counts.push(child.settings.napCount);
  return {
    counts: [...new Set(counts)].sort((a, b) => a - b),
    preferredCount: historicalCount ?? profile.naps,
    historicalCount,
  };
}

export function wakeWindowsFor(context: SleepContext, count: number) {
  if (context.child.settings.wakeWindows.length)
    return context.child.settings.wakeWindows;
  const { ageMonths } = context;
  const profile = ageProfile(ageMonths);
  if (count === profile.naps) return profile.windows;
  // A lower-count evening option must not stretch a young baby's wake window
  // to the defaults used for an older child on that routine.
  if ((ageMonths < 6 && count < 3) || (ageMonths < 14 && count === 1))
    return profile.windows;
  // Alternate counts need their own wake windows. Adding a fourth nap while
  // retaining three-nap windows would merely push the same day past bedtime.
  if (count >= 5) return [70, 80, 85, 90, 90, 90, 90];
  if (count === 4) return [90, 105, 120, 120, 135];
  if (count === 3)
    return ageMonths < 4 ? [105, 120, 135, 135] : [150, 165, 180, 180];
  if (count === 2) return [180, 210, 240];
  if (count === 1) return [300, 300];
  return [360];
}

export function wakeWindow(
  windows: number[],
  index: number,
  napMinutes: number | null,
) {
  const window = windows[Math.min(index, windows.length - 1)];
  return napMinutes !== null && napMinutes < 40
    ? Math.max(45, window - 20)
    : window;
}

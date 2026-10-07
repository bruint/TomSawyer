import { DateTime } from "luxon";
import type { Child } from "../../shared/types.js";

export const minutesBetween = (end: DateTime, start: DateTime) =>
  Math.round(end.diff(start, "minutes").minutes);
export const iso = (time: DateTime) => time.toUTC().toISO()!;
export const later = (a: DateTime, b: DateTime) => (a > b ? a : b);

export function atLocal(day: DateTime, hhmm: string) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

export function dayBoundary(child: Child, now: DateTime) {
  const local = now.setZone(child.timezone);
  const start = atLocal(local, child.settings.dayStart);
  return local < start ? start.minus({ days: 1 }) : start;
}

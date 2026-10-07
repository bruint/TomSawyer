import { DateTime } from "luxon";
import { elapsedMs, type Activity, type Child } from "../../shared/types";
export function duration(minutes: number) {
  if (minutes <= 0) return "0m";
  if (minutes < 1) return "<1m";
  const h = Math.floor(minutes / 60),
    m = Math.round(minutes % 60);
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}
export const time = (iso: string | null | undefined, zone: string) =>
  iso
    ? DateTime.fromISO(iso).setZone(zone).toFormat("h:mm a").toLowerCase()
    : "—";
export function timeRange(start: string, end: string, zone: string) {
  const first = time(start, zone),
    last = time(end, zone);
  const samePeriod = first.slice(-2) === last.slice(-2);
  return `${samePeriod ? first.replace(/ [ap]m$/, "") : first}–${last}`;
}
export function relative(iso: string | null | undefined) {
  if (!iso) return "Not logged yet";
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  return mins < 1 ? "Just now" : `${duration(mins)} ago`;
}
export function age(child: Child) {
  const a = DateTime.now().diff(
    DateTime.fromISO(child.birthDate),
    "months",
  ).months;
  if (a < 0) return "On the way";
  if (a < 1) return `${Math.max(0, Math.floor(a * 30.44))} days old`;
  if (a >= 24) return `${Math.floor(a / 12)} years old`;
  return `${Math.floor(a)} months old`;
}
export function describe(a: Activity) {
  const d = a.details;
  switch (a.kind) {
    case "sleep":
      return `${d.sleepType === "night" ? "Night sleep" : "Nap"}${a.endedAt ? " · " + duration(elapsedMs(a) / 60000) : ""}`;
    case "nursing":
      return `${d.side || "Both sides"}${a.endedAt ? " · " + duration(elapsedMs(a) / 60000) : d.leftMinutes || d.rightMinutes ? " · " + duration(Number(d.leftMinutes || 0) + Number(d.rightMinutes || 0)) : ""}`;
    case "bottle":
      return `${d.amount || "—"} ${d.unit || "ml"} · ${d.milkType || "Milk"}`;
    case "pumping":
      return `${d.amount || "—"} ${d.unit || "ml"}${a.endedAt ? " · " + duration(elapsedMs(a) / 60000) : ""}`;
    case "diaper":
      return String(d.diaperType || "Wet");
    case "potty":
      return `${d.result || "Attempt"} · ${d.pottyType || "Potty"}`;
    case "solids":
      return `${d.food || "Meal"}${d.reaction ? " · " + d.reaction : ""}`;
    case "medicine":
      return `${d.medicine || "Medicine"} · ${d.dose || ""} ${d.unit || ""}`;
    case "growth":
      return (
        [
          d.weight ? `${d.weight} ${d.weightUnit || "kg"}` : "",
          d.height ? `${d.height} ${d.lengthUnit || "cm"}` : "",
          d.head ? `head ${d.head} ${d.lengthUnit || "cm"}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Measurement"
      );
    case "temperature":
      return `${d.temperature || "—"} °${d.unit || "C"}`;
    case "activity":
      return `${d.activityType || "Activity"}${a.endedAt ? " · " + duration(elapsedMs(a) / 60000) : d.durationMinutes ? " · " + duration(Number(d.durationMinutes)) : ""}`;
    case "milestone":
      return String(d.title || "Milestone");
    case "contraction":
      return `${a.endedAt ? Math.round(elapsedMs(a) / 1000) + " seconds" : "Timing"} · ${d.intensity || "Not rated"}`;
    case "wake":
      return "Up for the day";
    case "skipped_nap":
      return "Missed nap";
    default:
      return a.notes || "Note";
  }
}

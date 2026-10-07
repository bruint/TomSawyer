import { DateTime } from "luxon";
import type {
  Activity,
  Child,
  Reminder,
  SleepAlertPreferences,
} from "../shared/types.js";
import { atLocal, buildStrategy } from "./strategy.js";

export interface NotificationJob {
  key: string;
  at: DateTime;
  title: string;
  body: string;
  url: string;
  alert?: keyof SleepAlertPreferences;
}

export function reminderDue(
  reminder: Reminder,
  child: Child,
  events: Activity[],
  now: DateTime,
): { key: string; at: DateTime } | null {
  const local = now.setZone(child.timezone);
  if (!reminder.enabled || !reminder.weekdays.includes(local.weekday))
    return null;
  if (
    reminder.daytimeOnly &&
    (local < atLocal(local, child.settings.wakeTime) ||
      local > atLocal(local, child.settings.bedtime))
  )
    return null;
  if (reminder.mode === "clock") {
    return {
      key: `reminder:${reminder.id}:${local.toISODate()}`,
      at: atLocal(local, reminder.atTime),
    };
  }
  const last = events
    .filter((a) => a.kind === reminder.kind)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!last) return null;
  return {
    key: `reminder:${reminder.id}:${last.id}:${last.startedAt}`,
    at: DateTime.fromISO(last.startedAt).plus({
      minutes: reminder.intervalMinutes,
    }),
  };
}

function sleepJobs(
  child: Child,
  events: Activity[],
  now: DateTime,
): NotificationJob[] {
  const plan = buildStrategy(child, events, now.toJSDate(), {
    rollForward: false,
  });
  if (
    !plan.windDownAt ||
    !plan.windowStart ||
    !plan.windowEnd ||
    !plan.awakeSince ||
    plan.status === "sleeping" ||
    plan.reasons.some((r) => r.code === "missing-wake")
  )
    return [];

  const skipped = events
    .filter(
      (a) =>
        a.kind === "skipped_nap" &&
        Date.parse(a.startedAt) >= Date.parse(plan.awakeSince!) &&
        Date.parse(a.startedAt) <= now.toMillis(),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  // One alert of each kind per awake period. Note edits do not create another alarm.
  const cycle = `${child.id}:${plan.day}:${plan.awakeSince}:${skipped ? `${skipped.id}:${skipped.startedAt}` : ""}`;
  const start = DateTime.fromISO(plan.windowStart).setZone(child.timezone);
  const end = DateTime.fromISO(plan.windowEnd).setZone(child.timezone);
  const window = `${start.toFormat("h:mm a")}–${end.toFormat("h:mm a")}`;
  const url = `/?child=${child.id}&view=strategy`;
  return [
    {
      key: `sleep:${cycle}:wind-down`,
      alert: "windDown",
      at: DateTime.fromISO(plan.windDownAt),
      title: `${child.name} · time to wind down`,
      body: `Suggested sleep window: ${window}.`,
      url,
    },
    {
      key: `sleep:${cycle}:sleep-window`,
      alert: "sleepWindow",
      at: start,
      title: `${child.name} · sleep window opens`,
      body: `Suggested sleep window: ${window}. Open the updated plan.`,
      url,
    },
  ];
}

export function notificationJobs(
  child: Child,
  events: Activity[],
  reminders: Reminder[],
  now: DateTime,
): NotificationJob[] {
  const jobs = sleepJobs(child, events, now);
  for (const reminder of reminders) {
    const due = reminderDue(reminder, child, events, now);
    if (due)
      jobs.push({
        ...due,
        title: `${child.name} · ${reminder.title}`,
        body: "Open TomSawyer to log or review.",
        url: `/?child=${child.id}`,
      });
  }
  return jobs.filter((job) => {
    const delay = now.diff(job.at, "minutes").minutes;
    return delay >= 0 && delay <= 5;
  });
}

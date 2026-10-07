import webpush from "web-push";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { DB, Row } from "./db.js";
import { childFromRow, activitiesFor, reminderFromRow } from "./db.js";
import { atLocal, buildStrategy } from "./strategy.js";
import type { Child, Activity, Reminder } from "../shared/types.js";

export function initPush(db: DB) {
  let keys = db
    .prepare("SELECT value FROM app_config WHERE key='vapid'")
    .get() as Row | undefined;
  if (!keys) {
    const value = JSON.stringify(webpush.generateVAPIDKeys());
    db.prepare("INSERT INTO app_config VALUES (?,?)").run("vapid", value);
    keys = { value };
  }
  const { publicKey, privateKey } = JSON.parse(keys.value);
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    publicKey,
    privateKey,
  );
  return publicKey as string;
}

export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname === "wns2-par02p.notify.windows.com" ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function sendPush(
  db: DB,
  subscription: Row,
  payload: object,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      JSON.parse(subscription.subscription),
      JSON.stringify(payload),
      { TTL: 600, timeout: 10000 },
    );
    return true;
  } catch (e: any) {
    if (e.statusCode === 404 || e.statusCode === 410)
      db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(
        subscription.id,
      );
    else
      console.warn("Push delivery failed", e.statusCode || e.code || "network");
    return false;
  }
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
    const at = atLocal(local, reminder.atTime);
    return { key: `reminder:${reminder.id}:${local.toISODate()}`, at };
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
export function startPushWorker(db: DB) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = DateTime.utc();
      const subscriptions = db
        .prepare(
          "SELECT p.*,u.family_id FROM push_subscriptions p JOIN users u ON u.id=p.user_id",
        )
        .all();
      if (!subscriptions.length) return;
      for (const row of db.prepare("SELECT * FROM children").all()) {
        const child = childFromRow(row);
        const targets = subscriptions.filter(
          (s) => s.family_id === child.familyId,
        );
        if (!targets.length) continue;
        const events = activitiesFor(
          db,
          child.id,
          now.minus({ days: 3 }).toISO()!,
        );
        const strategy = buildStrategy(child, events, now.toJSDate());
        const jobs: {
          key: string;
          at: DateTime;
          title: string;
          body: string;
        }[] = [];
        if (
          strategy.windDownAt &&
          strategy.status !== "sleeping" &&
          !strategy.reasons.some((r) => r.code === "missing-wake")
        ) {
          const anchor = events
            .filter(
              (a) =>
                a.kind === "wake" ||
                a.kind === "sleep" ||
                a.kind === "skipped_nap",
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          jobs.push({
            key: `sleep:${child.id}:${strategy.day}:${anchor?.id}:${anchor?.version}`,
            at: DateTime.fromISO(strategy.windDownAt),
            title: `${child.name} · time to wind down`,
            body: "Your next sleep window is approaching. Open your updated plan.",
          });
        }
        for (const r of db
          .prepare("SELECT * FROM reminders WHERE child_id=? AND enabled=1")
          .all(child.id)) {
          const reminder = reminderFromRow(r);
          const due = reminderDue(reminder, child, events, now);
          if (due)
            jobs.push({
              ...due,
              title: `${child.name} · ${reminder.title}`,
              body: "A reminder you set. Open TomSawyer to log or review.",
            });
        }
        for (const job of jobs) {
          const delay = now.diff(job.at, "minutes").minutes;
          if (delay < 0 || delay > 5) continue;
          for (const target of targets) {
            const key = `${job.key}:${target.id}`;
            if (
              db
                .prepare("SELECT 1 FROM push_deliveries WHERE dedupe_key=?")
                .get(key)
            )
              continue;
            if (
              await sendPush(db, target, {
                title: job.title,
                body: job.body,
                tag: job.key,
                url: `/?child=${child.id}`,
              })
            )
              db.prepare(
                "INSERT OR IGNORE INTO push_deliveries VALUES (?,?)",
              ).run(key, now.toISO()!);
          }
        }
      }
      db.prepare("DELETE FROM push_deliveries WHERE delivered_at<?").run(
        now.minus({ days: 45 }).toISO()!,
      );
    } catch (e) {
      console.error(
        "Notification worker error",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
export const newSubscriptionId = () => randomUUID();

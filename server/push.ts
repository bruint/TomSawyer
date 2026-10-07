import webpush from "web-push";
import { DateTime } from "luxon";
import type { DB, Row } from "./db.js";
import { childFromRow, activitiesFor, reminderFromRow } from "./db.js";
import { STRATEGY_HISTORY_DAYS } from "./strategy.js";
import { notificationJobs } from "./notification-schedule.js";

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
export async function deliverNotifications(
  db: DB,
  now: DateTime = DateTime.utc(),
  deliver = sendPush,
) {
  const subscriptions = db
    .prepare(
      "SELECT p.*,u.family_id,pref.wind_down,pref.sleep_window FROM push_subscriptions p JOIN users u ON u.id=p.user_id LEFT JOIN push_preferences pref ON pref.subscription_id=p.id WHERE u.disabled=0",
    )
    .all();
  if (!subscriptions.length) return;
  for (const row of db.prepare("SELECT * FROM children").all()) {
    const child = childFromRow(row);
    const targets = subscriptions.filter((s) => s.family_id === child.familyId);
    if (!targets.length) continue;
    const events = activitiesFor(
      db,
      child.id,
      now.minus({ days: STRATEGY_HISTORY_DAYS }).toISO()!,
    );
    const reminders = db
      .prepare("SELECT * FROM reminders WHERE child_id=? AND enabled=1")
      .all(child.id)
      .map(reminderFromRow);
    for (const job of notificationJobs(child, events, reminders, now)) {
      for (const target of targets) {
        if (job.alert === "windDown" && !(target.wind_down ?? 1)) continue;
        if (job.alert === "sleepWindow" && !(target.sleep_window ?? 1))
          continue;
        const key = `${job.key}:${target.id}`;
        if (
          db
            .prepare("SELECT 1 FROM push_deliveries WHERE dedupe_key=?")
            .get(key)
        )
          continue;
        if (
          await deliver(db, target, {
            title: job.title,
            body: job.body,
            tag: job.key,
            url: job.url,
          })
        ) {
          db.prepare("INSERT OR IGNORE INTO push_deliveries VALUES (?,?)").run(
            key,
            now.toISO()!,
          );
        }
      }
    }
  }
  db.prepare("DELETE FROM push_deliveries WHERE delivered_at<?").run(
    now.minus({ days: 45 }).toISO()!,
  );
}

export function startPushWorker(db: DB) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await deliverNotifications(db);
    } catch (error) {
      console.error(
        "Notification worker error",
        error instanceof Error ? error.message : "Unknown error",
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

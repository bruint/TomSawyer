import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { reminderFromRow, transaction, type DB } from "../db.js";
import {
  defaultSleepAlerts,
  type PushDeviceState,
} from "../../shared/types.js";
import { sendPush, validPushEndpoint } from "../push.js";
import { reminderSchema } from "../validation.js";

import { getChild } from "../access.js";
import { fail, nowIso, param } from "../http.js";

const alertsSchema = z.object({
  windDown: z.boolean(),
  sleepWindow: z.boolean(),
});

function deviceState(
  db: DB,
  endpoint: string,
  userId: string,
): PushDeviceState {
  const row = db
    .prepare(
      "SELECT p.id, pref.wind_down, pref.sleep_window FROM push_subscriptions p LEFT JOIN push_preferences pref ON pref.subscription_id=p.id WHERE p.endpoint=? AND p.user_id=?",
    )
    .get(endpoint, userId);
  return {
    enabled: !!row,
    alerts: row
      ? {
          windDown: !!(row.wind_down ?? 1),
          sleepWindow: !!(row.sleep_window ?? 1),
        }
      : { ...defaultSleepAlerts },
  };
}

export function createNotificationRouter(db: DB) {
  const router = Router();
  router.get("/children/:childId/reminders", (req, res) => {
    const child = getChild(db, req, res);
    res.json(
      db
        .prepare("SELECT * FROM reminders WHERE child_id=?")
        .all(child.id)
        .map(reminderFromRow),
    );
  });
  router.post("/children/:childId/reminders", (req, res) => {
    const child = getChild(db, req, res);
    const body = reminderSchema.parse(req.body);
    const id = randomUUID();
    db.prepare("INSERT INTO reminders VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      id,
      child.id,
      body.title,
      body.kind,
      body.mode,
      body.atTime,
      body.intervalMinutes,
      JSON.stringify(body.weekdays),
      Number(body.daytimeOnly),
      Number(body.enabled),
    );
    res.status(201).json({ id });
  });
  router.put("/children/:childId/reminders/:reminderId", (req, res) => {
    const child = getChild(db, req, res);
    const body = reminderSchema.parse(req.body);
    const result = db
      .prepare(
        "UPDATE reminders SET title=?,kind=?,mode=?,at_time=?,interval_minutes=?,weekdays=?,daytime_only=?,enabled=? WHERE id=? AND child_id=?",
      )
      .run(
        body.title,
        body.kind,
        body.mode,
        body.atTime,
        body.intervalMinutes,
        JSON.stringify(body.weekdays),
        Number(body.daytimeOnly),
        Number(body.enabled),
        param(req, "reminderId"),
        child.id,
      );
    if (!result.changes) fail(404, "Reminder not found.");
    res.json({ ok: true });
  });
  router.delete("/children/:childId/reminders/:reminderId", (req, res) => {
    const child = getChild(db, req, res);
    db.prepare("DELETE FROM reminders WHERE id=? AND child_id=?").run(
      param(req, "reminderId"),
      child.id,
    );
    res.json({ ok: true });
  });
  router.get("/push/subscription", (req, res) => {
    const { endpoint } = z
      .object({ endpoint: z.string().url() })
      .parse(req.query);
    res.json(deviceState(db, endpoint, res.locals.user.id));
  });
  router.post("/push/subscribe", (req, res) => {
    const { alerts: requestedAlerts, ...subscription } = z
      .object({
        endpoint: z
          .string()
          .url()
          .refine(validPushEndpoint, "Unsupported push service"),
        expirationTime: z.number().nullable().optional(),
        keys: z.object({
          p256dh: z.string().min(40).max(200),
          auth: z.string().min(16).max(100),
        }),
        alerts: alertsSchema.optional(),
      })
      .parse(req.body);
    const alerts =
      requestedAlerts ??
      deviceState(db, subscription.endpoint, res.locals.user.id).alerts;
    transaction(db, () => {
      const saved = db
        .prepare(
          "INSERT INTO push_subscriptions VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription RETURNING id",
        )
        .get(
          randomUUID(),
          res.locals.user.id,
          subscription.endpoint,
          JSON.stringify(subscription),
          nowIso(),
        )!;
      db.prepare(
        "INSERT INTO push_preferences VALUES (?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET wind_down=excluded.wind_down,sleep_window=excluded.sleep_window",
      ).run(saved.id, Number(alerts.windDown), Number(alerts.sleepWindow));
    });
    res.status(201).json({ enabled: true, alerts } satisfies PushDeviceState);
  });
  router.delete("/push/subscribe", (req, res) => {
    const body = z.object({ endpoint: z.string() }).parse(req.body);
    db.prepare(
      "DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?",
    ).run(body.endpoint, res.locals.user.id);
    res.json({ ok: true });
  });
  router.post("/push/test", async (req, res) => {
    const body = z.object({ endpoint: z.string() }).parse(req.body);
    const subscription = db
      .prepare(
        "SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?",
      )
      .get(body.endpoint, res.locals.user.id);
    if (!subscription) fail(400, "Enable notifications on this device first.");
    if (
      !(await sendPush(db, subscription!, {
        title: "TomSawyer test notification",
        body: "TomSawyer notifications are ready on this device.",
        url: "/",
        tag: "test",
      }))
    )
      fail(502, "The push service could not deliver this notification.");
    res.json({ ok: true });
  });

  return router;
}

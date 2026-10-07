import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { reminderFromRow, type DB } from "../db.js";
import { sendPush, validPushEndpoint } from "../push.js";
import { reminderSchema } from "../validation.js";

import { getChild } from "../access.js";
import { fail, nowIso, param } from "../http.js";

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
  router.post("/push/subscribe", (req, res) => {
    const subscription = z
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
      })
      .parse(req.body);
    db.prepare(
      "INSERT INTO push_subscriptions VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription",
    ).run(
      randomUUID(),
      res.locals.user.id,
      subscription.endpoint,
      JSON.stringify(subscription),
      nowIso(),
    );
    res.status(201).json({ ok: true });
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

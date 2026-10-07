import { Router } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { activitiesFor, activityFromRow, transaction, type DB } from "../db.js";
import { activitySchema } from "../validation.js";

import { getActivity, getChild } from "../access.js";
import { insertActivity, validateSleepOverlap } from "../activities.js";
import { fail, nowIso } from "../http.js";
import { removeUnusedPhotos } from "../photos.js";

export function createActivityRouter(db: DB) {
  const router = Router();
  router.get("/children/:childId/activities", (req, res) => {
    const child = getChild(db, req, res);
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .default(30)
      .parse(req.query.days);
    res.json(
      activitiesFor(db, child.id, DateTime.utc().minus({ days }).toISO()!),
    );
  });
  router.post("/children/:childId/activities", (req, res) => {
    const child = getChild(db, req, res);
    const body = activitySchema.parse(req.body);
    const result = transaction(db, () =>
      insertActivity(db, child.id, body, res.locals.user.id),
    );
    res
      .status(result.duplicate ? 200 : 201)
      .json(
        activityFromRow(
          db
            .prepare(
              "SELECT a.*,u.name author_name FROM activities a JOIN users u ON u.id=a.created_by WHERE a.id=?",
            )
            .get(result.id)!,
        ),
      );
  });
  router.put("/activities/:activityId", (req, res) => {
    const existingActivity = getActivity(db, req, res);
    const body = activitySchema.parse(req.body);
    if (existingActivity.state !== "complete")
      fail(409, "Finish the timer before editing this entry.");
    if (body.state !== "complete" || body.version !== existingActivity.version)
      fail(
        409,
        "This entry changed on another device. Refresh before editing.",
      );
    validateSleepOverlap(
      db,
      existingActivity.child_id,
      body,
      existingActivity.id,
    );
    db.prepare(
      "UPDATE activities SET kind=?,started_at=?,ended_at=?,paused_ms=?,details=?,notes=?,version=version+1,updated_at=? WHERE id=?",
    ).run(
      body.kind,
      body.startedAt,
      body.endedAt,
      body.pausedMs,
      JSON.stringify(body.details),
      body.notes,
      nowIso(),
      existingActivity.id,
    );
    const oldPhoto = JSON.parse(String(existingActivity.details)).photoId;
    if (typeof oldPhoto === "string" && oldPhoto !== body.details.photoId)
      removeUnusedPhotos(db, [oldPhoto]);
    res.json({ ok: true });
  });
  router.post("/activities/:activityId/timer", (req, res) => {
    const activity = getActivity(db, req, res);
    const body = z
      .object({
        action: z.enum(["pause", "resume", "stop"]),
        version: z.number().int(),
        at: z.string().datetime({ offset: true }).optional(),
      })
      .parse(req.body);
    if (activity.version !== body.version || activity.state === "complete")
      fail(
        409,
        "The timer changed on another device. Refresh to see its current state.",
      );
    const at = body.at ? new Date(body.at).toISOString() : nowIso();
    if (
      Date.parse(at) < Date.parse(String(activity.started_at)) ||
      Date.parse(at) > Date.now() + 60000
    )
      fail(400, "Choose a time between the start and now.");
    if (body.action === "pause") {
      if (activity.kind === "sleep" || activity.state === "paused")
        fail(
          400,
          "Sleep is logged as separate sessions. Finish this sleep when your child wakes.",
        );
      db.prepare(
        "UPDATE activities SET state='paused',paused_at=?,version=version+1,updated_at=? WHERE id=?",
      ).run(at, nowIso(), activity.id);
    } else if (body.action === "resume") {
      if (activity.state !== "paused")
        fail(400, "This timer is already running.");
      db.prepare(
        "UPDATE activities SET state='active',paused_ms=paused_ms+?,paused_at=NULL,version=version+1,updated_at=? WHERE id=?",
      ).run(
        Math.max(0, Date.parse(at) - Date.parse(String(activity.paused_at))),
        nowIso(),
        activity.id,
      );
    } else {
      const paused =
        Number(activity.paused_ms) +
        (activity.paused_at
          ? Math.max(0, Date.parse(at) - Date.parse(String(activity.paused_at)))
          : 0);
      db.prepare(
        "UPDATE activities SET state='complete',ended_at=?,paused_at=NULL,paused_ms=?,version=version+1,updated_at=? WHERE id=?",
      ).run(at, paused, nowIso(), activity.id);
    }
    res.json({ ok: true });
  });
  router.delete("/activities/:activityId", (req, res) => {
    const activity = getActivity(db, req, res);
    if (req.body?.version !== activity.version)
      fail(409, "This entry changed. Refresh before deleting.");
    db.prepare("DELETE FROM activities WHERE id=?").run(activity.id);
    const photo = JSON.parse(String(activity.details)).photoId;
    if (typeof photo === "string") removeUnusedPhotos(db, [photo]);
    res.json({ ok: true });
  });

  return router;
}

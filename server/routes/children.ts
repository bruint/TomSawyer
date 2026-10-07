import { Router } from "express";
import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { activitiesFor, childFromRow, transaction, type DB } from "../db.js";
import { buildStrategy } from "../strategy.js";
import { childSchema } from "../validation.js";

import { getChild, requireOwner } from "../access.js";
import { fail, nowIso } from "../http.js";
import { removeUnusedPhotos } from "../photos.js";

export function createChildRouter(db: DB) {
  const router = Router();
  router.post("/children", (req, res) => {
    requireOwner(res);
    const body = childSchema.parse(req.body);
    const id = randomUUID();
    db.prepare("INSERT INTO children VALUES (?,?,?,?,?,?,?,?,?)").run(
      id,
      res.locals.user.family_id,
      body.name,
      body.birthDate,
      body.dueDate,
      body.timezone,
      body.color,
      JSON.stringify(body.settings),
      nowIso(),
    );
    res
      .status(201)
      .json(
        childFromRow(db.prepare("SELECT * FROM children WHERE id=?").get(id)!),
      );
  });
  router.put("/children/:childId", (req, res) => {
    requireOwner(res);
    const child = getChild(db, req, res);
    const body = childSchema.parse(req.body);
    db.prepare(
      "UPDATE children SET name=?,birth_date=?,due_date=?,timezone=?,color=?,settings=? WHERE id=?",
    ).run(
      body.name,
      body.birthDate,
      body.dueDate,
      body.timezone,
      body.color,
      JSON.stringify(body.settings),
      child.id,
    );
    res.json(
      childFromRow(
        db.prepare("SELECT * FROM children WHERE id=?").get(child.id)!,
      ),
    );
  });
  router.delete("/children/:childId", (req, res) => {
    requireOwner(res);
    const child = getChild(db, req, res);
    if (req.body?.confirmName !== child.name)
      fail(400, "Enter the child’s name to confirm deletion.");
    const photos = activitiesFor(db, child.id)
      .map((a) => a.details.photoId)
      .filter((p): p is string => typeof p === "string");
    transaction(db, () => {
      db.prepare("DELETE FROM children WHERE id=?").run(child.id);
      removeUnusedPhotos(db, photos);
    });
    res.json({ ok: true });
  });
  router.get("/children/:childId/strategy", (req, res) => {
    const child = getChild(db, req, res);
    const napCount =
      req.query.naps === undefined
        ? undefined
        : z.coerce.number().int().min(0).max(6).parse(req.query.naps);
    res.json(
      buildStrategy(
        child,
        activitiesFor(db, child.id, DateTime.utc().minus({ days: 3 }).toISO()!),
        new Date(),
        { napCount },
      ),
    );
  });

  return router;
}

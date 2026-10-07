import { Router } from "express";
import { z } from "zod";
import { activitiesFor, transaction, type DB } from "../db.js";
import { parseImport } from "../import.js";

import { getChild } from "../access.js";
import { insertActivity } from "../activities.js";
import { fail } from "../http.js";

export function createDataRouter(db: DB) {
  const router = Router();
  router.get("/children/:childId/export", (req, res) => {
    const child = getChild(db, req, res);
    const activities = activitiesFor(db, child.id);
    const filename = `tomsawyer-${child.name.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().slice(0, 10)}`;
    if (req.query.format === "json") {
      res
        .attachment(`${filename}.json`)
        .json({ version: 1, child: child, activities });
      return;
    }
    const cell = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const header = [
      "id",
      "kind",
      "startedAt",
      "endedAt",
      "state",
      "pausedMs",
      "details",
      "notes",
      "caregiver",
    ];
    const csv = [
      header,
      ...activities.map((a) => [
        a.id,
        a.kind,
        a.startedAt,
        a.endedAt,
        a.state,
        a.pausedMs,
        JSON.stringify(a.details),
        a.notes,
        a.authorName,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    res.attachment(`${filename}.csv`).type("text/csv").send(csv);
  });
  router.post("/children/:childId/import", (req, res) => {
    const child = getChild(db, req, res);
    const body = z
      .object({
        format: z.enum(["json", "csv"]),
        content: z.string().max(5000000),
        commit: z.boolean().default(false),
      })
      .parse(req.body);
    let result: ReturnType<typeof parseImport>;
    try {
      result = parseImport(body.content, body.format, child);
    } catch (e) {
      fail(400, e instanceof Error ? e.message : "Unable to parse file");
    }
    if (!body.commit) {
      res.json({
        total: result!.total,
        valid: result!.events.length,
        errors: result!.errors.slice(0, 30),
        preview: result!.events.slice(0, 8),
      });
      return;
    }
    if (result!.errors.length)
      fail(
        400,
        "Fix the import errors before saving. No records were changed.",
      );
    const summary = transaction(db, () => {
      let imported = 0,
        duplicates = 0;
      for (const event of result.events) {
        if (insertActivity(db, child.id, event, res.locals.user.id).duplicate)
          duplicates++;
        else imported++;
      }
      return { imported, duplicates };
    });
    res.json(summary);
  });

  return router;
}

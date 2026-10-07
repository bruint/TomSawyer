import { parse } from "csv-parse/sync";
import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { activitySchema } from "./validation.js";
import {
  activityKinds,
  type Child,
  type ActivityKind,
} from "../shared/types.js";

export function parseImport(
  content: string,
  format: "csv" | "json",
  child: Child,
) {
  let rows: any[];
  if (format === "json") {
    const data = JSON.parse(content);
    rows = Array.isArray(data) ? data : data.activities;
    if (!Array.isArray(rows))
      throw new Error("Expected an activities array or a TomSawyer export");
  } else
    rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      max_record_size: 20000,
    });
  if (rows.length > 5000)
    throw new Error("Import up to 5,000 records at a time");
  const errors: { row: number; message: string }[] = [];
  const events: ReturnType<typeof activitySchema.parse>[] = [];
  const date = (v: string) => {
    if (!v) return null;
    const iso = DateTime.fromISO(v, { zone: child.timezone });
    if (iso.isValid) return iso.toUTC().toISO();
    for (const f of [
      "M/d/yyyy H:mm",
      "M/d/yyyy H:mm:ss",
      "M/d/yyyy h:mm a",
      "M/d/yyyy h:mm:ss a",
      "yyyy-MM-dd HH:mm:ss",
      "yyyy-MM-dd HH:mm",
    ]) {
      const d = DateTime.fromFormat(v, f, { zone: child.timezone });
      if (d.isValid) return d.toUTC().toISO();
    }
    return v;
  };
  for (const [i, row] of rows.entries()) {
    try {
      if (format === "json") {
        if (row.state && row.state !== "complete")
          throw new Error("Finish running timers before importing them.");
        events.push(
          activitySchema.parse({
            ...row,
            id: row.id || randomUUID(),
            state: "complete",
          }),
        );
        continue;
      }
      const get = (...keys: string[]) => {
        const key = Object.keys(row).find((k) =>
          keys.includes(
            k.toLowerCase().replaceAll("_", "").replaceAll(" ", ""),
          ),
        );
        return key ? row[key] : "";
      };
      const type = get("kind", "type", "activity").toLowerCase();
      const aliases: Record<string, ActivityKind> = {
        feeding: "bottle",
        "breast feeding": "nursing",
        breastfeeding: "nursing",
        "bottle feeding": "bottle",
        nap: "sleep",
        "night sleep": "sleep",
        medication: "medicine",
        "tummy time": "activity",
        bath: "activity",
        "screen time": "activity",
        "story time": "activity",
        "outdoor play": "activity",
        "skin to skin": "activity",
        pee: "diaper",
        poo: "diaper",
      };
      const kind = (aliases[type] || type) as ActivityKind;
      if (get("state") && get("state") !== "complete")
        throw new Error("Finish running timers before importing them.");
      if (!activityKinds.includes(kind))
        throw new Error(
          `Unsupported activity “${type}”. Change its kind or import it as a note.`,
        );
      const details = get("details", "detailsjson")
        ? JSON.parse(get("details", "detailsjson"))
        : {};
      if (kind === "sleep" && !details.sleepType)
        details.sleepType = type === "night sleep" ? "night" : "nap";
      if (kind === "activity" && !details.activityType)
        details.activityType = type;
      let notes = get("notes", "note");
      // Preserve unmapped source fields so imported clinical measurements are never guessed.
      if (!get("details", "detailsjson")) {
        const extras = Object.entries(row).filter(
          ([k, v]) =>
            v &&
            ![
              "type",
              "kind",
              "start",
              "end",
              "startedat",
              "endedat",
              "notes",
              "note",
              "id",
            ].includes(k.toLowerCase().replaceAll("_", "").replaceAll(" ", "")),
        );
        if (extras.length)
          notes = [notes, extras.map(([k, v]) => `${k}: ${v}`).join("; ")]
            .filter(Boolean)
            .join("\n");
      }
      events.push(
        activitySchema.parse({
          id: get("id") || randomUUID(),
          kind,
          startedAt: date(get("startedat", "start", "starttime", "date")),
          endedAt: date(get("endedat", "end", "endtime")),
          details,
          notes,
          state: "complete",
          pausedMs: Number(get("pausedms") || 0),
        }),
      );
    } catch (e) {
      errors.push({
        row: i + 1,
        message: e instanceof Error ? e.message : "Invalid record",
      });
    }
  }
  return { events, errors, total: rows.length };
}

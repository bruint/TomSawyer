import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { fail, nowIso } from "./http.js";
import { activitySchema } from "./validation.js";

export function validateSleepOverlap(
  db: DB,
  childId: string,
  input: ReturnType<typeof activitySchema.parse>,
  exclude = "",
) {
  if (input.kind !== "sleep") return;
  const overlap = db
    .prepare(
      "SELECT 1 FROM activities WHERE child_id=? AND kind='sleep' AND id!=? AND started_at < ? AND COALESCE(ended_at,'9999') > ? LIMIT 1",
    )
    .get(childId, exclude, input.endedAt || "9999", input.startedAt);
  if (overlap)
    fail(
      409,
      "This sleep overlaps an existing sleep entry. Edit that entry first.",
    );
}
export function insertActivity(
  db: DB,
  childId: string,
  input: ReturnType<typeof activitySchema.parse>,
  userId: string,
) {
  const id = input.id || randomUUID();
  const existing = db.prepare("SELECT * FROM activities WHERE id=?").get(id);
  if (existing) {
    if (existing.child_id !== childId)
      fail(409, "Entry identifier already exists.");
    return { id, duplicate: true };
  }
  validateSleepOverlap(db, childId, input);
  if (
    input.state === "active" &&
    db
      .prepare(
        "SELECT 1 FROM activities WHERE child_id=? AND kind=? AND state!='complete'",
      )
      .get(childId, input.kind)
  )
    fail(
      409,
      "This timer is already running on another device. Refresh to see it.",
    );
  const now = nowIso();
  db.prepare(
    "INSERT INTO activities(id,child_id,kind,started_at,ended_at,state,paused_ms,details,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id,
    childId,
    input.kind,
    input.startedAt,
    input.endedAt,
    input.state,
    input.pausedMs,
    JSON.stringify(input.details),
    input.notes,
    userId,
    now,
    now,
  );
  return { id, duplicate: false };
}

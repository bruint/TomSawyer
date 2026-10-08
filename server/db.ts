import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Activity, Child, Reminder, User } from "../shared/types.js";

export function openDatabase(
  path = process.env.DATABASE_PATH || "./data/tomsawyer.db",
) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','caregiver')), created_at TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS invites (token_hash TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), expires_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS children (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), name TEXT NOT NULL, birth_date TEXT NOT NULL, due_date TEXT, timezone TEXT NOT NULL, color TEXT NOT NULL, settings TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE, kind TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, state TEXT NOT NULL DEFAULT 'complete', paused_at TEXT, paused_ms INTEGER NOT NULL DEFAULT 0, details TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS activities_child_time ON activities(child_id, started_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS one_timer_per_kind ON activities(child_id, kind) WHERE state != 'complete';
    CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint TEXT UNIQUE NOT NULL, subscription TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_preferences (subscription_id TEXT PRIMARY KEY REFERENCES push_subscriptions(id) ON DELETE CASCADE, wind_down INTEGER NOT NULL DEFAULT 1 CHECK(wind_down IN (0,1)), sleep_window INTEGER NOT NULL DEFAULT 1 CHECK(sleep_window IN (0,1)));
    CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE, title TEXT NOT NULL, kind TEXT NOT NULL, mode TEXT NOT NULL, at_time TEXT NOT NULL, interval_minutes INTEGER NOT NULL, weekdays TEXT NOT NULL, daytime_only INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS push_deliveries (dedupe_key TEXT PRIMARY KEY, delivered_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), image BLOB NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS coach_turns (id TEXT NOT NULL, child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT NOT NULL, context_at TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(id, child_id, user_id));
    CREATE INDEX IF NOT EXISTS coach_conversations ON coach_turns(child_id, user_id, created_at);
    INSERT OR IGNORE INTO migrations(version) VALUES (1);
  `);
  return db;
}
export type DB = ReturnType<typeof openDatabase>;
export type Row = Record<string, any>;
export function childFromRow(r: Row): Child {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    birthDate: r.birth_date,
    dueDate: r.due_date,
    timezone: r.timezone,
    color: r.color,
    settings: JSON.parse(r.settings),
    createdAt: r.created_at,
  };
}
export function activityFromRow(r: Row): Activity {
  return {
    id: r.id,
    childId: r.child_id,
    kind: r.kind,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    state: r.state,
    pausedAt: r.paused_at,
    pausedMs: r.paused_ms,
    details: JSON.parse(r.details),
    notes: r.notes,
    createdBy: r.created_by,
    authorName: r.author_name || "Caregiver",
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export function publicUser(r: Row): User {
  return { id: r.id, name: r.name, email: r.email, role: r.role };
}
export function reminderFromRow(r: Row): Reminder {
  return {
    id: r.id,
    childId: r.child_id,
    title: r.title,
    kind: r.kind,
    mode: r.mode,
    atTime: r.at_time,
    intervalMinutes: r.interval_minutes,
    weekdays: JSON.parse(r.weekdays),
    daytimeOnly: !!r.daytime_only,
    enabled: !!r.enabled,
  };
}
export function activitiesFor(
  db: DB,
  childId: string,
  since?: string,
): Activity[] {
  return db
    .prepare(
      `SELECT a.*, u.name AS author_name FROM activities a JOIN users u ON u.id=a.created_by WHERE child_id=? ${since ? "AND (started_at>=? OR ended_at>=? OR state != 'complete')" : ""} ORDER BY started_at DESC`,
    )
    .all(...(since ? [childId, since, since] : [childId]))
    .map((r) => activityFromRow(r));
}
export function transaction<T>(db: DB, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function activitiesOn(
  db: DB,
  childId: string,
  start: string,
  end: string,
): Activity[] {
  return db
    .prepare(
      "SELECT a.*,u.name AS author_name FROM activities a JOIN users u ON u.id=a.created_by WHERE child_id=? AND started_at>=? AND started_at<? ORDER BY started_at DESC",
    )
    .all(childId, start, end)
    .map(activityFromRow);
}

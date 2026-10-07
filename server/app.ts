import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { DateTime } from "luxon";
import sharp from "sharp";
import {
  type DB,
  type Row,
  transaction,
  childFromRow,
  activityFromRow,
  activitiesFor,
  publicUser,
  reminderFromRow,
} from "./db.js";
import {
  currentUser,
  hashPassword,
  verifyPassword,
  setSession,
  sessionToken,
  hashToken,
} from "./auth.js";
import { activitySchema, childSchema, reminderSchema } from "./validation.js";
import { buildStrategy } from "./strategy.js";
import { initPush, validPushEndpoint, sendPush } from "./push.js";
import { parseImport } from "./import.js";
import type { Child } from "../shared/types.js";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const param = (req: Request, key: string) => String(req.params[key]);
const nowIso = () => new Date().toISOString();
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(60),
});
const sameSecret = (a: string, b: string) =>
  timingSafeEqual(
    Buffer.from(hashToken(a), "hex"),
    Buffer.from(hashToken(b), "hex"),
  );

export function createApp(
  db: DB,
  options: {
    setupToken?: string;
    appUrl?: string;
    staticDir?: string;
    rateLimits?: boolean;
  } = {},
) {
  const app = express();
  const appUrl =
    options.appUrl || process.env.APP_URL || "http://localhost:5173";
  const secure = new URL(appUrl).protocol === "https:";
  const setupToken = options.setupToken ?? process.env.SETUP_TOKEN ?? "";
  const publicKey = initPush(db);
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY)
    app.set("trust proxy", Number(process.env.TRUST_PROXY));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: secure ? [] : null,
        },
      },
      strictTransportSecurity: secure ? undefined : false,
    }),
  );
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", version: "1.0.0" });
  });
  if (options.rateLimits !== false)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 240,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  app.use(express.json({ limit: "6mb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("X-TomSawyer") !== "1")
        return next(new HttpError(403, "Missing request protection header"));
      const allowed = [new URL(appUrl).origin];
      if (process.env.NODE_ENV !== "production")
        allowed.push(
          "http://127.0.0.1:5173",
          "http://localhost:5173",
          "http://127.0.0.1:3000",
        );
      if (req.get("Origin") && !allowed.includes(req.get("Origin")!))
        return next(new HttpError(403, "Request origin is not allowed"));
    }
    next();
  });
  if (options.rateLimits !== false)
    app.use(
      "/api/auth",
      rateLimit({
        windowMs: 15 * 60000,
        limit: 30,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
  app.get("/api/status", (_req, res) =>
    res.json({
      needsSetup: !db.prepare("SELECT 1 FROM users LIMIT 1").get(),
      setupKeyRequired: !!setupToken,
      version: "1.0.0",
    }),
  );
  app.post("/api/auth/setup", async (req, res) => {
    const body = credentials
      .extend({
        familyName: z.string().trim().min(1).max(80),
        setupToken: z.string().default(""),
      })
      .parse(req.body);
    if (db.prepare("SELECT 1 FROM users LIMIT 1").get())
      fail(409, "This server is already set up. Ask for a family invitation.");
    if (setupToken && !sameSecret(body.setupToken, setupToken))
      fail(
        403,
        "The setup key does not match. Check your server configuration.",
      );
    if (process.env.NODE_ENV === "production" && !setupToken)
      fail(
        503,
        "Set SETUP_TOKEN on the server before creating the first account.",
      );
    const password = await hashPassword(body.password);
    const uid = randomUUID();
    const fid = randomUUID();
    transaction(db, () => {
      if (db.prepare("SELECT 1 FROM users LIMIT 1").get())
        fail(409, "This server has already been set up.");
      db.prepare("INSERT INTO families VALUES (?,?,?)").run(
        fid,
        body.familyName,
        nowIso(),
      );
      db.prepare(
        "INSERT INTO users (id,family_id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)",
      ).run(uid, fid, body.name, body.email, password, "owner", nowIso());
    });
    setSession(db, res, uid, secure);
    res.status(201).json({ ok: true });
  });
  app.post("/api/auth/login", async (req, res) => {
    const b = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .transform((v) => v.toLowerCase()),
        password: z.string().max(128),
      })
      .parse(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE email=? AND disabled=0")
      .get(b.email);
    const valid = await verifyPassword(
      b.password,
      String(
        user?.password_hash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      ),
    );
    if (!user || !valid) fail(401, "Email or password is incorrect.");
    setSession(db, res, String(user!.id), secure);
    res.json({ ok: true });
  });
  app.post("/api/auth/join", async (req, res) => {
    const b = credentials
      .extend({ invite: z.string().min(20).max(100) })
      .parse(req.body);
    const password = await hashPassword(b.password);
    const id = randomUUID();
    transaction(db, () => {
      const invite = db
        .prepare("SELECT * FROM invites WHERE token_hash=? AND expires_at>?")
        .get(hashToken(b.invite), nowIso());
      if (!invite)
        fail(400, "This invitation has expired or has already been used.");
      if (db.prepare("SELECT 1 FROM users WHERE email=?").get(b.email))
        fail(409, "An account already uses this email. Sign in instead.");
      db.prepare(
        "INSERT INTO users (id,family_id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        invite!.family_id,
        b.name,
        b.email,
        password,
        "caregiver",
        nowIso(),
      );
      db.prepare("DELETE FROM invites WHERE token_hash=?").run(
        hashToken(b.invite),
      );
    });
    setSession(db, res, id, secure);
    res.status(201).json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    const user = currentUser(db, req);
    if (!user) return next(new HttpError(401, "Please sign in to continue."));
    res.locals.user = user;
    next();
  });
  const owner = (res: Response) => {
    if (res.locals.user.role !== "owner")
      fail(403, "Only the family owner can do that.");
  };
  const child = (req: Request, res: Response): Child => {
    const row = db
      .prepare("SELECT * FROM children WHERE id=? AND family_id=?")
      .get(param(req, "childId"), res.locals.user.family_id);
    if (!row) fail(404, "Child not found.");
    return childFromRow(row!);
  };
  const activity = (req: Request, res: Response): Row => {
    const row = db
      .prepare(
        "SELECT a.*,u.name author_name FROM activities a JOIN children c ON c.id=a.child_id JOIN users u ON u.id=a.created_by WHERE a.id=? AND c.family_id=?",
      )
      .get(param(req, "activityId"), res.locals.user.family_id);
    if (!row) fail(404, "Entry not found.");
    return row!;
  };
  const removeUnusedPhotos = (ids: string[]) => {
    for (const id of ids)
      db.prepare(
        "DELETE FROM photos WHERE id=? AND NOT EXISTS(SELECT 1 FROM activities WHERE json_extract(details,'$.photoId')=?)",
      ).run(id, id);
  };
  app.get("/api/bootstrap", (_req, res) => {
    const u = res.locals.user;
    res.json({
      user: publicUser(u),
      family: db
        .prepare("SELECT id,name FROM families WHERE id=?")
        .get(u.family_id),
      children: db
        .prepare("SELECT * FROM children WHERE family_id=? ORDER BY created_at")
        .all(u.family_id)
        .map(childFromRow),
      members: db
        .prepare(
          "SELECT * FROM users WHERE family_id=? AND disabled=0 ORDER BY created_at",
        )
        .all(u.family_id)
        .map(publicUser),
      push: { publicKey, enabled: true },
      serverTime: nowIso(),
    });
  });
  app.post("/api/auth/logout", (req, res) => {
    const token = sessionToken(req);
    if (token)
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        hashToken(token),
      );
    // A logged-out browser must not retain family notifications.
    if (typeof req.body?.endpoint === "string")
      db.prepare(
        "DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?",
      ).run(req.body.endpoint, res.locals.user.id);
    res.clearCookie("ts_session", {
      path: "/",
      secure,
      sameSite: "lax",
      httpOnly: true,
    });
    res.json({ ok: true });
  });
  app.post("/api/account/password", async (req, res) => {
    const b = z
      .object({
        currentPassword: z.string().max(128),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    if (
      !(await verifyPassword(b.currentPassword, res.locals.user.password_hash))
    )
      fail(400, "Current password is incorrect.");
    const hash = await hashPassword(b.password);
    transaction(db, () => {
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
        hash,
        res.locals.user.id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(
        res.locals.user.id,
      );
    });
    setSession(db, res, res.locals.user.id, secure);
    res.json({ ok: true });
  });
  app.post("/api/family/invites", (_req, res) => {
    owner(res);
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    db.prepare("INSERT INTO invites VALUES (?,?,?,?)").run(
      hashToken(token),
      res.locals.user.family_id,
      expiresAt,
      res.locals.user.id,
    );
    res
      .status(201)
      .json({ token, url: `${appUrl}/?invite=${token}`, expiresAt });
  });
  app.delete("/api/family/members/:userId", (req, res) => {
    owner(res);
    const id = param(req, "userId");
    if (id === res.locals.user.id) fail(400, "You cannot remove yourself.");
    const member = db
      .prepare("SELECT * FROM users WHERE id=? AND family_id=? AND role=?")
      .get(id, res.locals.user.family_id, "caregiver");
    if (!member) fail(404, "Caregiver not found.");
    transaction(db, () => {
      db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(id);
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      db.prepare("DELETE FROM push_subscriptions WHERE user_id=?").run(id);
    });
    res.json({ ok: true });
  });
  app.post("/api/children", (req, res) => {
    owner(res);
    const b = childSchema.parse(req.body);
    const id = randomUUID();
    db.prepare("INSERT INTO children VALUES (?,?,?,?,?,?,?,?,?)").run(
      id,
      res.locals.user.family_id,
      b.name,
      b.birthDate,
      b.dueDate,
      b.timezone,
      b.color,
      JSON.stringify(b.settings),
      nowIso(),
    );
    res
      .status(201)
      .json(
        childFromRow(db.prepare("SELECT * FROM children WHERE id=?").get(id)!),
      );
  });
  app.put("/api/children/:childId", (req, res) => {
    owner(res);
    const c = child(req, res);
    const b = childSchema.parse(req.body);
    db.prepare(
      "UPDATE children SET name=?,birth_date=?,due_date=?,timezone=?,color=?,settings=? WHERE id=?",
    ).run(
      b.name,
      b.birthDate,
      b.dueDate,
      b.timezone,
      b.color,
      JSON.stringify(b.settings),
      c.id,
    );
    res.json(
      childFromRow(db.prepare("SELECT * FROM children WHERE id=?").get(c.id)!),
    );
  });
  app.delete("/api/children/:childId", (req, res) => {
    owner(res);
    const c = child(req, res);
    if (req.body?.confirmName !== c.name)
      fail(400, "Enter the child’s name to confirm deletion.");
    const photos = activitiesFor(db, c.id)
      .map((a) => a.details.photoId)
      .filter((p): p is string => typeof p === "string");
    transaction(db, () => {
      db.prepare("DELETE FROM children WHERE id=?").run(c.id);
      removeUnusedPhotos(photos);
    });
    res.json({ ok: true });
  });
  app.get("/api/children/:childId/activities", (req, res) => {
    const c = child(req, res);
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .default(30)
      .parse(req.query.days);
    res.json(activitiesFor(db, c.id, DateTime.utc().minus({ days }).toISO()!));
  });
  function validateSleepOverlap(
    childId: string,
    b: ReturnType<typeof activitySchema.parse>,
    exclude = "",
  ) {
    if (b.kind !== "sleep") return;
    const overlap = db
      .prepare(
        "SELECT 1 FROM activities WHERE child_id=? AND kind='sleep' AND id!=? AND started_at < ? AND COALESCE(ended_at,'9999') > ? LIMIT 1",
      )
      .get(childId, exclude, b.endedAt || "9999", b.startedAt);
    if (overlap)
      fail(
        409,
        "This sleep overlaps an existing sleep entry. Edit that entry first.",
      );
  }
  function insertActivity(
    childId: string,
    b: ReturnType<typeof activitySchema.parse>,
    userId: string,
  ) {
    const id = b.id || randomUUID();
    const existing = db.prepare("SELECT * FROM activities WHERE id=?").get(id);
    if (existing) {
      if (existing.child_id !== childId)
        fail(409, "Entry identifier already exists.");
      return { id, duplicate: true };
    }
    validateSleepOverlap(childId, b);
    if (
      b.state === "active" &&
      db
        .prepare(
          "SELECT 1 FROM activities WHERE child_id=? AND kind=? AND state!='complete'",
        )
        .get(childId, b.kind)
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
      b.kind,
      b.startedAt,
      b.endedAt,
      b.state,
      b.pausedMs,
      JSON.stringify(b.details),
      b.notes,
      userId,
      now,
      now,
    );
    return { id, duplicate: false };
  }
  app.post("/api/children/:childId/activities", (req, res) => {
    const c = child(req, res);
    const b = activitySchema.parse(req.body);
    const result = transaction(db, () =>
      insertActivity(c.id, b, res.locals.user.id),
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
  app.put("/api/activities/:activityId", (req, res) => {
    const old = activity(req, res);
    const b = activitySchema.parse(req.body);
    if (old.state !== "complete")
      fail(409, "Finish the timer before editing this entry.");
    if (b.state !== "complete" || b.version !== old.version)
      fail(
        409,
        "This entry changed on another device. Refresh before editing.",
      );
    validateSleepOverlap(old.child_id, b, old.id);
    db.prepare(
      "UPDATE activities SET kind=?,started_at=?,ended_at=?,paused_ms=?,details=?,notes=?,version=version+1,updated_at=? WHERE id=?",
    ).run(
      b.kind,
      b.startedAt,
      b.endedAt,
      b.pausedMs,
      JSON.stringify(b.details),
      b.notes,
      nowIso(),
      old.id,
    );
    const oldPhoto = JSON.parse(String(old.details)).photoId;
    if (typeof oldPhoto === "string" && oldPhoto !== b.details.photoId)
      removeUnusedPhotos([oldPhoto]);
    res.json({ ok: true });
  });
  app.post("/api/activities/:activityId/timer", (req, res) => {
    const a = activity(req, res);
    const b = z
      .object({
        action: z.enum(["pause", "resume", "stop"]),
        version: z.number().int(),
        at: z.string().datetime({ offset: true }).optional(),
      })
      .parse(req.body);
    if (a.version !== b.version || a.state === "complete")
      fail(
        409,
        "The timer changed on another device. Refresh to see its current state.",
      );
    const at = b.at ? new Date(b.at).toISOString() : nowIso();
    if (
      Date.parse(at) < Date.parse(String(a.started_at)) ||
      Date.parse(at) > Date.now() + 60000
    )
      fail(400, "Choose a time between the start and now.");
    if (b.action === "pause") {
      if (a.kind === "sleep" || a.state === "paused")
        fail(
          400,
          "Sleep is logged as separate sessions. Finish this sleep when your child wakes.",
        );
      db.prepare(
        "UPDATE activities SET state='paused',paused_at=?,version=version+1,updated_at=? WHERE id=?",
      ).run(at, nowIso(), a.id);
    } else if (b.action === "resume") {
      if (a.state !== "paused") fail(400, "This timer is already running.");
      db.prepare(
        "UPDATE activities SET state='active',paused_ms=paused_ms+?,paused_at=NULL,version=version+1,updated_at=? WHERE id=?",
      ).run(
        Math.max(0, Date.parse(at) - Date.parse(String(a.paused_at))),
        nowIso(),
        a.id,
      );
    } else {
      const paused =
        Number(a.paused_ms) +
        (a.paused_at
          ? Math.max(0, Date.parse(at) - Date.parse(String(a.paused_at)))
          : 0);
      db.prepare(
        "UPDATE activities SET state='complete',ended_at=?,paused_at=NULL,paused_ms=?,version=version+1,updated_at=? WHERE id=?",
      ).run(at, paused, nowIso(), a.id);
    }
    res.json({ ok: true });
  });
  app.delete("/api/activities/:activityId", (req, res) => {
    const a = activity(req, res);
    if (req.body?.version !== a.version)
      fail(409, "This entry changed. Refresh before deleting.");
    db.prepare("DELETE FROM activities WHERE id=?").run(a.id);
    const photo = JSON.parse(String(a.details)).photoId;
    if (typeof photo === "string") removeUnusedPhotos([photo]);
    res.json({ ok: true });
  });
  app.get("/api/children/:childId/strategy", (req, res) => {
    const c = child(req, res);
    const napCount =
      req.query.naps === undefined
        ? undefined
        : z.coerce.number().int().min(0).max(6).parse(req.query.naps);
    res.json(
      buildStrategy(
        c,
        activitiesFor(db, c.id, DateTime.utc().minus({ days: 3 }).toISO()!),
        new Date(),
        { napCount },
      ),
    );
  });
  app.get("/api/children/:childId/reminders", (req, res) => {
    const c = child(req, res);
    res.json(
      db
        .prepare("SELECT * FROM reminders WHERE child_id=?")
        .all(c.id)
        .map(reminderFromRow),
    );
  });
  app.post("/api/children/:childId/reminders", (req, res) => {
    const c = child(req, res);
    const b = reminderSchema.parse(req.body);
    const id = randomUUID();
    db.prepare("INSERT INTO reminders VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      id,
      c.id,
      b.title,
      b.kind,
      b.mode,
      b.atTime,
      b.intervalMinutes,
      JSON.stringify(b.weekdays),
      Number(b.daytimeOnly),
      Number(b.enabled),
    );
    res.status(201).json({ id });
  });
  app.put("/api/children/:childId/reminders/:reminderId", (req, res) => {
    const c = child(req, res);
    const b = reminderSchema.parse(req.body);
    const result = db
      .prepare(
        "UPDATE reminders SET title=?,kind=?,mode=?,at_time=?,interval_minutes=?,weekdays=?,daytime_only=?,enabled=? WHERE id=? AND child_id=?",
      )
      .run(
        b.title,
        b.kind,
        b.mode,
        b.atTime,
        b.intervalMinutes,
        JSON.stringify(b.weekdays),
        Number(b.daytimeOnly),
        Number(b.enabled),
        param(req, "reminderId"),
        c.id,
      );
    if (!result.changes) fail(404, "Reminder not found.");
    res.json({ ok: true });
  });
  app.delete("/api/children/:childId/reminders/:reminderId", (req, res) => {
    const c = child(req, res);
    db.prepare("DELETE FROM reminders WHERE id=? AND child_id=?").run(
      param(req, "reminderId"),
      c.id,
    );
    res.json({ ok: true });
  });
  app.post("/api/push/subscribe", (req, res) => {
    const sub = z
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
      sub.endpoint,
      JSON.stringify(sub),
      nowIso(),
    );
    res.status(201).json({ ok: true });
  });
  app.delete("/api/push/subscribe", (req, res) => {
    const b = z.object({ endpoint: z.string() }).parse(req.body);
    db.prepare(
      "DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?",
    ).run(b.endpoint, res.locals.user.id);
    res.json({ ok: true });
  });
  app.post("/api/push/test", async (req, res) => {
    const b = z.object({ endpoint: z.string() }).parse(req.body);
    const sub = db
      .prepare(
        "SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?",
      )
      .get(b.endpoint, res.locals.user.id);
    if (!sub) fail(400, "Enable notifications on this device first.");
    if (
      !(await sendPush(db, sub!, {
        title: "A little peace of mind.",
        body: "TomSawyer notifications are ready on this device.",
        url: "/",
        tag: "test",
      }))
    )
      fail(502, "The push service could not deliver this notification.");
    res.json({ ok: true });
  });
  app.post("/api/photos", async (req, res) => {
    const b = z.object({ data: z.string().max(5500000) }).parse(req.body);
    const match = b.data.match(
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/,
    );
    if (!match) fail(400, "Choose a JPEG, PNG or WebP photo.");
    const image = await sharp(Buffer.from(match![2], "base64"), {
      limitInputPixels: 25000000,
    })
      .rotate()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const id = randomUUID();
    db.prepare("INSERT INTO photos VALUES (?,?,?,?)").run(
      id,
      res.locals.user.family_id,
      image,
      nowIso(),
    );
    res.status(201).json({ id });
  });
  app.get("/api/photos/:photoId", (req, res) => {
    const photo = db
      .prepare("SELECT image FROM photos WHERE id=? AND family_id=?")
      .get(param(req, "photoId"), res.locals.user.family_id);
    if (!photo) fail(404, "Photo not found.");
    res.type("image/webp").send(Buffer.from(photo!.image as Uint8Array));
  });
  app.get("/api/children/:childId/export", (req, res) => {
    const c = child(req, res);
    const activities = activitiesFor(db, c.id);
    const filename = `tomsawyer-${c.name.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().slice(0, 10)}`;
    if (req.query.format === "json") {
      res
        .attachment(`${filename}.json`)
        .json({ version: 1, child: c, activities });
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
  app.post("/api/children/:childId/import", (req, res) => {
    const c = child(req, res);
    const b = z
      .object({
        format: z.enum(["json", "csv"]),
        content: z.string().max(5000000),
        commit: z.boolean().default(false),
      })
      .parse(req.body);
    let result: ReturnType<typeof parseImport>;
    try {
      result = parseImport(b.content, b.format, c);
    } catch (e) {
      fail(400, e instanceof Error ? e.message : "Unable to parse file");
    }
    if (!b.commit) {
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
        if (insertActivity(c.id, event, res.locals.user.id).duplicate)
          duplicates++;
        else imported++;
      }
      return { imported, duplicates };
    });
    res.json(summary);
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Endpoint not found.")),
  );
  const staticDir = options.staticDir || resolve("dist/client");
  if (existsSync(staticDir)) {
    app.use(
      express.static(staticDir, {
        maxAge: "1h",
        setHeaders: (res, path) => {
          if (path.endsWith("sw.js") || path.endsWith("index.html"))
            res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(staticDir, "index.html")),
    );
  }
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: error.issues
            .map((i) => i.message)
            .slice(0, 4)
            .join(". "),
        });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid request data." });
        return;
      }
      console.error(
        "Request failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    },
  );
  return app;
}

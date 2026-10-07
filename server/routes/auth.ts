import { Router } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  hashPassword,
  hashToken,
  setSession,
  verifyPassword,
} from "../auth.js";
import { transaction, type DB } from "../db.js";

import { fail, nowIso } from "../http.js";

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

export function createAuthRouter(
  db: DB,
  { setupToken, secure }: { setupToken: string; secure: boolean },
) {
  const router = Router();
  router.get("/status", (_req, res) =>
    res.json({
      needsSetup: !db.prepare("SELECT 1 FROM users LIMIT 1").get(),
      setupKeyRequired: !!setupToken,
      version: "1.0.0",
    }),
  );
  router.post("/auth/setup", async (req, res) => {
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
  router.post("/auth/login", async (req, res) => {
    const body = z
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
      .get(body.email);
    const valid = await verifyPassword(
      body.password,
      String(
        user?.password_hash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      ),
    );
    if (!user || !valid) fail(401, "Email or password is incorrect.");
    setSession(db, res, String(user!.id), secure);
    res.json({ ok: true });
  });
  router.post("/auth/join", async (req, res) => {
    const body = credentials
      .extend({ invite: z.string().min(20).max(100) })
      .parse(req.body);
    const password = await hashPassword(body.password);
    const id = randomUUID();
    transaction(db, () => {
      const invite = db
        .prepare("SELECT * FROM invites WHERE token_hash=? AND expires_at>?")
        .get(hashToken(body.invite), nowIso());
      if (!invite)
        fail(400, "This invitation has expired or has already been used.");
      if (db.prepare("SELECT 1 FROM users WHERE email=?").get(body.email))
        fail(409, "An account already uses this email. Sign in instead.");
      db.prepare(
        "INSERT INTO users (id,family_id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        invite!.family_id,
        body.name,
        body.email,
        password,
        "caregiver",
        nowIso(),
      );
      db.prepare("DELETE FROM invites WHERE token_hash=?").run(
        hashToken(body.invite),
      );
    });
    setSession(db, res, id, secure);
    res.status(201).json({ ok: true });
  });

  return router;
}

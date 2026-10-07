import { Router } from "express";
import { z } from "zod";
import {
  hashPassword,
  hashToken,
  sessionToken,
  setSession,
  verifyPassword,
} from "../auth.js";
import { transaction, type DB } from "../db.js";

import { fail } from "../http.js";

export function createAccountRouter(db: DB, secure: boolean) {
  const router = Router();
  router.post("/auth/logout", (req, res) => {
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
  router.post("/account/password", async (req, res) => {
    const body = z
      .object({
        currentPassword: z.string().max(128),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    if (
      !(await verifyPassword(
        body.currentPassword,
        res.locals.user.password_hash,
      ))
    )
      fail(400, "Current password is incorrect.");
    const hash = await hashPassword(body.password);
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

  return router;
}

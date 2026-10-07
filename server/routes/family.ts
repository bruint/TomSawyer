import { Router } from "express";
import { randomBytes } from "node:crypto";
import { hashToken } from "../auth.js";
import { childFromRow, publicUser, transaction, type DB } from "../db.js";

import { requireOwner } from "../access.js";
import { fail, nowIso, param } from "../http.js";

export function createFamilyRouter(
  db: DB,
  { appUrl, publicKey }: { appUrl: string; publicKey: string },
) {
  const router = Router();
  router.get("/bootstrap", (_req, res) => {
    const user = res.locals.user;
    res.json({
      user: publicUser(user),
      family: db
        .prepare("SELECT id,name FROM families WHERE id=?")
        .get(user.family_id),
      children: db
        .prepare("SELECT * FROM children WHERE family_id=? ORDER BY created_at")
        .all(user.family_id)
        .map(childFromRow),
      members: db
        .prepare(
          "SELECT * FROM users WHERE family_id=? AND disabled=0 ORDER BY created_at",
        )
        .all(user.family_id)
        .map(publicUser),
      push: { publicKey, enabled: true },
      serverTime: nowIso(),
    });
  });
  router.post("/family/invites", (_req, res) => {
    requireOwner(res);
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
  router.delete("/family/members/:userId", (req, res) => {
    requireOwner(res);
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

  return router;
}

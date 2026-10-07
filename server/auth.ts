import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import type { DB, Row } from "./db.js";
const scrypt = promisify(scryptCallback);
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function sessionToken(req: Request) {
  return req.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("ts_session="))
    ?.slice(11);
}
export function currentUser(db: DB, req: Request): Row | undefined {
  const token = sessionToken(req);
  if (!token) return;
  return db
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0",
    )
    .get(hashToken(token), new Date().toISOString());
}
export function setSession(
  db: DB,
  res: Response,
  userId: string,
  secure: boolean,
) {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    hashToken(token),
    userId,
    new Date(Date.now() + 30 * 86400000).toISOString(),
  );
  res.cookie("ts_session", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 30 * 86400000,
    path: "/",
  });
  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(
    new Date().toISOString(),
  );
}

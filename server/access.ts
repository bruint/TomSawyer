import type { Request, RequestHandler, Response } from "express";
import type { Child } from "../shared/types.js";
import { currentUser } from "./auth.js";
import { type DB, type Row, childFromRow } from "./db.js";
import { fail, HttpError, param } from "./http.js";

export function authenticate(db: DB): RequestHandler {
  return (req, res, next) => {
    const user = currentUser(db, req);
    if (!user) return next(new HttpError(401, "Please sign in to continue."));
    res.locals.user = user;
    next();
  };
}
export function requireOwner(res: Response) {
  if (res.locals.user.role !== "owner")
    fail(403, "Only the family owner can do that.");
}
export function getChild(db: DB, req: Request, res: Response): Child {
  const row = db
    .prepare("SELECT * FROM children WHERE id=? AND family_id=?")
    .get(param(req, "childId"), res.locals.user.family_id);
  if (!row) fail(404, "Child not found.");
  return childFromRow(row!);
}
export function getActivity(db: DB, req: Request, res: Response): Row {
  const row = db
    .prepare(
      "SELECT a.*,u.name author_name FROM activities a JOIN children c ON c.id=a.child_id JOIN users u ON u.id=a.created_by WHERE a.id=? AND c.family_id=?",
    )
    .get(param(req, "activityId"), res.locals.user.family_id);
  if (!row) fail(404, "Entry not found.");
  return row!;
}

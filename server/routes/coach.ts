import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { DateTime } from "luxon";
import { z } from "zod";
import type { CoachTurn } from "../../shared/coach.js";
import { getChild } from "../access.js";
import { coachMessages, type CoachClient } from "../coach/client.js";
import { buildCoachContext } from "../coach/context.js";
import { activitiesFor, type DB, type Row } from "../db.js";
import { fail } from "../http.js";
import { STRATEGY_HISTORY_DAYS } from "../strategy.js";

const questionSchema = z.object({
  id: z.uuid(),
  question: z.string().trim().min(1).max(3000),
});
const fromRow = (row: Row): CoachTurn => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
  contextAt: row.context_at,
  createdAt: row.created_at,
});

export function createCoachRouter(
  db: DB,
  client: CoachClient,
  rateLimits = true,
) {
  const router = Router();
  const pending = new Set<string>();
  const history = (childId: string, userId: string) =>
    db
      .prepare(
        "SELECT * FROM coach_turns WHERE child_id=? AND user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 20",
      )
      .all(childId, userId)
      .map(fromRow)
      .reverse();

  router.get("/children/:childId/coach", (req, res) => {
    const child = getChild(db, req, res);
    res.json({
      enabled: client.enabled,
      turns: history(child.id, res.locals.user.id),
    });
  });
  if (rateLimits)
    router.use(
      "/children/:childId/coach",
      rateLimit({
        windowMs: 60000,
        limit: 10,
        keyGenerator: (_req, res) => res.locals.user.id,
        message: { error: "Give the coach a moment before asking again." },
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );

  router.post("/children/:childId/coach", async (req, res) => {
    const child = getChild(db, req, res);
    const userId = res.locals.user.id as string;
    const { id, question } = questionSchema.parse(req.body);
    const saved = db
      .prepare(
        "SELECT * FROM coach_turns WHERE id=? AND child_id=? AND user_id=?",
      )
      .get(id, child.id, userId);
    if (saved) {
      if (saved.question !== question)
        return fail(409, "This question was already sent. Start a new one.");
      res.json(fromRow(saved));
      return;
    }
    if (!client.enabled) return fail(503, "Sleep coach is not connected.");
    const scope = `${child.id}:${userId}`;
    if (pending.has(scope))
      return fail(409, "The coach is still answering your last question.");
    pending.add(scope);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", disconnected);
    try {
      const now = new Date();
      const context = buildCoachContext(
        child,
        activitiesFor(
          db,
          child.id,
          DateTime.fromJSDate(now)
            .minus({ days: STRATEGY_HISTORY_DAYS })
            .toISO()!,
        ),
        now,
      );
      const answer = await client.reply(
        coachMessages(context, history(child.id, userId), question),
        controller.signal,
      );
      if (controller.signal.aborted)
        return fail(503, "Sleep coach took too long. Try again.");
      // Recheck access after a potentially long request; a child or caregiver
      // can be removed while the answer is being generated.
      const permitted = db
        .prepare(
          "SELECT c.id FROM children c JOIN users u ON u.family_id=c.family_id WHERE c.id=? AND u.id=? AND u.disabled=0",
        )
        .get(child.id, userId);
      if (!permitted) return fail(404, "Conversation is no longer available.");
      const turn: CoachTurn = {
        id,
        question,
        answer,
        contextAt: context.currentTime,
        createdAt: new Date().toISOString(),
      };
      db.prepare(
        "INSERT INTO coach_turns (id,child_id,user_id,question,answer,context_at,created_at) VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        child.id,
        userId,
        question,
        answer,
        turn.contextAt,
        turn.createdAt,
      );
      res.json(turn);
    } finally {
      clearTimeout(timeout);
      res.off("close", disconnected);
      pending.delete(scope);
    }
  });
  return router;
}

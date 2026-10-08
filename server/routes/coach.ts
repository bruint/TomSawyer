import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { DateTime } from "luxon";
import { z } from "zod";
import type { CoachTurn } from "../../shared/coach.js";
import { getChild } from "../access.js";
import { coachMessages, type CoachClient } from "../coach/client.js";
import { buildCoachContext } from "../coach/context.js";
import { activitiesFor, type DB, type Row } from "../db.js";
import { fail, HttpError } from "../http.js";
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
    const streaming = req.get("Accept")?.includes("text/event-stream") ?? false;
    const beginStream = () => {
      if (res.headersSent) return;
      res.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
    };
    const sendEvent = (event: string, data: unknown) => {
      beginStream();
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const respond = (turn: CoachTurn) => {
      if (streaming) {
        sendEvent("complete", turn);
        res.end();
      } else res.json(turn);
    };
    const saved = db
      .prepare(
        "SELECT * FROM coach_turns WHERE id=? AND child_id=? AND user_id=?",
      )
      .get(id, child.id, userId);
    if (saved) {
      if (saved.question !== question)
        return fail(409, "This question was already sent. Start a new one.");
      respond(fromRow(saved));
      return;
    }
    if (!client.enabled) return fail(503, "Sleep coach is not connected.");
    const scope = `${child.id}:${userId}`;
    if (pending.has(scope))
      return fail(409, "The coach is still answering your last question.");
    pending.add(scope);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", disconnected);
    const access = db.prepare(
      "SELECT c.id FROM children c JOIN users u ON u.family_id=c.family_id WHERE c.id=? AND u.id=? AND u.disabled=0",
    );
    const checkAccess = () => {
      if (!access.get(child.id, userId))
        fail(404, "Conversation is no longer available.");
    };
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
      if (streaming) {
        beginStream();
        heartbeat = setInterval(() => {
          if (!res.destroyed) res.write(": keep-alive\n\n");
        }, 15000);
      }
      const answer = await client.reply(
        coachMessages(context, history(child.id, userId), question),
        controller.signal,
        streaming
          ? (text) => {
              if (controller.signal.aborted)
                fail(503, "Sleep coach reply was interrupted. Try again.");
              checkAccess();
              sendEvent("delta", { text });
            }
          : undefined,
      );
      if (controller.signal.aborted)
        return fail(503, "Sleep coach took too long. Try again.");
      // Access can change while the reply is being generated.
      checkAccess();
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
      respond(turn);
    } catch (error) {
      if (!streaming || !res.headersSent) throw error;
      if (!res.destroyed) {
        sendEvent("error", {
          error: controller.signal.aborted
            ? "Sleep coach took too long. Try again."
            : error instanceof HttpError
              ? error.message
              : "Sleep coach reply was interrupted. Try again.",
        });
        res.end();
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      res.off("close", disconnected);
      pending.delete(scope);
    }
  });
  return router;
}

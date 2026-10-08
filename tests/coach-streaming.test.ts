import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { createApp } from "../server/app.js";
import { hashToken } from "../server/auth.js";
import { createCoachClient, type CoachClient } from "../server/coach/client.js";
import { openDatabase } from "../server/db.js";
import { HttpError } from "../server/http.js";
import { readServerEvents } from "../shared/sse.js";
import { defaultSettings } from "../shared/types.js";
import { ApiError } from "../src/lib/api.js";
import { streamCoachReply } from "../src/lib/coach-api.js";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function controlledStream() {
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const cancelled = gate();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = controller;
    },
    cancel() {
      cancelled.release();
    },
  });
  return {
    body,
    cancelled,
    push(text: string) {
      writer.enqueue(new TextEncoder().encode(text));
    },
    pushBytes(text: string) {
      for (const byte of new TextEncoder().encode(text))
        writer.enqueue(Uint8Array.of(byte));
    },
    close() {
      writer.close();
    },
  };
}
const providerDelta = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`;
const providerDone =
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
const event = (name: string, data: unknown) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const connection = {
  OPENAI_BASE_URL: "http://coach.example.test/v1",
  OPENAI_MODEL: "model",
};

test("SSE handles split UTF-8, CRLF, multiline data, heartbeats and early cancellation", async () => {
  const stream = controlledStream();
  stream.pushBytes(
    ": keep-alive\r\n\r\nevent: delta\r\ndata: first 💤\r\ndata: second\r\n\r\n",
  );
  const events = readServerEvents(stream.body);
  assert.deepEqual((await events.next()).value, {
    event: "delta",
    data: "first 💤\nsecond",
  });
  await events.return(undefined);
  await stream.cancelled.promise;
});

test("the connector emits real deltas before the model finishes", async () => {
  const stream = controlledStream();
  const firstText = gate();
  const deltas: string[] = [];
  let completed = false;
  const client = createCoachClient(
    { ...connection, OPENAI_API_KEY: "test-secret" },
    async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.equal(body.stream, true);
      assert.equal(
        (options!.headers as Record<string, string>).Accept,
        "text/event-stream",
      );
      assert.equal(
        (options!.headers as Record<string, string>).Authorization,
        "Bearer test-secret",
      );
      assert.equal(JSON.stringify(body).includes("test-secret"), false);
      return new Response(stream.body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  );
  const reply = client
    .reply([], new AbortController().signal, (text) => {
      deltas.push(text);
      firstText.release();
    })
    .then((answer) => {
      completed = true;
      return answer;
    });
  stream.pushBytes(providerDelta("Let Robin sleep 💤."));
  await firstText.promise;
  assert.equal(completed, false);
  assert.deepEqual(deltas, ["Let Robin sleep 💤."]);
  stream.push(providerDelta(" Log the wake time.") + providerDone);
  stream.close();
  assert.equal(await reply, "Let Robin sleep 💤. Log the wake time.");
});

test("failed and incomplete provider streams never become successful answers or expose provider errors", async () => {
  for (const ending of [
    "",
    "data: {not-json}\n\n",
    'data: {"error":{"message":"private provider token"}}\n\ndata: [DONE]\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{}]}}]}\n\ndata: [DONE]\n\n',
  ]) {
    const client = createCoachClient(
      connection,
      async () =>
        new Response(providerDelta("Partial answer") + ending, {
          headers: { "Content-Type": "text/event-stream" },
        }),
    );
    const seen: string[] = [];
    await assert.rejects(
      client.reply([], new AbortController().signal, (text) => seen.push(text)),
      (error: unknown) =>
        error instanceof HttpError &&
        !error.message.includes("private provider token"),
    );
    assert.deepEqual(seen, ["Partial answer"]);
  }
});

test("the browser receives text before completion and recognizes an interrupted reply", async () => {
  const stream = controlledStream();
  const firstText = gate();
  const question = { id: randomUUID(), question: "What now?" };
  const turn = {
    ...question,
    answer: "A calm wind-down.",
    contextAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  let completed = false;
  const deltas: string[] = [];
  const reply = streamCoachReply(
    "child",
    question,
    new AbortController().signal,
    (text) => {
      deltas.push(text);
      firstText.release();
    },
    async (path, options) => {
      assert.equal(path, "/children/child/coach");
      assert.equal(options?.method, "POST");
      assert.equal(
        (options?.headers as Record<string, string>).Accept,
        "text/event-stream",
      );
      return new Response(stream.body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  ).then((answer) => {
    completed = true;
    return answer;
  });
  stream.pushBytes(event("delta", { text: "A calm " }));
  await firstText.promise;
  assert.equal(completed, false);
  assert.deepEqual(deltas, ["A calm "]);
  stream.push(event("delta", { text: "wind-down." }) + event("complete", turn));
  stream.close();
  assert.deepEqual(await reply, turn);
  assert.equal(deltas.join(""), turn.answer);

  await assert.rejects(
    streamCoachReply(
      "child",
      question,
      new AbortController().signal,
      () => {},
      async () =>
        new Response(event("delta", { text: "Incomplete" }), {
          headers: { "Content-Type": "text/event-stream" },
        }),
    ),
    (error: unknown) =>
      error instanceof ApiError && /interrupted/.test(error.message),
  );
});

async function serveCoach(t: TestContext, client: CoachClient) {
  const db = openDatabase(":memory:");
  const created = new Date().toISOString();
  for (const id of ["family", "other-family"])
    db.prepare("INSERT INTO families VALUES (?,?,?)").run(id, id, created);
  for (const [id, family] of [
    ["owner", "family"],
    ["outsider", "other-family"],
  ]) {
    db.prepare(
      "INSERT INTO users (id,family_id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(id, family, id, `${id}@example.test`, "unused", "owner", created);
    db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
      hashToken(id),
      id,
      new Date(Date.now() + 86400000).toISOString(),
    );
  }
  const childId = randomUUID();
  db.prepare("INSERT INTO children VALUES (?,?,?,?,?,?,?,?,?)").run(
    childId,
    "family",
    "Robin",
    "2026-06-08",
    null,
    "Australia/Perth",
    "sage",
    JSON.stringify(defaultSettings),
    created,
  );
  const server = createApp(db, { coach: client, rateLimits: false }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/children/${childId}/coach`;
  const post = (
    question: { id: string; question: string },
    user = "owner",
    signal?: AbortSignal,
  ) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TomSawyer": "1",
        Accept: "text/event-stream",
        ...(user ? { Cookie: `ts_session=${user}` } : {}),
      },
      body: JSON.stringify(question),
      signal,
    });
  const count = () =>
    db.prepare("SELECT COUNT(*) AS count FROM coach_turns").get()!.count;
  return { db, post, count };
}

test("the authenticated API streams before saving, then saves once and replays retries", async (t) => {
  const finish = gate();
  let calls = 0;
  const client: CoachClient = {
    enabled: true,
    async reply(_messages, _signal, onDelta) {
      calls++;
      onDelta!("A calm ");
      await finish.promise;
      onDelta!("wind-down.");
      return "A calm wind-down.";
    },
  };
  const { post, count } = await serveCoach(t, client);
  const question = { id: randomUUID(), question: "What now?" };
  assert.equal((await post(question, "")).status, 401);
  assert.equal((await post(question, "outsider")).status, 404);
  assert.equal(calls, 0);
  const response = await post(question);
  assert.match(response.headers.get("Content-Type")!, /text\/event-stream/);
  assert.match(response.headers.get("Cache-Control")!, /no-transform/);
  assert.equal(response.headers.get("X-Accel-Buffering"), "no");
  const events = readServerEvents(response.body!);
  assert.equal(JSON.parse((await events.next()).value!.data).text, "A calm ");
  assert.equal(count(), 0);
  assert.equal(
    (await post({ id: randomUUID(), question: "Another question" })).status,
    409,
  );
  finish.release();
  const remaining = [];
  for await (const message of events) remaining.push(message);
  assert.equal(remaining.at(-1)!.event, "complete");
  const turn = JSON.parse(remaining.at(-1)!.data);
  assert.equal(turn.answer, "A calm wind-down.");
  assert.equal(count(), 1);
  const retry = await post(question);
  const replay = [];
  for await (const message of readServerEvents(retry.body!))
    replay.push(message);
  assert.equal(replay.length, 1);
  assert.deepEqual(JSON.parse(replay[0].data), turn);
  assert.equal(calls, 1);
});

test("an API stream failure preserves no partial turn and allows the same question to retry", async (t) => {
  let fail = true;
  const client: CoachClient = {
    enabled: true,
    async reply(_messages, _signal, onDelta) {
      onDelta!("Partial answer");
      if (fail) throw new Error("private connector details");
      return "Complete answer";
    },
  };
  const { post, count } = await serveCoach(t, client);
  const question = { id: randomUUID(), question: "What now?" };
  const response = await post(question);
  const messages = [];
  for await (const message of readServerEvents(response.body!))
    messages.push(message);
  assert.deepEqual(
    messages.map((message) => message.event),
    ["delta", "error"],
  );
  assert.equal(
    JSON.stringify(messages).includes("private connector details"),
    false,
  );
  assert.equal(count(), 0);
  fail = false;
  const retry = await post(question);
  const replay = [];
  for await (const message of readServerEvents(retry.body!))
    replay.push(message);
  assert.equal(replay.at(-1)!.event, "complete");
  assert.equal(count(), 1);
});

test("disconnecting cancels the upstream stream without saving a partial answer", async (t) => {
  const cancelled = gate();
  const client: CoachClient = {
    enabled: true,
    async reply(_messages, signal, onDelta) {
      onDelta!("Beginning of the answer");
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => {
            cancelled.release();
            reject(new HttpError(503, "Cancelled"));
          },
          { once: true },
        ),
      );
      return "Never completed";
    },
  };
  const { post, count } = await serveCoach(t, client);
  const controller = new AbortController();
  const response = await post(
    { id: randomUUID(), question: "What now?" },
    "owner",
    controller.signal,
  );
  const reader = response.body!.getReader();
  await reader.read();
  controller.abort();
  await cancelled.promise;
  assert.equal(count(), 0);
});

test("revoked access stops further streamed text and prevents the conversation being saved", async (t) => {
  const finish = gate();
  const client: CoachClient = {
    enabled: true,
    async reply(_messages, _signal, onDelta) {
      onDelta!("First words");
      await finish.promise;
      onDelta!("Hidden after access is revoked");
      return "Never saved";
    },
  };
  const { post, count, db } = await serveCoach(t, client);
  const response = await post({ id: randomUUID(), question: "What now?" });
  const events = readServerEvents(response.body!);
  assert.equal((await events.next()).value!.event, "delta");
  db.prepare("UPDATE users SET disabled=1 WHERE id=?").run("owner");
  finish.release();
  const remaining = [];
  for await (const message of events) remaining.push(message);
  assert.deepEqual(
    remaining.map((message) => message.event),
    ["error"],
  );
  assert.equal(JSON.stringify(remaining).includes("Hidden after"), false);
  assert.equal(count(), 0);
});

import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import {
  defaultSettings,
  type Activity,
  type ActivityInput,
  type Child,
} from "../shared/types.js";

async function familyApi(t: TestContext) {
  const db = openDatabase(":memory:");
  const origin = "http://localhost:5173";
  const server = createApp(db, {
    setupToken: "test-key",
    appUrl: origin,
    rateLimits: false,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const { port } = server.address() as { port: number };
  let cookie = "";
  async function request<T = unknown>(
    path: string,
    method = "GET",
    input?: unknown,
  ) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-TomSawyer": "1",
        Origin: origin,
        Cookie: cookie,
      },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
    return { status: response.status, body: (await response.json()) as T };
  }
  assert.equal(
    (
      await request("/auth/setup", "POST", {
        name: "Parent",
        email: "parent@example.test",
        password: "a secure test passphrase",
        familyName: "Family",
        setupToken: "test-key",
      })
    ).status,
    201,
  );
  async function addChild(name: string) {
    const response = await request<Child>("/children", "POST", {
      name,
      birthDate: "2025-01-01",
      timezone: "Australia/Perth",
      settings: defaultSettings,
    });
    assert.equal(response.status, 201);
    return response.body;
  }
  return { request, child: await addChild("Rowan"), addChild };
}

test("sleep edits reopen and finish the original session without losing times or allowing overlaps", async (t) => {
  const { request, child, addChild } = await familyApi(t);
  const ago = (minutes: number) =>
    new Date(Date.now() - minutes * 60000).toISOString();
  const input: ActivityInput = {
    id: randomUUID(),
    kind: "sleep",
    startedAt: ago(120),
    endedAt: ago(60),
    state: "complete",
    pausedMs: 0,
    details: { sleepType: "nap", settledBy: "Rocking" },
    notes: "Original note",
  };
  const created = await request<Activity>(
    `/children/${child.id}/activities`,
    "POST",
    input,
  );
  assert.equal(created.status, 201);
  const path = `/activities/${created.body.id}`;
  async function saved() {
    const response = await request<Activity[]>(
      `/children/${child.id}/activities`,
    );
    return response.body.find((a) => a.id === created.body.id)!;
  }
  const ongoing = {
    ...input,
    endedAt: null,
    state: "active" as const,
    version: 1,
  };
  assert.equal((await request(path, "PUT", ongoing)).status, 200);
  const reopened = await saved();
  assert.deepEqual(reopened, {
    ...created.body,
    endedAt: null,
    state: "active",
    version: 2,
    updatedAt: reopened.updatedAt,
  });

  const earlierStart = ago(150);
  assert.equal(
    (
      await request(path, "PUT", {
        ...ongoing,
        startedAt: earlierStart,
        version: 2,
      })
    ).status,
    200,
  );
  assert.equal((await saved()).startedAt, earlierStart);
  assert.equal((await saved()).version, 3);
  assert.equal(
    (await request(path, "PUT", { ...input, version: 2 })).status,
    409,
    "stale caregiver edit is rejected",
  );
  assert.equal((await saved()).state, "active");
  assert.equal(
    (await request(path, "PUT", { ...ongoing, state: "complete", version: 3 }))
      .status,
    400,
    "finished sleep needs an end",
  );
  assert.equal(
    (await request(path, "PUT", { ...input, state: "active", version: 3 }))
      .status,
    400,
    "ongoing sleep cannot have an end",
  );

  const completed = {
    ...input,
    startedAt: earlierStart,
    endedAt: ago(30),
    version: 3,
  };
  assert.equal((await request(path, "PUT", completed)).status, 200);
  const finished = await saved();
  assert.equal(finished.state, "complete");
  assert.equal(finished.endedAt, completed.endedAt);
  assert.equal(finished.startedAt, earlierStart);
  assert.deepEqual(finished.details, input.details);
  assert.equal(finished.notes, input.notes);
  assert.equal(finished.version, 4);
  assert.equal(
    (
      await request(path, "PUT", {
        ...ongoing,
        startedAt: earlierStart,
        version: 4,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`${path}/timer`, "POST", {
        action: "stop",
        version: 5,
        at: completed.endedAt,
      })
    ).status,
    200,
    "the normal stop control works after an edit",
  );

  const nextSleep = await request<Activity>(
    `/children/${child.id}/activities`,
    "POST",
    { ...ongoing, id: randomUUID(), startedAt: ago(20) },
  );
  assert.equal(nextSleep.status, 201);
  assert.equal(
    (await request(path, "PUT", { ...ongoing, version: 6 })).status,
    409,
    "another ongoing sleep blocks reopening an earlier entry",
  );
  assert.equal(
    (
      await request(`/activities/${nextSleep.body.id}/timer`, "POST", {
        action: "stop",
        version: 1,
        at: ago(10),
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(path, "PUT", { ...ongoing, version: 6 })).status,
    409,
    "later completed sleep also blocks overlap",
  );
  assert.equal((await saved()).version, 6);
  assert.equal((await saved()).state, "complete");

  const sibling = await addChild("Poppy");
  assert.equal(
    (
      await request(`/children/${sibling.id}/activities`, "POST", {
        ...ongoing,
        id: randomUUID(),
      })
    ).status,
    201,
    "sleep overlap is scoped to each child",
  );
  const nurse = await request<Activity>(
    `/children/${child.id}/activities`,
    "POST",
    { kind: "nursing", state: "active", startedAt: ago(5) },
  );
  assert.equal(nurse.status, 201);
  assert.equal(
    (
      await request(`/activities/${nurse.body.id}`, "PUT", {
        kind: "nursing",
        startedAt: ago(5),
        endedAt: ago(1),
        state: "complete",
        version: 1,
      })
    ).status,
    409,
    "pausable timers still use their timer controls",
  );
});

test("Journal can load an older day using the child's timezone and exact day boundaries", async (t) => {
  const { request, child, addChild } = await familyApi(t);
  const starts = [
    "2025-01-02T15:59:59.000Z",
    "2025-01-02T16:00:00.000Z",
    "2025-01-03T15:59:59.000Z",
    "2025-01-03T16:00:00.000Z",
  ];
  const ids: string[] = [];
  for (const startedAt of starts) {
    const response = await request<Activity>(
      `/children/${child.id}/activities`,
      "POST",
      { kind: "bottle", startedAt },
    );
    assert.equal(response.status, 201);
    ids.push(response.body.id);
  }
  const sibling = await addChild("Poppy");
  assert.equal(
    (
      await request(`/children/${sibling.id}/activities`, "POST", {
        kind: "bottle",
        startedAt: starts[1],
      })
    ).status,
    201,
  );
  const history = await request<Activity[]>(
    `/children/${child.id}/activities?date=2025-01-03`,
  );
  assert.equal(history.status, 200);
  assert.deepEqual(
    history.body.map((a) => a.id),
    [ids[2], ids[1]],
  );
  assert.deepEqual(
    (await request<Activity[]>(`/children/${child.id}/activities?days=90`))
      .body,
    [],
    "the selected day is older than the normal recent cache",
  );
  assert.equal(
    (await request(`/children/${child.id}/activities?date=2025-02-30`)).status,
    400,
  );
});

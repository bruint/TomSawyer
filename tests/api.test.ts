import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/db.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { defaultSettings } from "../shared/types.js";
import { parseImport } from "../server/import.js";

test("family, tracking, timer concurrency, import and authorization workflows", async (t) => {
  const db = openDatabase(":memory:");
  const app = createApp(db, {
    setupToken: "test-setup-key",
    appUrl: "http://localhost:5173",
    rateLimits: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  t.after(() => {
    server.closeAllConnections();
    server.close();
    db.close();
  });
  let cookie = "";
  async function req(
    path: string,
    method = "GET",
    body?: any,
    auth = cookie,
    extra: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-TomSawyer": "1",
        Origin: "http://localhost:5173",
        ...(auth ? { Cookie: auth } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return {
      status: response.status,
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  assert.equal((await req("/bootstrap")).status, 401);
  assert.equal(
    (
      await req("/auth/setup", "POST", {
        name: "Parent",
        email: "parent@example.com",
        password: "very good passphrase",
        familyName: "A family",
        setupToken: "wrong",
      })
    ).status,
    403,
  );
  const setup = await req("/auth/setup", "POST", {
    name: "Parent",
    email: "parent@example.com",
    password: "very good passphrase",
    familyName: "A family",
    setupToken: "test-setup-key",
  });
  assert.equal(setup.status, 201);
  cookie = setup.cookie!;
  const ownerCookie = cookie;
  assert.equal(
    (
      await req("/auth/setup", "POST", {
        name: "Other",
        email: "other@example.com",
        password: "very good passphrase",
        familyName: "Other",
        setupToken: "test-setup-key",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req("/children", "POST", {}, cookie, {
        Origin: "https://attacker.test",
      })
    ).status,
    403,
  );
  const childResult = await req("/children", "POST", {
    name: "Robin",
    birthDate: "2026-01-01",
    timezone: "Australia/Perth",
    settings: defaultSettings,
  });
  assert.equal(childResult.status, 201);
  const child = childResult.data;
  const childId = child.id;
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString(),
    halfHourAgo = new Date(Date.now() - 1800000).toISOString();
  const sleep = {
    id: randomUUID(),
    kind: "sleep",
    startedAt: oneHourAgo,
    endedAt: halfHourAgo,
    state: "complete",
    details: { sleepType: "nap" },
    notes: "A nap",
  };
  const entry = await req(`/children/${childId}/activities`, "POST", sleep);
  assert.equal(entry.status, 201);
  assert.equal(entry.data.authorName, "Parent");
  assert.equal(
    (await req(`/children/${childId}/activities`, "POST", sleep)).status,
    200,
    "idempotent retry",
  );
  assert.equal(
    (
      await req(`/children/${childId}/activities`, "POST", {
        ...sleep,
        id: randomUUID(),
      })
    ).status,
    409,
    "overlap rejected",
  );
  assert.equal(
    (
      await req(`/children/${childId}/activities`, "POST", {
        kind: "bottle",
        startedAt: new Date(Date.now() + 86400000).toISOString(),
      })
    ).status,
    400,
  );
  const invite = await req("/family/invites", "POST", {});
  assert.equal(invite.status, 201);
  const joined = await req("/auth/join", "POST", {
    name: "Caregiver",
    email: "caregiver@example.com",
    password: "another good passphrase",
    invite: invite.data.token,
  });
  assert.equal(joined.status, 201);
  const caregiverCookie = joined.cookie!;
  assert.equal(
    (
      await req("/auth/join", "POST", {
        name: "Stranger",
        email: "stranger@example.com",
        password: "another good passphrase",
        invite: invite.data.token,
      })
    ).status,
    400,
    "single use invite",
  );
  assert.equal(
    (await req("/family/invites", "POST", {}, caregiverCookie)).status,
    403,
  );
  assert.equal(
    (await req("/children", "POST", child, caregiverCookie)).status,
    403,
  );
  const timer = await req(
    `/children/${childId}/activities`,
    "POST",
    {
      kind: "nursing",
      startedAt: new Date(Date.now() - 300000).toISOString(),
      state: "active",
      details: { side: "Left" },
    },
    caregiverCookie,
  );
  assert.equal(timer.status, 201);
  assert.equal(
    (
      await req(`/children/${childId}/activities`, "POST", {
        kind: "nursing",
        startedAt: new Date().toISOString(),
        state: "active",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`/activities/${timer.data.id}/timer`, "POST", {
        action: "pause",
        version: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        `/activities/${timer.data.id}/timer`,
        "POST",
        { action: "stop", version: 1 },
        caregiverCookie,
      )
    ).status,
    409,
    "stale shared timer update",
  );
  assert.equal(
    (
      await req(
        `/activities/${timer.data.id}/timer`,
        "POST",
        { action: "resume", version: 2 },
        caregiverCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(`/activities/${timer.data.id}/timer`, "POST", {
        action: "stop",
        version: 3,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        `/activities/${entry.data.id}`,
        "PUT",
        { ...sleep, notes: "Edited by caregiver", version: 1 },
        caregiverCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await req(`/activities/${entry.data.id}`, "PUT", { ...sleep, version: 1 }))
      .status,
    409,
  );
  const reminder = await req(`/children/${childId}/reminders`, "POST", {
    title: "Bottle time",
    kind: "bottle",
    mode: "interval",
    intervalMinutes: 180,
  });
  assert.equal(reminder.status, 201);
  assert.equal((await req(`/children/${childId}/reminders`)).data.length, 1);
  assert.equal((await req(`/children/${childId}/strategy`)).status, 200);
  const exported = await req(`/children/${childId}/export?format=json`);
  assert.equal(exported.status, 200);
  assert.equal(exported.data.activities.length, 2);
  const importPreview = await req(`/children/${childId}/import`, "POST", {
    content: JSON.stringify(exported.data),
    format: "json",
  });
  assert.equal(importPreview.status, 200);
  assert.equal(importPreview.data.valid, 2);
  const imported = await req(`/children/${childId}/import`, "POST", {
    content: JSON.stringify(exported.data),
    format: "json",
    commit: true,
  });
  assert.equal(imported.data.duplicates, 2);
  const invalidImport = await req(`/children/${childId}/import`, "POST", {
    content: JSON.stringify([{ kind: "unsupported", startedAt: oneHourAgo }]),
    format: "json",
    commit: true,
  });
  assert.equal(invalidImport.status, 400);
  // Explicitly provision a separate family to ensure IDs never cross the authorization boundary.
  const fid = randomUUID(),
    uid = randomUUID();
  db.prepare("INSERT INTO families VALUES(?,?,?)").run(
    fid,
    "Other family",
    oneHourAgo,
  );
  db.prepare(
    "INSERT INTO users(id,family_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(
    uid,
    fid,
    "Other",
    "other@example.com",
    await hashPassword("other secure passphrase"),
    "owner",
    oneHourAgo,
  );
  const other = (
    await req("/auth/login", "POST", {
      email: "other@example.com",
      password: "other secure passphrase",
    })
  ).cookie!;
  for (const route of [
    `/children/${childId}/activities`,
    `/children/${childId}/strategy`,
    `/children/${childId}/export`,
    `/children/${childId}/reminders`,
  ])
    assert.equal(
      (await req(route, "GET", undefined, other)).status,
      404,
      route,
    );
  assert.equal(
    (await req(`/activities/${entry.data.id}`, "DELETE", { version: 2 }, other))
      .status,
    404,
  );
  assert.equal(
    (
      await req("/push/subscribe", "POST", {
        endpoint: "https://127.0.0.1/private",
        keys: { p256dh: "a".repeat(80), auth: "a".repeat(24) },
      })
    ).status,
    400,
  );
  const boot = await req("/bootstrap");
  const caregiver = boot.data.members.find((u: any) => u.role === "caregiver");
  assert.equal(
    (await req(`/family/members/${caregiver.id}`, "DELETE")).status,
    200,
  );
  assert.equal(
    (await req("/bootstrap", "GET", undefined, caregiverCookie)).status,
    401,
  );
  assert.equal(
    (await req("/auth/logout", "POST", {}, ownerCookie)).status,
    200,
  );
  assert.equal(
    (await req("/bootstrap", "GET", undefined, ownerCookie)).status,
    401,
  );
});

test("CSV imports preserve quoted notes, source fields and child-local timestamps", () => {
  const child = { timezone: "Australia/Perth" } as any;
  const result = parseImport(
    'Type,Start,End,Notes,Amount\r\nBottle,2026-01-01 07:00:00,,"A note, with comma",150\r\n',
    "csv",
    child,
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.events[0].kind, "bottle");
  assert.equal(result.events[0].startedAt, "2025-12-31T23:00:00.000Z");
  assert(result.events[0].notes.includes("Amount: 150"));
  assert(result.events[0].notes.includes("with comma"));
});

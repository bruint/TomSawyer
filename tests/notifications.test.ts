import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";
import { notificationJobs } from "../server/notification-schedule.js";
import { deliverNotifications } from "../server/push.js";
import {
  defaultSettings,
  defaultSleepAlerts,
  type Activity,
  type Child,
  type PushDeviceState,
} from "../shared/types.js";
import {
  devicePlatform,
  deviceSetupKey,
  pushAvailability,
} from "../src/lib/device";

const child: Child = {
  id: "rowan",
  familyId: "family",
  name: "Rowan",
  birthDate: "2026-03-01",
  dueDate: null,
  timezone: "Australia/Perth",
  color: "sage",
  createdAt: "2026-03-01T00:00:00Z",
  settings: {
    ...defaultSettings,
    napCount: 3,
    wakeWindows: [150, 165, 180, 180],
    windDownMinutes: 20,
  },
};
const at = (time: string) => `2026-10-07T${time}:00+08:00`;
const now = (time: string) => DateTime.fromISO(at(time));
function entry(
  kind: Activity["kind"],
  start: string,
  end: string | null = null,
): Activity {
  return {
    id: `${kind}-${start}`,
    childId: child.id,
    kind,
    startedAt: at(start),
    endedAt: end ? at(end) : null,
    state: "complete",
    pausedAt: null,
    pausedMs: 0,
    details: kind === "sleep" ? { sleepType: "nap" } : {},
    notes: "",
    createdBy: "owner",
    authorName: "Parent",
    version: 1,
    createdAt: at(start),
    updatedAt: at(start),
  };
}
const wake = entry("wake", "07:00");

test("sleep alerts have separate deadlines, use the child's timezone and do not roll missed alarms forward", () => {
  const jobs = (time: string) => notificationJobs(child, [wake], [], now(time));
  assert.equal(jobs("09:09").length, 0);
  const wind = jobs("09:10");
  assert.equal(wind.length, 1);
  assert.equal(wind[0].alert, "windDown");
  assert.equal(wind[0].body, "Suggested sleep window: 9:20 AM–9:40 AM.");
  assert.equal(wind[0].url, "/?child=rowan&view=strategy");
  assert.equal(
    jobs("09:15")[0].key,
    wind[0].key,
    "five-minute catch-up keeps the original key",
  );
  assert.equal(jobs("09:16").length, 0);
  const window = jobs("09:20");
  assert.equal(window.length, 1);
  assert.equal(window[0].alert, "sleepWindow");
  assert.notEqual(window[0].key, wind[0].key);
  assert.equal(jobs("09:26").length, 0);
  assert.equal(jobs("10:30").length, 0, "an overdue plan is not a new alert");
  const editedWake = {
    ...wake,
    notes: "Note correction",
    version: 2,
    updatedAt: at("09:21"),
  };
  assert.equal(
    notificationJobs(child, [editedWake], [], now("09:21"))[0].key,
    window[0].key,
  );
});

test("short naps, late wakes and missed naps move both reminders to the recalculated sleep", () => {
  const shortNap = entry("sleep", "09:30", "09:55");
  assert.equal(
    notificationJobs(child, [wake, shortNap], [], now("09:56")).length,
    0,
  );
  const wind = notificationJobs(child, [wake, shortNap], [], now("12:00"));
  assert.equal(wind[0].alert, "windDown");
  assert.notEqual(
    wind[0].key,
    notificationJobs(child, [wake], [], now("09:10"))[0].key,
  );
  assert.equal(
    notificationJobs(child, [wake, shortNap], [], now("12:10"))[0].alert,
    "sleepWindow",
  );
  const lateWake = entry("wake", "09:00");
  assert.equal(notificationJobs(child, [lateWake], [], now("09:20")).length, 0);
  assert.equal(
    notificationJobs(child, [lateWake], [], now("11:10"))[0].alert,
    "windDown",
  );
  assert.equal(
    notificationJobs(child, [lateWake], [], now("11:20"))[0].alert,
    "sleepWindow",
  );
  const missed = entry("skipped_nap", "10:00");
  assert.equal(
    notificationJobs(child, [wake, missed], [], now("10:40"))[0].alert,
    "windDown",
  );
  assert.equal(
    notificationJobs(child, [wake, missed], [], now("10:50"))[0].alert,
    "sleepWindow",
  );
});

test("automatic count changes recalculate both alerts after a nap without replaying overdue alerts", () => {
  const automatic: Child = {
    ...child,
    birthDate: "2026-06-01",
    settings: { ...defaultSettings, windDownMinutes: 20 },
  };
  const jobs = (events: Activity[], time: string) =>
    notificationJobs(automatic, events, [], now(time));
  const firstWind = jobs([wake], "08:40");
  assert.equal(firstWind.length, 1);
  assert.equal(firstWind[0].alert, "windDown");
  assert.equal(firstWind[0].body, "Suggested sleep window: 8:50 AM–9:10 AM.");
  assert.equal(jobs([wake], "08:50")[0].alert, "sleepWindow");
  assert.equal(jobs([wake], "11:30").length, 0);
  const logs = [wake, entry("sleep", "09:00", "09:20")];
  const nextWind = jobs(logs, "10:25");
  assert.equal(nextWind.length, 1);
  assert.equal(nextWind[0].alert, "windDown");
  assert.equal(nextWind[0].body, "Suggested sleep window: 10:35 AM–10:55 AM.");
  assert.notEqual(nextWind[0].key, firstWind[0].key);
  assert.equal(jobs(logs, "10:35")[0].alert, "sleepWindow");
  assert.equal(jobs(logs, "12:00").length, 0);
});

test("sleeping, missing wake data and newborns suppress automatic sleep alerts; custom reminders still work", () => {
  const active = { ...entry("sleep", "09:00"), state: "active" as const };
  const newborn = { ...child, birthDate: "2026-09-10" };
  for (const [profile, events] of [
    [child, []],
    [child, [wake, active]],
    [newborn, [wake]],
    [child, [{ ...active, details: { sleepType: "night" } }]],
  ] as [Child, Activity[]][]) {
    assert.equal(notificationJobs(profile, events, [], now("09:20")).length, 0);
  }
  const reminders = [
    {
      id: "feed",
      childId: child.id,
      title: "Feed",
      kind: "bottle" as const,
      mode: "clock" as const,
      atTime: "09:20",
      intervalMinutes: 180,
      weekdays: [3],
      daytimeOnly: true,
      enabled: true,
    },
  ];
  const jobs = notificationJobs(child, [wake, active], reminders, now("09:20"));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].alert, undefined);
  assert.equal(jobs[0].title, "Rowan · Feed");
});

test("server delivery deduplicates each phase per device, retries failures and isolates families and disabled accounts", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  for (const family of ["family", "other-family"]) {
    db.prepare("INSERT INTO families VALUES (?,?,?)").run(
      family,
      family,
      at("07:00"),
    );
  }
  for (const [id, family, disabled] of [
    ["owner", "family", 0],
    ["caregiver", "family", 0],
    ["other-owner", "other-family", 0],
    ["disabled", "family", 1],
  ] as const) {
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)").run(
      id,
      family,
      id,
      `${id}@example.test`,
      "not-a-real-password-hash",
      "owner",
      at("07:00"),
      disabled,
    );
    db.prepare("INSERT INTO push_subscriptions VALUES (?,?,?,?,?)").run(
      `device-${id}`,
      id,
      `https://fcm.googleapis.com/fcm/send/${id}`,
      "{}",
      at("07:00"),
    );
  }
  // Existing subscriptions with no preference row default to both alerts.
  db.prepare("INSERT INTO push_preferences VALUES (?,?,?)").run(
    "device-caregiver",
    0,
    1,
  );
  for (const profile of [
    child,
    { ...child, id: "other-child", familyId: "other-family" },
    { ...child, id: "poppy", name: "Poppy" },
  ]) {
    db.prepare("INSERT INTO children VALUES (?,?,?,?,?,?,?,?,?)").run(
      profile.id,
      profile.familyId,
      profile.name,
      profile.birthDate,
      null,
      profile.timezone,
      profile.color,
      JSON.stringify(profile.settings),
      at("07:00"),
    );
    const startedAt = profile.id === "poppy" ? at("09:00") : wake.startedAt;
    db.prepare(
      "INSERT INTO activities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      `${profile.id}-wake`,
      profile.id,
      "wake",
      startedAt,
      null,
      "complete",
      null,
      0,
      "{}",
      "",
      profile.familyId === "family" ? "owner" : "other-owner",
      1,
      startedAt,
      startedAt,
    );
  }
  const delivered: { device: string; payload: Record<string, string> }[] = [];
  let failOnce = true;
  const transport: Parameters<typeof deliverNotifications>[2] = async (
    _db,
    sub,
    payload,
  ) => {
    if (sub.id === "device-owner" && failOnce) {
      failOnce = false;
      return false;
    }
    delivered.push({
      device: sub.id,
      payload: payload as Record<string, string>,
    });
    return true;
  };
  await deliverNotifications(db, now("09:10"), transport);
  assert.deepEqual(
    delivered.map((d) => d.device),
    ["device-other-owner"],
  );
  await deliverNotifications(db, now("09:11"), transport);
  assert.equal(delivered.length, 2);
  await deliverNotifications(db, now("09:12"), transport);
  assert.equal(
    delivered.length,
    2,
    "successful delivery is not repeated on the next tick",
  );
  await deliverNotifications(db, now("09:20"), transport);
  assert.equal(delivered.length, 5);
  assert.equal(
    delivered.filter((d) => d.device === "device-caregiver").length,
    1,
  );
  for (const item of delivered) {
    assert.equal(
      item.payload.url.includes("other-child"),
      item.device === "device-other-owner",
    );
    assert(!item.payload.url.includes("poppy"));
    assert.notEqual(item.device, "device-disabled");
  }
  await deliverNotifications(db, now("09:21"), transport);
  assert.equal(delivered.length, 5);
  await deliverNotifications(db, now("10:30"), transport);
  assert.equal(delivered.length, 5);
  await deliverNotifications(db, now("11:10"), transport);
  assert.equal(
    delivered.length,
    6,
    "the second child's wind-down reaches its enabled caregiver",
  );
  assert.equal(delivered.at(-1)!.payload.url, "/?child=poppy&view=strategy");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM push_deliveries").get()!.n,
    6,
  );
});

test("device alert preferences persist, validate and stay scoped to the signed-in caregiver", async (t) => {
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
  async function request<T = PushDeviceState>(
    path: string,
    method = "GET",
    body?: unknown,
    auth = cookie,
  ) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-TomSawyer": "1",
        Origin: origin,
        Cookie: auth,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
    return { status: response.status, body: (await response.json()) as T };
  }
  await request("/auth/setup", "POST", {
    name: "Parent",
    email: "parent@example.test",
    password: "a secure test passphrase",
    familyName: "Family",
    setupToken: "test-key",
  });
  const ownerCookie = cookie;
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-device",
    keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
    expirationTime: null,
  };
  const path = `/push/subscription?endpoint=${encodeURIComponent(subscription.endpoint)}`;
  assert.deepEqual((await request(path)).body, {
    enabled: false,
    alerts: defaultSleepAlerts,
  });
  assert.deepEqual(
    (await request("/push/subscribe", "POST", subscription)).body,
    { enabled: true, alerts: defaultSleepAlerts },
  );
  const alerts = { windDown: true, sleepWindow: false };
  assert.equal(
    (await request("/push/subscribe", "POST", { ...subscription, alerts }))
      .status,
    201,
  );
  assert.deepEqual((await request(path)).body.alerts, alerts);
  assert.equal(
    (
      await request("/push/subscribe", "POST", {
        ...subscription,
        alerts: { windDown: "yes", sleepWindow: false },
      })
    ).status,
    400,
  );
  assert.deepEqual(
    (await request("/push/subscribe", "POST", subscription)).body.alerts,
    alerts,
    "older clients do not reset saved preferences",
  );
  assert.equal(
    JSON.parse(
      String(
        db.prepare("SELECT subscription FROM push_subscriptions").get()!
          .subscription,
      ),
    ).alerts,
    undefined,
  );
  const invite = (
    await request<{ token: string }>("/family/invites", "POST", {})
  ).body;
  const joined = await request("/auth/join", "POST", {
    invite: invite.token,
    name: "Caregiver",
    email: "caregiver@example.test",
    password: "another secure passphrase",
  });
  assert.equal(joined.status, 201);
  const caregiverCookie = cookie;
  assert.notEqual(caregiverCookie, ownerCookie);
  assert.deepEqual((await request(path)).body, {
    enabled: false,
    alerts: defaultSleepAlerts,
  });
  await request("/push/subscribe", "POST", subscription);
  assert.deepEqual((await request(path)).body, {
    enabled: true,
    alerts: defaultSleepAlerts,
  });
  assert.deepEqual((await request(path, "GET", undefined, ownerCookie)).body, {
    enabled: false,
    alerts: defaultSleepAlerts,
  });
  await request(
    "/push/subscribe",
    "DELETE",
    { endpoint: subscription.endpoint },
    ownerCookie,
  );
  assert.equal(
    (await request(path, "GET", undefined, caregiverCookie)).body.enabled,
    true,
  );
  await request(
    "/push/subscribe",
    "DELETE",
    { endpoint: subscription.endpoint },
    caregiverCookie,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM push_preferences").get()!.n,
    0,
  );
});

test("onboarding recognizes iPads and requires the installed iOS app before push setup", () => {
  assert.equal(
    devicePlatform({
      userAgent: "Mozilla/5.0 (iPhone)",
      platform: "iPhone",
      maxTouchPoints: 5,
    }),
    "ios",
  );
  assert.equal(
    devicePlatform({
      userAgent: "Mozilla/5.0 (Macintosh)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    "ios",
  );
  assert.equal(
    devicePlatform({
      userAgent: "Mozilla/5.0 (Macintosh)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    }),
    "desktop",
  );
  assert.equal(
    devicePlatform({
      userAgent: "Mozilla/5.0 (Linux; Android 15)",
      platform: "Linux",
      maxTouchPoints: 5,
    }),
    "android",
  );
  assert.equal(
    pushAvailability({
      platform: "ios",
      standalone: false,
      secure: true,
      supported: true,
    }),
    "install",
  );
  assert.equal(
    pushAvailability({
      platform: "ios",
      standalone: true,
      secure: true,
      supported: true,
    }),
    "ready",
  );
  assert.equal(
    pushAvailability({
      platform: "ios",
      standalone: true,
      secure: true,
      supported: false,
    }),
    "unsupported",
  );
  assert.equal(
    pushAvailability({
      platform: "desktop",
      standalone: false,
      secure: true,
      supported: false,
    }),
    "unsupported",
  );
  assert.equal(
    pushAvailability({
      platform: "android",
      standalone: false,
      secure: false,
      supported: true,
    }),
    "https",
  );
  assert.notEqual(
    deviceSetupKey("parent", true),
    deviceSetupKey("parent", false),
    "opening the installed app resumes notification setup after skipping in the browser",
  );
  assert.notEqual(
    deviceSetupKey("caregiver", true),
    deviceSetupKey("parent", true),
  );
});

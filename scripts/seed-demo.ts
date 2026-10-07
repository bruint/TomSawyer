import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { openDatabase } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { defaultSettings, type ActivityKind } from "../shared/types.js";

if (!process.env.DEMO_PASSWORD || process.env.NODE_ENV === "production")
  throw new Error(
    "Set DEMO_PASSWORD and use a non-production database to seed demo data.",
  );
const db = openDatabase();
if (db.prepare("SELECT 1 FROM users LIMIT 1").get())
  throw new Error("Demo seeding only works on an empty database.");
const zone = "Australia/Perth";
const now = DateTime.now().setZone(zone);
const day = now.startOf("day");
const family = randomUUID(),
  user = randomUUID(),
  other = randomUUID(),
  child = randomUUID();
db.prepare("INSERT INTO families VALUES (?,?,?)").run(
  family,
  "The Sawyer family",
  now.toISO()!,
);
const hash = await hashPassword(process.env.DEMO_PASSWORD);
for (const [id, name, email, role] of [
  [user, "Alex", "demo@tomsawyer.local", "owner"],
  [other, "Jamie", "jamie@tomsawyer.local", "caregiver"],
])
  db.prepare(
    "INSERT INTO users(id,family_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(id, family, name, email, hash, role, now.toISO()!);
db.prepare("INSERT INTO children VALUES(?,?,?,?,?,?,?,?,?)").run(
  child,
  family,
  "Rowan",
  now.minus({ months: 7 }).toISODate()!,
  null,
  zone,
  "sage",
  JSON.stringify(defaultSettings),
  now.toISO()!,
);
const second = randomUUID();
db.prepare("INSERT INTO children VALUES(?,?,?,?,?,?,?,?,?)").run(
  second,
  family,
  "Poppy",
  now.minus({ months: 25 }).toISODate()!,
  null,
  zone,
  "peach",
  JSON.stringify({ ...defaultSettings, napCount: 1 }),
  now.toISO()!,
);
function add(
  kind: ActivityKind,
  start: DateTime,
  end: DateTime | null,
  details: Record<string, any> = {},
  notes = "",
  author = user,
) {
  if (start > now || (end && end > now)) return;
  const id = randomUUID();
  db.prepare(
    "INSERT INTO activities(id,child_id,kind,started_at,ended_at,state,details,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id,
    child,
    kind,
    start.toUTC().toISO()!,
    end?.toUTC().toISO() || null,
    "complete",
    JSON.stringify(details),
    notes,
    author,
    now.toUTC().toISO()!,
    now.toUTC().toISO()!,
  );
}
for (let d = 6; d >= 0; d--) {
  const base = day.minus({ days: d });
  add(
    "sleep",
    base.minus({ days: 1 }).set({ hour: 19, minute: 15 }),
    base.set({ hour: 7, minute: 10 }),
    { sleepType: "night" },
  );
  add("wake", base.set({ hour: 7, minute: 10 }), null);
  add(
    "bottle",
    base.set({ hour: 7, minute: 20 }),
    null,
    { amount: 150, unit: "ml", milkType: "Breast milk" },
    "",
    other,
  );
  add(
    "diaper",
    base.set({ hour: 7, minute: 35 }),
    null,
    { diaperType: "Wet" },
    "",
    other,
  );
  add(
    "sleep",
    base.set({ hour: 9, minute: 40 }),
    base.set({ hour: 10, minute: d === 0 ? 5 : 40 }),
    { sleepType: "nap", mood: "Content" },
    d === 0 ? "A little catnap. Woke happy." : "",
  );
  add("solids", base.set({ hour: 11, minute: 15 }), null, {
    food: d % 2 ? "Avocado & toast" : "Banana & oats",
    reaction: "Loved it",
    allergens: "Wheat",
  });
  add(
    "sleep",
    base.set({ hour: 13, minute: 10 }),
    base.set({ hour: 14, minute: 20 }),
    { sleepType: "nap" },
  );
  add("bottle", base.set({ hour: 14, minute: 30 }), null, {
    amount: 170,
    unit: "ml",
    milkType: "Formula",
  });
  add("diaper", base.set({ hour: 14, minute: 45 }), null, {
    diaperType: "Mixed",
  });
  add("sleep", base.set({ hour: 16, minute: 30 }), base.set({ hour: 17 }), {
    sleepType: "nap",
  });
}
add(
  "milestone",
  day.minus({ days: 2 }).set({ hour: 10 }),
  null,
  { title: "Sat up all by yourself!" },
  "Just for a few seconds, with a very proud smile.",
);
add("growth", day.minus({ days: 3 }).set({ hour: 9 }), null, {
  weight: 7.6,
  weightUnit: "kg",
  height: 67,
  head: 43,
  lengthUnit: "cm",
});
console.log(
  "Demo family created. Sign in as demo@tomsawyer.local using the DEMO_PASSWORD you supplied.",
);
db.close();

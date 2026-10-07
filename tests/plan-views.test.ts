import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultSettings,
  type Activity,
  type Child,
  type Strategy,
} from "../shared/types";
import { buildStrategy } from "../server/strategy";
import { Dashboard } from "../src/components/dashboard";
import { StrategyView } from "../src/components/strategy-view";
import { time } from "../src/lib/format";

const child: Child = {
  id: "child",
  familyId: "family",
  name: "Robin",
  birthDate: "2026-06-07",
  dueDate: null,
  timezone: "Australia/Perth",
  color: "sage",
  settings: { ...defaultSettings },
  createdAt: "2026-06-07T00:00:00Z",
};
const at = (value: string) => `2026-10-07T${value}:00+08:00`;
const activity = (
  id: string,
  kind: Activity["kind"],
  start: string,
  end: string | null = null,
): Activity => ({
  id,
  kind,
  childId: child.id,
  startedAt: at(start),
  endedAt: end ? at(end) : null,
  state: "complete",
  pausedAt: null,
  pausedMs: 0,
  details: kind === "sleep" ? { sleepType: "nap" } : {},
  notes: "",
  createdBy: "caregiver",
  authorName: "Alex",
  version: 1,
  createdAt: at(start),
  updatedAt: at(start),
});
const logs = [
  activity("wake", "wake", "07:00"),
  activity("first-nap", "sleep", "09:00", "09:25"),
  activity("second-nap", "sleep", "11:00", "11:30"),
];
const noop = () => {};

function renderViews(
  plan: Strategy,
  compare: number | null,
  events = logs,
  online = true,
  currentChild = child,
) {
  return {
    today: renderToStaticMarkup(
      createElement(Dashboard, {
        child: currentChild,
        events,
        strategy: plan,
        compare,
        online,
        setCompare: noop,
        onLog: noop,
        onEdit: noop,
        onNavigate: noop,
        onTimer: noop,
        quickLabel: () => "Log",
        quickBusy: false,
      }),
    ),
    strategy: renderToStaticMarkup(
      createElement(StrategyView, {
        child: currentChild,
        strategy: plan,
        compare,
        online,
        setCompare: noop,
        onLog: noop,
        quickBusy: false,
      }),
    ),
  };
}

test("Today shows the Strategy timeline's target, wind-down and bedtime for live and preview plans", () => {
  for (const compare of [null, 3, 4]) {
    const plan = buildStrategy(child, logs, new Date(at("12:30")), {
      ...(compare === null ? {} : { napCount: compare }),
    });
    const views = renderViews(plan, compare);
    const next = plan.steps.find((step) =>
      ["nap", "bedtime"].includes(step.kind),
    )!;
    const overview = views.today.match(
      /<section class="sleep-overview">(.*?)<\/section>/,
    )![1];
    const target = time(next.at, child.timezone);
    assert(overview.includes(`<h2>${target}</h2>`));
    assert(overview.includes(next.title));
    assert(views.strategy.includes(`<strong>${target}</strong>`));
    assert(
      overview.includes(`Wind down ${time(plan.windDownAt, child.timezone)}`),
    );
    const bedtime = `Bed <strong>${time(plan.bedtime, child.timezone)}</strong>`;
    assert(views.today.includes(bedtime));
    assert(views.strategy.includes(bedtime));
    if (compare !== null) {
      assert(views.today.includes(`Preview: ${compare} naps`));
      assert(views.strategy.includes(`Preview: ${compare} naps`));
    }
  }
});

test("an ongoing nap shows the same projected bedtime on Today and Strategy", () => {
  const active = { ...logs[2], endedAt: null, state: "active" as const };
  const events = [...logs.slice(0, 2), active];
  const plan = buildStrategy(child, events, new Date(at("12:30")));
  const views = renderViews(plan, null, events);
  const bedtime = `Bed <strong>${time(plan.bedtime, child.timezone)}</strong>`;
  assert(views.today.includes(bedtime));
  assert(views.strategy.includes(bedtime));
  assert(views.strategy.includes("If they wake now"));
});

test("offline fallbacks are labelled consistently instead of claiming a cached live plan is a preview", () => {
  const live = buildStrategy(child, logs, new Date(at("12:30")));
  const views = renderViews(live, 4, logs, false);
  for (const markup of Object.values(views)) {
    assert(markup.includes("Preview unavailable offline"));
    assert(!markup.includes("Preview: 4 naps"));
    assert(markup.includes("Return to live plan"));
  }
});

test("gentle and night states use the same headline on both screens", () => {
  const newborn = { ...child, birthDate: "2026-09-07" };
  for (const [currentChild, now] of [
    [newborn, "09:00"],
    [child, "04:00"],
  ] as const) {
    const plan = buildStrategy(currentChild, [], new Date(at(now)));
    const views = renderViews(plan, null, [], true, currentChild);
    assert(views.today.includes(`<h2>${plan.headline}</h2>`));
    assert(views.strategy.includes(`<h2>${plan.headline}</h2>`));
  }
});

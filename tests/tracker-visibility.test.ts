import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trackerEnabled } from "../shared/tracking";
import { defaultSettings, type Activity, type Child } from "../shared/types";
import { Dashboard } from "../src/components/dashboard";
import { QuickActionToolbar } from "../src/components/quick-action-toolbar";
import { ReportsView } from "../src/components/reports";
import { RunningTimers } from "../src/components/running-timers";
import { useQuickActions } from "../src/hooks/use-quick-actions";
import { timerDuration } from "../src/lib/format";

const child: Child = {
  id: "child",
  familyId: "family",
  name: "Robin",
  birthDate: "2026-06-08",
  dueDate: null,
  timezone: "Australia/Perth",
  color: "sage",
  createdAt: "2026-06-08T00:00:00Z",
  settings: { ...defaultSettings, visibleTrackers: ["sleep"] },
};
const startedAt = new Date(Date.now() - (83 * 60000 + 30000)).toISOString();
const activity = (
  kind: Activity["kind"],
  details: Activity["details"] = {},
): Activity => ({
  id: kind,
  childId: child.id,
  kind,
  startedAt,
  endedAt: null,
  state: "active",
  pausedAt: null,
  pausedMs: 0,
  details,
  notes: "",
  createdBy: "parent",
  authorName: "Parent",
  version: 1,
  createdAt: startedAt,
  updatedAt: startedAt,
});
const events = [
  activity("sleep", { sleepType: "nap" }),
  activity("nursing"),
  activity("pumping"),
];
const noop = () => {};
function toolbar(currentChild = child) {
  function Preview() {
    const actions = useQuickActions({
      child: currentChild,
      events,
      online: true,
      onRecord: async () => {},
      onTimer: async () => {},
      onDetails: noop,
    });
    return createElement(QuickActionToolbar, { actions });
  }
  return renderToStaticMarkup(createElement(Preview));
}

test("timers use hours and whole minutes, including durations longer than a day", () => {
  assert.equal(timerDuration(0), "0h 0m");
  assert.equal(timerDuration(59999), "0h 0m");
  assert.equal(timerDuration(83 * 60000 + 59000), "1h 23m");
  assert.equal(timerDuration(27 * 3600000 + 4 * 60000), "27h 4m");
});

test("sleep-only toolbar hides feeding and care shortcuts even when disabled trackers have running timers", () => {
  const html = toolbar();
  assert.match(html, /sleep-only/);
  assert.match(html, /Wake up/);
  assert.match(html, /1h 23m/);
  assert.match(html, /More quick actions/);
  for (const label of [
    "Stop feed",
    "Nurse",
    "Bottle",
    "Wet",
    "Dirty",
    "Pumping",
  ])
    assert.equal(html.includes(label), false, label);
  assert.equal(trackerEnabled(child, "wake"), true);
  assert.equal(trackerEnabled(child, "skipped_nap"), true);
  const disabled = {
    ...child,
    settings: { ...child.settings, visibleTrackers: [] },
  };
  assert.equal(toolbar(disabled), "");
  assert.equal(trackerEnabled(disabled, "wake"), false);
});

test("running timers respect enabled trackers and use the same duration format as quick actions", () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(RunningTimers, {
        child: {
          ...child,
          settings: { ...child.settings, visibleTrackers: [] },
        },
        events,
        onEdit: noop,
        onTimer: noop,
      }),
    ),
    "",
  );
  const html = renderToStaticMarkup(
    createElement(RunningTimers, {
      child,
      events,
      onEdit: noop,
      onTimer: noop,
    }),
  );
  assert.match(html, /1h 23m/);
  assert.equal(html.includes("Nursing"), false);
  assert.equal(html.includes("Pumping"), false);
  const onlyNursing: Child = {
    ...child,
    settings: { ...child.settings, visibleTrackers: ["nursing"] },
  };
  const filtered = renderToStaticMarkup(
    createElement(RunningTimers, {
      child: onlyNursing,
      events,
      onEdit: noop,
      onTimer: noop,
    }),
  );
  assert.match(filtered, /Nursing/);
  assert.equal(filtered.includes("Woke up"), false);
});

test("sleep-only home and reports do not show disabled tracker counts or empty sections", () => {
  const home = renderToStaticMarkup(
    createElement(Dashboard, {
      child,
      events,
      strategy: null,
      onLog: noop,
      onEdit: noop,
      onNavigate: noop,
      onTimer: noop,
      quickLabel: () => "Sleep",
      quickBusy: false,
      compare: null,
      setCompare: noop,
      online: true,
    }),
  );
  assert.equal(home.includes(" feeds"), false);
  assert.equal(home.includes(" diapers"), false);
  assert.equal(home.includes("Nursing"), false);
  assert.equal(home.includes("Pumping"), false);
  const reports = renderToStaticMarkup(
    createElement(ReportsView, { child, events }),
  );
  for (const label of [
    "Feeds recorded",
    "Diaper changes",
    "Foods &amp; reactions",
    ">Growth<",
    ">Milestones<",
    ">Feeds<",
    ">Diapers<",
  ])
    assert.equal(reports.includes(label), false, label);
  assert.match(reports, /Average logged sleep/);
});

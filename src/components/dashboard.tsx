import {
  ArrowRight,
  Clock3,
  Moon,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Sunrise,
} from "lucide-react";
import { DateTime } from "luxon";
import {
  elapsedMs,
  type Activity,
  type ActivityKind,
  type Child,
  type Strategy,
} from "../../shared/types";
import { duration, relative, time } from "../lib/format";
import type { Page } from "../lib/navigation";
import { ActivityIcon } from "./activity-icon";
import { RiverScene } from "./brand";
import { EntryList } from "./entry-list";
import { PageHeader } from "./page-header";
import { RunningTimers } from "./running-timers";
import { Button } from "./ui/button";

export function Dashboard({
  child,
  events,
  strategy,
  onLog,
  onEdit,
  onNavigate,
  onTimer,
  quickLabel,
  quickBusy,
  onMore,
}: {
  child: Child;
  events: Activity[];
  strategy: Strategy | null;
  onLog: (kind: ActivityKind) => void;
  quickLabel: (kind: ActivityKind) => string;
  quickBusy: boolean;
  onMore: () => void;
  onEdit: (a: Activity) => void;
  onNavigate: (page: Page) => void;
  onTimer: (a: Activity, action: "pause" | "resume" | "stop") => void;
}) {
  const today = DateTime.now().setZone(child.timezone).startOf("day");
  const todays = events.filter((a) => DateTime.fromISO(a.startedAt) >= today);
  const feeding = todays.filter((a) =>
    ["nursing", "bottle", "solids"].includes(a.kind),
  );
  const diapers = todays.filter((a) => a.kind === "diaper");
  const active = events.find(
    (a) => a.kind === "sleep" && a.state !== "complete",
  );
  const lastSleep = events.find((a) => a.kind === "sleep" && a.endedAt);
  const lastFeed = events.find((a) => ["nursing", "bottle"].includes(a.kind));
  const next = strategy?.steps.find(
    (s) => s.kind === "nap" || s.kind === "bedtime",
  );
  return (
    <>
      <PageHeader
        child={child}
        title={`${child.name}’s day`}

        action={
          <Button
            variant="outline"
            disabled={quickBusy}
            onClick={() => onLog("wake")}
          >
            <Sunrise />
            {active ? "Wake up" : "Morning wake"}
          </Button>
        }
      />
      <RunningTimers
        events={events}
        child={child}
        onTimer={onTimer}
        disabled={quickBusy}
      />
      <div className="dashboard-grid">
        <section className="sleep-hero">
          <div className="hero-content">
            <div className="hero-top">
              <span className="eyebrow">
                <Moon size={14} />
                {active
                  ? "SLEEP IN PROGRESS"
                  : next?.kind === "bedtime"
                    ? "TONIGHT’S BEDTIME"
                    : "YOUR NEXT SLEEP WINDOW"}
              </span>
            </div>
            <h2>
              {active ? (
                "Sleeping"
              ) : strategy?.windowStart && strategy.windowEnd ? (
                <>
                  <span>
                    {time(strategy.windowStart, child.timezone).replace(
                      / [ap]m/,
                      "",
                    )}
                  </span>
                  <span className="time-dash">–</span>
                  <span>{time(strategy.windowEnd, child.timezone)}</span>
                </>
              ) : strategy?.status === "gentle" ? (
                "Follow their sleep cues"
              ) : strategy?.status === "night" ? (
                "Night sleep"
              ) : (
                "Log a wake or sleep"
              )}
            </h2>
            <p>
              {active
                ? "Finish the sleep timer when they wake."
                : strategy?.nextSleep
                  ? `Start winding down around ${time(strategy.windDownAt, child.timezone)}.`
                  : strategy?.summary ||
                    "Log a wake-up or a sleep to start building your day."}
            </p>
            <Button
              className="hero-button"
              onClick={() => onNavigate("strategy")}
            >
              See your strategy
              <ArrowRight />
            </Button>
          </div>
          <RiverScene />
          <div className="hero-bottom">
            <span>
              <Clock3 size={15} />
              {active
                ? "Sleeping now"
                : strategy?.awakeSince
                  ? `Awake for ${duration((Date.now() - Date.parse(strategy.awakeSince)) / 60000)}`
                  : "Morning wake not logged"}
            </span>
            <span>{strategy?.confidence || "Getting started"}</span>
          </div>
        </section>
        <section className="card day-glance">
          <div className="section-label">
            <Sunrise size={19} />
            <h3>Today, at a glance</h3>
          </div>
          <div className="glance-line">
            <span>Daytime sleep</span>
            <strong>{duration(strategy?.totalNapMinutes || 0)}</strong>
          </div>
          <div className="sleep-progress" aria-hidden="true">
            {Array.from(
              { length: Math.max(1, strategy?.plannedNaps || 3) },
              (_, i) => (
                <span
                  key={i}
                  className={i < (strategy?.completedNaps || 0) ? "filled" : ""}
                />
              ),
            )}
          </div>
          <small>
            {strategy?.completedNaps || 0} naps logged
            {strategy?.plannedNaps
              ? ` · planning for ${strategy.plannedNaps}`
              : ""}
          </small>
          <div className="glance-pair">
            <div>
              <span className="mini-icon peach">
                <ActivityIcon kind="bottle" size={17} />
              </span>
              <strong>{feeding.length}</strong>
              <span>feeds</span>
            </div>
            <div>
              <span className="mini-icon sky">
                <ActivityIcon kind="diaper" size={17} />
              </span>
              <strong>{diapers.length}</strong>
              <span>diapers</span>
            </div>
          </div>
          <div className="glance-bedtime">
            <Moon size={16} />
            <span>Bedtime around</span>
            <strong>{time(strategy?.bedtime, child.timezone)}</strong>
          </div>
        </section>
      </div>
      <section className="quick-section">
        <div className="section-heading">
          <h2>Quick log</h2>
          <button
            className="text-button"
            onClick={() => onNavigate("settings")}
          >
            <SlidersHorizontal size={14} />
            Customize
          </button>
        </div>
        <div className="tracker-grid">
          {child.settings.visibleTrackers.map((kind) => {
            const last = events.find((a) => a.kind === kind);
            return (
              <button
                className="tracker-card"
                key={kind}
                onClick={() => onLog(kind)}
                disabled={quickBusy}
              >
                <span className={`activity-symbol ${kind}`}>
                  <ActivityIcon kind={kind} />
                </span>
                <span>
                  <strong>{quickLabel(kind)}</strong>
                  <small>
                    {last ? relative(last.startedAt) : "No entries yet"}
                  </small>
                </span>
                <Plus size={16} />
              </button>
            );
          })}
          <button
            className="tracker-card more-tracker"
            onClick={onMore}
            disabled={quickBusy}
          >
            <span className="activity-symbol note">
              <Plus />
            </span>
            <span>
              <strong>More trackers</strong>
            </span>
          </button>
        </div>
      </section>
      <div className="dashboard-grid lower">
        <section className="card strategy-preview">
          <div className="section-heading">
            <div className="section-label">
              <Sparkles size={19} />
              <h2>Strategy from here</h2>
            </div>
          </div>
          <h3>{strategy?.headline || "Log a wake or sleep to start"}</h3>
          <p className="muted">
            {strategy?.reasons[0]?.detail ||
              "Start logging to build a plan for the rest of the day."}
          </p>
          <div className="plan-preview">
            {strategy?.steps
              .filter((s) => s.kind !== "wind-down")
              .slice(0, 3)
              .map((s, i) => (
                <div className="preview-step" key={s.id}>
                  <span
                    className={`step-dot ${s.kind === "bedtime" ? "night" : ""}`}
                  >
                    {s.kind === "bedtime" ? <Moon size={14} /> : i + 1}
                  </span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.tentative ? "Tentative" : "Up next"}</small>
                  </div>
                  <b>{time(s.at, child.timezone)}</b>
                </div>
              ))}
          </div>
          <Button
            variant="ghost"
            className="full-width strategy-link"
            onClick={() => onNavigate("strategy")}
          >
            View full strategy
            <ArrowRight />
          </Button>
        </section>
        <section className="card recent-card">
          <div className="section-heading">
            <h2>Recent entries</h2>
            <button
              className="text-button"
              onClick={() => onNavigate("history")}
            >
              View all
              <ArrowRight size={14} />
            </button>
          </div>
          <EntryList child={child} events={todays} onEdit={onEdit} limit={4} />
        </section>
      </div>
      <div className="gentle-footer">
        <span>
          Last sleep{" "}
          {lastSleep ? duration(elapsedMs(lastSleep) / 60000) : "not logged"} ·
          Last feed {relative(lastFeed?.startedAt).toLowerCase()}
        </span>
      </div>
    </>
  );
}

import {
  ArrowRight,
  Plus,
  Moon,
  Sunrise,
  Clock3,
  Check,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
  Play,
  Pause,
  Square,
  CloudMoon,
  CalendarDays,
} from "lucide-react";
import { DateTime } from "luxon";
import { Button } from "./ui/button";
import { RiverScene } from "./brand";
import { ActivityIcon } from "./activity-icon";
import { duration, time, relative, describe } from "../lib/format";
import {
  kindLabels,
  elapsedMs,
  type Activity,
  type Child,
  type ActivityKind,
  type Strategy,
} from "../../shared/types";

export function DayHeader({
  child,
  title,
  subtitle,
  action,
}: {
  child: Child;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          {DateTime.now().setZone(child.timezone).toFormat("cccc, d LLLL")}
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function EntryList({
  events,
  child,
  onEdit,
  limit,
}: {
  events: Activity[];
  child: Child;
  onEdit: (a: Activity) => void;
  limit?: number;
}) {
  const rows = limit ? events.slice(0, limit) : events;
  return rows.length ? (
    <div className="entry-list">
      {rows.map((a) => (
        <button className="entry-row" key={a.id} onClick={() => onEdit(a)}>
          <span className={`activity-symbol ${a.kind}`}>
            <ActivityIcon kind={a.kind} />
          </span>
          <span className="entry-main">
            <strong>{kindLabels[a.kind]}</strong>
            <span>{describe(a)}</span>
            {a.notes && a.kind !== "note" && <small>{a.notes}</small>}
          </span>
          <span className="entry-meta">
            <strong>{time(a.startedAt, child.timezone)}</strong>
            <small>{a.authorName}</small>
          </span>
          <ChevronRight size={15} className="muted" />
        </button>
      ))}
    </div>
  ) : (
    <div className="empty-state compact">
      <CalendarDays size={30} />
      <h3>A fresh page.</h3>
      <p>Log a little moment and it will appear here.</p>
    </div>
  );
}

export function RunningTimers({
  events,
  child,
  onTimer,
}: {
  events: Activity[];
  child: Child;
  onTimer: (a: Activity, action: "pause" | "resume" | "stop") => void;
}) {
  return (
    <div className="running-timers">
      {events
        .filter((a) => a.state !== "complete")
        .map((a) => (
          <div className="running-timer" key={a.id}>
            <span className={`activity-symbol ${a.kind}`}>
              <ActivityIcon kind={a.kind} />
            </span>
            <div>
              <span className="eyebrow">
                {kindLabels[a.kind]}{" "}
                {a.state === "paused" ? "PAUSED" : "IN PROGRESS"}
              </span>
              <strong className="timer-digits">
                {new Date(elapsedMs(a)).toISOString().slice(11, 19)}
              </strong>
              <small>
                Started {time(a.startedAt, child.timezone)} · {a.authorName}
              </small>
            </div>
            <div className="timer-actions">
              {a.kind !== "sleep" && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={
                    a.state === "paused" ? "Resume timer" : "Pause timer"
                  }
                  onClick={() =>
                    onTimer(a, a.state === "paused" ? "resume" : "pause")
                  }
                >
                  {a.state === "paused" ? <Play /> : <Pause />}
                </Button>
              )}
              <Button onClick={() => onTimer(a, "stop")}>
                <Square />
                {a.kind === "sleep" ? "Woke up" : "Finish"}
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}

export function Dashboard({
  child,
  events,
  strategy,
  onLog,
  onEdit,
  onNavigate,
  onTimer,
}: {
  child: Child;
  events: Activity[];
  strategy: Strategy | null;
  onLog: (kind: ActivityKind) => void;
  onEdit: (a: Activity) => void;
  onNavigate: (page: string) => void;
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
      <DayHeader
        child={child}
        title={`A little more rest, ${child.name}.`}
        subtitle="You take care of the little moments. We’ll keep the bigger picture."
        action={
          <Button variant="outline" onClick={() => onLog("wake")}>
            <Sunrise />
            Log morning wake
          </Button>
        }
      />
      <RunningTimers events={events} child={child} onTimer={onTimer} />
      <div className="dashboard-grid">
        <section className="sleep-hero">
          <div className="hero-content">
            <div className="hero-top">
              <span className="eyebrow">
                <Moon size={14} />
                {active
                  ? "A LITTLE TIME TO REST"
                  : next?.kind === "bedtime"
                    ? "TONIGHT’S BEDTIME"
                    : "YOUR NEXT SLEEP WINDOW"}
              </span>
              <span className="live-pill">
                <span />
                Adapts with your day
              </span>
            </div>
            <h2>
              {active ? (
                "Dreaming away."
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
                "One day at a time."
              ) : strategy?.status === "night" ? (
                "A gentler night."
              ) : (
                "Let’s find a rhythm."
              )}
            </h2>
            <p>
              {active
                ? "Finish the sleep timer when they wake. We’ll take it from there."
                : strategy?.nextSleep
                  ? `Start winding down around ${time(strategy.windDownAt, child.timezone)}. A window, not a deadline.`
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
          <h2>Log a little moment</h2>
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
              >
                <span className={`activity-symbol ${kind}`}>
                  <ActivityIcon kind={kind} />
                </span>
                <span>
                  <strong>{kindLabels[kind]}</strong>
                  <small>
                    {last ? relative(last.startedAt) : "Ready when you are"}
                  </small>
                </span>
                <Plus size={16} />
              </button>
            );
          })}
          <button
            className="tracker-card more-tracker"
            onClick={() => onLog("note")}
          >
            <span className="activity-symbol note">
              <Plus />
            </span>
            <span>
              <strong>More to remember</strong>
              <small>Growth, medicine, milestones…</small>
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
            <span className="badge sage">Made for today</span>
          </div>
          <h3>{strategy?.headline || "Every day finds its own rhythm."}</h3>
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
                    <small>
                      {s.tentative
                        ? "Then, if the day follows this rhythm"
                        : "Your next little step"}
                    </small>
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
            The plan, and the reasons behind it
            <ArrowRight />
          </Button>
        </section>
        <section className="card recent-card">
          <div className="section-heading">
            <h2>The day so far</h2>
            <button
              className="text-button"
              onClick={() => onNavigate("history")}
            >
              View all
              <ArrowRight size={14} />
            </button>
          </div>
          <EntryList child={child} events={todays} onEdit={onEdit} limit={4} />
          {todays.length > 0 && (
            <div className="recent-footer">
              <Check size={14} />
              Little details, remembered together.
            </div>
          )}
        </section>
      </div>
      <div className="gentle-footer">
        <span>
          Last sleep{" "}
          {lastSleep ? duration(elapsedMs(lastSleep) / 60000) : "not logged"} ·
          Last feed {relative(lastFeed?.startedAt).toLowerCase()}
        </span>
        <span>Some days are a winding river. That’s okay.</span>
      </div>
    </>
  );
}

export function StrategyView({
  child,
  strategy,
  onLog,
  compare,
  setCompare,
}: {
  child: Child;
  strategy: Strategy | null;
  onLog: (k: ActivityKind) => void;
  compare: number | null;
  setCompare: (n: number | null) => void;
}) {
  if (!strategy) return <div className="loading">Building your plan…</div>;
  return (
    <>
      <DayHeader
        child={child}
        title="A plan for the rest."
        subtitle="The next nap is just the beginning. Here’s how the rest of today could unfold."
        action={
          <Button variant="outline" onClick={() => onLog("skipped_nap")}>
            <CloudMoon />A nap didn’t happen
          </Button>
        }
      />
      <div className="strategy-layout">
        <div>
          <section className="strategy-intro card">
            <span className="badge sage">
              <Sparkles size={13} />
              {compare !== null ? "Preview · not saved" : strategy.confidence}
            </span>
            <h2>{strategy.headline}</h2>
            <p>{strategy.summary}</p>
            <div className="strategy-numbers">
              <div>
                <small>Day sleep so far</small>
                <strong>{duration(strategy.totalNapMinutes)}</strong>
              </div>
              <div>
                <small>Next wake window</small>
                <strong>{duration(strategy.wakeWindowMinutes)}</strong>
              </div>
              <div>
                <small>Bedtime estimate</small>
                <strong>{time(strategy.bedtime, child.timezone)}</strong>
              </div>
            </div>
          </section>
          <section className="card full-plan">
            <div className="section-heading">
              <h2>From now to goodnight</h2>
              <span className="muted">
                {child.timezone.split("/").at(-1)?.replaceAll("_", " ")}
              </span>
            </div>
            {strategy.steps.length ? (
              <div className="plan-timeline">
                {strategy.steps.map((step, i) => (
                  <div
                    className={`plan-step ${step.kind === "bedtime" ? "bedtime-step" : ""}`}
                    key={step.id}
                  >
                    <div className="plan-time">
                      <strong>{time(step.at, child.timezone)}</strong>
                      {step.endAt && (
                        <small>to {time(step.endAt, child.timezone)}</small>
                      )}
                    </div>
                    <div className="plan-node">
                      {step.kind === "bedtime" ? (
                        <Moon size={19} />
                      ) : step.kind === "wind-down" ? (
                        <Sparkles size={18} />
                      ) : (
                        <CloudMoon size={19} />
                      )}
                    </div>
                    <div className="plan-detail">
                      <div>
                        <h3>{step.title}</h3>
                        <span className="badge neutral">
                          {step.tentative
                            ? "Tentative"
                            : i === 0
                              ? "Up next"
                              : "Estimate"}
                        </span>
                      </div>
                      <p>{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Moon />
                <p>{strategy.summary}</p>
              </div>
            )}
            <div className="notice sage">
              <Sparkles size={17} />
              <span>
                Each new sleep, wake-up, or missed nap reshapes this plan. Later
                times are estimates, not appointments.
              </span>
            </div>
          </section>
          <section className="card">
            <h2>If the day takes a turn</h2>
            <div className="contingencies">
              {strategy.alternatives.map((a) => (
                <div key={a.title}>
                  <h3>{a.title}</h3>
                  <p>{a.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside>
          <section className="card reasons-card">
            <span className="eyebrow">THE THINKING BEHIND IT</span>
            <h2>Why this plan?</h2>
            {strategy.reasons.map((r) => (
              <div className="reason" key={r.code}>
                <span>
                  <Check size={14} />
                </span>
                <div>
                  <h3>{r.title}</h3>
                  <p>{r.detail}</p>
                </div>
              </div>
            ))}
          </section>
          <section className="card compare-card">
            <h2>A different kind of day?</h2>
            <p>Compare nap counts without changing your saved routine.</p>
            <div className="nap-options">
              {Array.from(
                new Set([
                  Math.max(0, strategy.plannedNaps - 1),
                  strategy.plannedNaps,
                  Math.min(6, strategy.plannedNaps + 1),
                ]),
              ).map((n) => (
                <button
                  className={compare === n ? "selected" : ""}
                  key={n}
                  onClick={() => setCompare(n)}
                >
                  {n} {n === 1 ? "nap" : "naps"}
                </button>
              ))}
            </div>
            {compare !== null && (
              <button className="text-button" onClick={() => setCompare(null)}>
                Back to your live plan
                <ArrowRight size={14} />
              </button>
            )}
          </section>
          <p className="plan-caveat">{strategy.caveat}</p>
          <p className="plan-caveat">
            Wake windows are adjustable planning defaults, not validated medical
            predictions. No child data is sent to an AI provider.
          </p>
        </aside>
      </div>
    </>
  );
}

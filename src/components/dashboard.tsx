import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { DateTime } from "luxon";
import type {
  Activity,
  ActivityKind,
  Child,
  Strategy,
} from "../../shared/types";
import { duration, time } from "../lib/format";
import type { Page } from "../lib/navigation";
import { ActivityIcon } from "./activity-icon";
import { EntryList } from "./entry-list";
import { PageHeader } from "./page-header";
import { PlanPreviewNotice } from "./plan-preview-notice";
import { RunningTimers } from "./running-timers";

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
  compare,
  setCompare,
  online,
}: {
  child: Child;
  events: Activity[];
  strategy: Strategy | null;
  onLog: (kind: ActivityKind) => void;
  quickLabel: (kind: ActivityKind) => string;
  quickBusy: boolean;
  compare: number | null;
  setCompare: (count: number | null) => void;
  online: boolean;
  onEdit: (a: Activity) => void;
  onNavigate: (page: Page) => void;
  onTimer: (a: Activity, action: "pause" | "resume" | "stop") => void;
}) {
  const today = DateTime.now().setZone(child.timezone).startOf("day");
  const todays = events.filter((a) => DateTime.fromISO(a.startedAt) >= today);
  const feeds = todays.filter((a) =>
    ["nursing", "bottle", "solids"].includes(a.kind),
  ).length;
  const diapers = todays.filter((a) => a.kind === "diaper").length;
  const sleeping = events.some(
    (a) => a.kind === "sleep" && a.state !== "complete",
  );
  const next = strategy?.steps.find(
    (s) => s.kind === "nap" || s.kind === "bedtime",
  );

  return (
    <>
      <PageHeader child={child} title={`${child.name}’s day`} />
      <PlanPreviewNotice
        compare={compare}
        strategy={strategy}
        online={online}
        onReturnToLive={() => setCompare(null)}
      />
      {!sleeping && (
        <section className="sleep-overview">
          <div>
            <span className="sleep-label">{next?.title || "Next sleep"}</span>
            <h2>
              {strategy?.nextSleep
                ? time(strategy.nextSleep, child.timezone)
                : strategy?.headline || "Log a wake or sleep"}
            </h2>
            {strategy?.windDownAt && (
              <span className="muted">
                Wind down {time(strategy.windDownAt, child.timezone)}
              </span>
            )}
          </div>
          <button
            className="text-button"
            onClick={() => onNavigate("strategy")}
          >
            Plan <ArrowRight size={16} />
          </button>
        </section>
      )}
      <RunningTimers
        events={events}
        child={child}
        onTimer={onTimer}
        onEdit={onEdit}
        disabled={quickBusy}
      />
      <div className="today-totals" aria-label="Today's totals">
        <span>
          <strong>{duration(strategy?.totalNapMinutes || 0)}</strong> naps
        </span>
        <span>
          <strong>{feeds}</strong> feeds
        </span>
        <span>
          <strong>{diapers}</strong> diapers
        </span>
        {strategy?.bedtime && (
          <span>
            Bed <strong>{time(strategy.bedtime, child.timezone)}</strong>
          </span>
        )}
      </div>
      <section className="recent-entries">
        <div className="section-heading">
          <h2>Recent entries</h2>
          <button className="text-button" onClick={() => onNavigate("history")}>
            Journal <ArrowRight size={16} />
          </button>
        </div>
        <EntryList
          child={child}
          events={events}
          onEdit={onEdit}
          limit={10}
          groupByDay
        />
      </section>
      <details className="disclosure home-trackers">
        <summary>Trackers</summary>
        <div className="tracker-buttons">
          {child.settings.visibleTrackers.map((kind) => (
            <button key={kind} onClick={() => onLog(kind)} disabled={quickBusy}>
              <ActivityIcon kind={kind} size={18} />
              {quickLabel(kind)}
            </button>
          ))}
        </div>
        <button className="text-button" onClick={() => onNavigate("settings")}>
          <SlidersHorizontal size={14} /> Customize
        </button>
      </details>
    </>
  );
}

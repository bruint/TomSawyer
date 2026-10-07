import { DateTime } from "luxon";
import { Moon } from "lucide-react";
import { duration, time } from "../lib/format";
import type { DailyReport } from "../lib/report-data";
import type { Activity, Child } from "../../shared/types";

export function SleepChart({
  view,
  data,
  events,
  child,
}: {
  view: "summary" | "week";
  data: DailyReport[];
  events: Activity[];
  child: Child;
}) {
  const range = data.length;
  const hasSleep = data.some((day) => day.nap || day.night);
  return view === "summary" ? (
    <section className="card chart-card">
      <div className="section-heading">
        <div>
          <h2>Daily sleep</h2>
          <p className="muted">
            Hours of sleep actually logged. Today may be incomplete.
          </p>
        </div>
        <div className="chart-legend">
          <span>
            <i className="night" />
            Night
          </span>
          <span>
            <i className="nap" />
            Naps
          </span>
        </div>
      </div>
      {hasSleep ? (
        <>
          <div className="bar-chart">
            {data.map((d) => (
              <div
                className="bar-column"
                key={d.day.toISODate()}
                title={`${d.day.toFormat("d LLL")}: ${duration(d.nap + d.night)}`}
              >
                <div className="bar-track">
                  <div
                    className="bar-nap"
                    style={{ height: `${(d.nap / 1080) * 100}%` }}
                  />
                  <div
                    className="bar-night"
                    style={{ height: `${(d.night / 1080) * 100}%` }}
                  />
                </div>
                <span>{range > 14 ? d.day.day : d.day.toFormat("ccc")}</span>
                <small>{range <= 14 ? d.day.day : ""}</small>
              </div>
            ))}
          </div>
          <div className="chart-axis">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Moon />
          <h3>No sleep logged</h3>
        </div>
      )}
    </section>
  ) : (
    <section className="card week-card">
      <h2>Weekly sleep</h2>
      <p className="muted">
        Sleep blocks in {child.timezone}. Scroll sideways on a small screen.
      </p>
      <div className="week-scroll">
        <div className="week-chart">
          <div className="week-axis">
            {[0, 4, 8, 12, 16, 20, 24].map((h) => (
              <span key={h} style={{ top: `${(h / 24) * 100}%` }}>
                {String(h % 24).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {data.slice(-7).map((d) => (
            <div className="week-day" key={d.day.toISODate()}>
              <strong>{d.day.toFormat("ccc d")}</strong>
              {events
                .filter(
                  (a) =>
                    a.kind === "sleep" &&
                    a.endedAt &&
                    DateTime.fromISO(a.startedAt) < d.day.plus({ days: 1 }) &&
                    DateTime.fromISO(a.endedAt) > d.day,
                )
                .map((a) => {
                  const total = d.day
                    .plus({ days: 1 })
                    .diff(d.day, "minutes").minutes;
                  const from = Math.max(
                      0,
                      DateTime.fromISO(a.startedAt).diff(d.day, "minutes")
                        .minutes,
                    ),
                    to = Math.min(
                      total,
                      DateTime.fromISO(a.endedAt!).diff(d.day, "minutes")
                        .minutes,
                    );
                  return (
                    <div
                      key={a.id}
                      className={`sleep-block ${a.details.sleepType === "night" ? "night" : "nap"}`}
                      title={`${time(a.startedAt, child.timezone)} – ${time(a.endedAt, child.timezone)}`}
                      style={{
                        top: `${(from / total) * 100}%`,
                        height: `${Math.max(0.5, ((to - from) / total) * 100)}%`,
                      }}
                    />
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

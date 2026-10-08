import { SleepChart } from "./sleep-chart";
import { buildDailyReport } from "../lib/report-data";
import {
  BarChart3,
  CalendarDays,
  Download,
  Droplets,
  List,
  Milk,
  Moon,
} from "lucide-react";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { type Activity, type Child } from "../../shared/types";
import { duration } from "../lib/format";
import { PageHeader } from "./page-header";
import { Button } from "./ui/button";
import { Select } from "./ui/field";
import { trackerEnabled } from "../../shared/tracking";

export function ReportsView({
  child,
  events,
}: {
  child: Child;
  events: Activity[];
}) {
  const [range, setRange] = useState(7);
  const [view, setView] = useState<"summary" | "week">("summary");
  const enabled = (kind: Activity["kind"]) => trackerEnabled(child, kind);
  const feedsEnabled =
    enabled("nursing") || enabled("bottle") || enabled("solids");
  const visibleEvents = useMemo(
    () => events.filter((entry) => trackerEnabled(child, entry.kind)),
    [events, child.settings.visibleTrackers],
  );
  const start = DateTime.now()
    .setZone(child.timezone)
    .startOf("day")
    .minus({ days: range - 1 });
  const data = useMemo(
    () => buildDailyReport(visibleEvents, start, range),
    [visibleEvents, range, start.toISODate()],
  );
  const measured = data.filter((d) => d.logged.length || d.nap || d.night);
  const sleepDays = data.filter((d) => d.nap || d.night);
  const averageSleep = sleepDays.length
    ? sleepDays.reduce((s, d) => s + d.nap + d.night, 0) / sleepDays.length
    : 0;
  const sum = (k: "feeds" | "diapers") => data.reduce((s, d) => s + d[k], 0);
  const solids = events.filter(
    (a) => a.kind === "solids" && DateTime.fromISO(a.startedAt) >= start,
  );
  const growth = events
    .filter((a) => a.kind === "growth" && Number(a.details.weight) > 0)
    .slice(0, 10)
    .reverse();
  const milestones = events.filter((a) => a.kind === "milestone");
  return (
    <>
      <PageHeader
        child={child}
        title="Patterns"

        action={
          <Button variant="outline" asChild>
            <a href={`/api/children/${child.id}/export?format=csv`}>
              <Download />
              Export CSV
            </a>
          </Button>
        }
      />
      <div className="report-controls">
        <div className="segmented">
          <button
            className={view === "summary" ? "selected" : ""}
            onClick={() => setView("summary")}
          >
            <BarChart3 size={15} />
            Summary
          </button>
          <button
            className={view === "week" ? "selected" : ""}
            onClick={() => setView("week")}
          >
            <CalendarDays size={15} />
            Week view
          </button>
        </div>
        <Select
          aria-label="Reporting period"
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </Select>
      </div>
      <div className="report-stats">
        {enabled("sleep") && (
          <div className="card">
            <Moon size={21} />
            <small>Average logged sleep</small>
            <strong>{sleepDays.length ? duration(averageSleep) : "—"}</strong>
            <span>across {sleepDays.length} days with sleep</span>
          </div>
        )}
        {feedsEnabled && (
          <div className="card">
            <Milk size={21} />
            <small>Feeds recorded</small>
            <strong>{sum("feeds")}</strong>
          </div>
        )}
        {enabled("diaper") && (
          <div className="card">
            <Droplets size={21} />
            <small>Diaper changes</small>
            <strong>{sum("diapers")}</strong>
          </div>
        )}
        <div className="card">
          <List size={21} />
          <small>Days with entries</small>
          <strong>
            {measured.length}
            <em> / {range}</em>
          </strong>
        </div>
      </div>
      {enabled("sleep") && (
        <SleepChart view={view} data={data} events={events} child={child} />
      )}
      <div className="report-grid">
        <section className="card">
          <h2>Daily totals</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  {enabled("sleep") && <th>Sleep</th>}
                  {feedsEnabled && <th>Feeds</th>}
                  {enabled("diaper") && <th>Diapers</th>}
                </tr>
              </thead>
              <tbody>
                {data
                  .slice()
                  .reverse()
                  .map((d) => (
                    <tr key={d.day.toISODate()}>
                      <td>{d.day.toFormat("ccc, d LLL")}</td>
                      {enabled("sleep") && (
                        <td>
                          {d.nap + d.night ? duration(d.nap + d.night) : "—"}
                        </td>
                      )}
                      {feedsEnabled && (
                        <td>{d.logged.length ? d.feeds : "—"}</td>
                      )}
                      {enabled("diaper") && (
                        <td>{d.logged.length ? d.diapers : "—"}</td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        {enabled("solids") && (
          <section className="card">
            <h2>Foods & reactions</h2>
            {solids.length ? (
              <div className="food-list">
                {solids.slice(0, 8).map((a) => (
                  <div key={a.id}>
                    <span>
                      <strong>{String(a.details.food || "Meal")}</strong>
                      <small>
                        {a.details.allergens
                          ? `Allergens noted: ${a.details.allergens}`
                          : "No allergens noted"}
                      </small>
                    </span>
                    <span
                      className={`badge ${a.details.reaction === "Possible reaction" ? "peach" : "sage"}`}
                    >
                      {String(a.details.reaction || "Tried")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <p>No solids logged.</p>
              </div>
            )}
            <p className="form-hint">
              Food reactions are caregiver observations. This report does not
              diagnose allergies.
            </p>
          </section>
        )}
      </div>
      <div className="report-grid">
        {enabled("growth") && (
          <section className="card">
            <h2>Growth</h2>
            {growth.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Weight</th>
                    <th>Length</th>
                    <th>Head</th>
                  </tr>
                </thead>
                <tbody>
                  {growth.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {DateTime.fromISO(a.startedAt)
                          .setZone(child.timezone)
                          .toFormat("d LLL")}
                      </td>
                      <td>
                        {String(a.details.weight)}{" "}
                        {String(a.details.weightUnit || "kg")}
                      </td>
                      <td>
                        {a.details.height
                          ? `${a.details.height} ${a.details.lengthUnit || "cm"}`
                          : "—"}
                      </td>
                      <td>
                        {a.details.head
                          ? `${a.details.head} ${a.details.lengthUnit || "cm"}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state compact">
                <p>No growth measurements logged.</p>
              </div>
            )}
          </section>
        )}
        {enabled("milestone") && (
          <section className="card">
            <h2>Milestones</h2>
            {milestones.length ? (
              <div className="milestone-list">
                {milestones.slice(0, 6).map((a) => (
                  <div key={a.id}>
                    {a.details.photoId && (
                      <img
                        src={`/api/photos/${a.details.photoId}`}
                        alt={String(a.details.title || "Milestone")}
                      />
                    )}
                    <span>
                      <strong>
                        {String(a.details.title || "A milestone")}
                      </strong>
                      <small>
                        {DateTime.fromISO(a.startedAt)
                          .setZone(child.timezone)
                          .toFormat("d LLL yyyy")}
                      </small>
                      <p>{a.notes}</p>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <p>No milestones logged.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Moon,
  Milk,
  Droplets,
  CalendarDays,
  List,
  BarChart3,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./log-dialog";
import { DayHeader, EntryList } from "./dashboard";
import {
  elapsedMs,
  kindLabels,
  type Activity,
  type Child,
} from "../../shared/types";
import { duration, time } from "../lib/format";

export function HistoryView({
  child,
  events,
  onEdit,
  onLog,
}: {
  child: Child;
  events: Activity[];
  onEdit: (a: Activity) => void;
  onLog: () => void;
}) {
  const [date, setDate] = useState(
    DateTime.now().setZone(child.timezone).toISODate()!,
  );
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const filtered = events.filter(
    (a) =>
      (all ||
        DateTime.fromISO(a.startedAt).setZone(child.timezone).toISODate() ===
          date) &&
      (kind === "all" || a.kind === kind) &&
      JSON.stringify([a.notes, a.details, a.authorName])
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const day = DateTime.fromISO(date, { zone: child.timezone });
  const groups = new Map<string, Activity[]>();
  for (const a of filtered) {
    const key = DateTime.fromISO(a.startedAt)
      .setZone(child.timezone)
      .toISODate()!;
    groups.set(key, [...(groups.get(key) || []), a]);
  }
  return (
    <>
      <DayHeader
        child={child}
        title="The little details."
        subtitle="A shared memory of the day. Tap any entry to make a correction."
        action={<Button onClick={onLog}>Add an entry</Button>}
      />
      <section className="card history-card">
        <div className="history-toolbar">
          <div className="date-controls">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous day"
              onClick={() => {
                setDate(day.minus({ days: 1 }).toISODate()!);
                setAll(false);
              }}
            >
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              aria-label="Activity date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setAll(false);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next day"
              onClick={() => {
                setDate(day.plus({ days: 1 }).toISODate()!);
                setAll(false);
              }}
            >
              <ChevronRight />
            </Button>
          </div>
          <Select
            aria-label="Activity category"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All activities</option>
            {Object.entries(kindLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </Select>
          <div className="search-field">
            <Search size={17} />
            <Input
              aria-label="Search entries"
              placeholder="Search notes, food, caregiver…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="history-day-label">
          <h2>{all ? "Recent history" : day.toFormat("cccc, d LLLL")}</h2>
          <button className="text-button" onClick={() => setAll(!all)}>
            {all ? "Show selected day" : "Show last 90 days"}
          </button>
        </div>
        {filtered.length ? (
          Array.from(groups).map(([date, rows]) => (
            <div key={date}>
              {all && (
                <div className="history-group-label">
                  {DateTime.fromISO(date).toFormat("ccc, d LLL")}
                </div>
              )}
              <EntryList child={child} events={rows} onEdit={onEdit} />
            </div>
          ))
        ) : (
          <div className="empty-state">
            <CalendarDays size={34} />
            <h3>No moments logged here yet.</h3>
            <p>Choose another day, adjust the filters, or add an entry.</p>
            <Button variant="outline" onClick={onLog}>
              Log a moment
            </Button>
          </div>
        )}
        <div className="card-footer muted">
          {filtered.length} entries · All times in {child.timezone}
        </div>
      </section>
    </>
  );
}

export function ReportsView({
  child,
  events,
}: {
  child: Child;
  events: Activity[];
}) {
  const [range, setRange] = useState(7);
  const [view, setView] = useState<"summary" | "week">("summary");
  const start = DateTime.now()
    .setZone(child.timezone)
    .startOf("day")
    .minus({ days: range - 1 });
  const data = useMemo(
    () =>
      Array.from({ length: range }, (_, i) => {
        const day = start.plus({ days: i }),
          end = day.plus({ days: 1 });
        const logged = events.filter(
          (a) =>
            DateTime.fromISO(a.startedAt) >= day &&
            DateTime.fromISO(a.startedAt) < end,
        );
        let nap = 0,
          night = 0;
        for (const a of events.filter((a) => a.kind === "sleep" && a.endedAt)) {
          const lo = Math.max(Date.parse(a.startedAt), day.toMillis()),
            hi = Math.min(Date.parse(a.endedAt!), end.toMillis());
          if (hi > lo) {
            if (a.details.sleepType === "night") night += (hi - lo) / 60000;
            else nap += (hi - lo) / 60000;
          }
        }
        return {
          day,
          logged,
          nap,
          night,
          feeds: logged.filter((a) =>
            ["bottle", "nursing", "solids"].includes(a.kind),
          ).length,
          diapers: logged.filter((a) => a.kind === "diaper").length,
        };
      }),
    [events, range, start.toISODate()],
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
      <DayHeader
        child={child}
        title="See their little patterns."
        subtitle="A clearer picture of what you’ve logged, with room for the days you haven’t."
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
        <div className="card">
          <Moon size={21} />
          <small>Average logged sleep</small>
          <strong>{sleepDays.length ? duration(averageSleep) : "—"}</strong>
          <span>across {sleepDays.length} days with sleep</span>
        </div>
        <div className="card">
          <Milk size={21} />
          <small>Feeds recorded</small>
          <strong>{sum("feeds")}</strong>
          <span>nursing, bottles & solids</span>
        </div>
        <div className="card">
          <Droplets size={21} />
          <small>Diaper changes</small>
          <strong>{sum("diapers")}</strong>
          <span>over the last {range} days</span>
        </div>
        <div className="card">
          <List size={21} />
          <small>Days with entries</small>
          <strong>
            {measured.length}
            <em> / {range}</em>
          </strong>
          <span>blank days aren’t treated as zero</span>
        </div>
      </div>
      {view === "summary" ? (
        <section className="card chart-card">
          <div className="section-heading">
            <div>
              <h2>Sleep, day by day</h2>
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
          {sleepDays.length ? (
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
                    <span>
                      {range > 14 ? d.day.day : d.day.toFormat("ccc")}
                    </span>
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
              <h3>Patterns take a few little days.</h3>
              <p>Your sleep chart will grow with your logs.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="card week-card">
          <h2>A week at a glance</h2>
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
                        DateTime.fromISO(a.startedAt) <
                          d.day.plus({ days: 1 }) &&
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
      )}
      <div className="report-grid">
        <section className="card">
          <h2>The week in numbers</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Sleep</th>
                  <th>Feeds</th>
                  <th>Diapers</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .slice()
                  .reverse()
                  .map((d) => (
                    <tr key={d.day.toISODate()}>
                      <td>{d.day.toFormat("ccc, d LLL")}</td>
                      <td>
                        {d.nap + d.night ? duration(d.nap + d.night) : "—"}
                      </td>
                      <td>{d.logged.length ? d.feeds : "—"}</td>
                      <td>{d.logged.length ? d.diapers : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>A little taste of everything</h2>
          <p className="muted">Foods tried and reactions you recorded.</p>
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
              <p>Log solids to remember favourites and possible reactions.</p>
            </div>
          )}
          <p className="form-hint">
            Food reactions are caregiver observations. This report does not
            diagnose allergies.
          </p>
        </section>
      </div>
      <div className="report-grid">
        <section className="card">
          <h2>Growing, little by little</h2>
          <p className="muted">
            Recorded measurements, without inferred percentiles.
          </p>
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
              <p>Add a growth entry to start their record.</p>
            </div>
          )}
        </section>
        <section className="card">
          <h2>Firsts worth remembering</h2>
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
                    <strong>{String(a.details.title || "A milestone")}</strong>
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
              <p>First smiles, first steps, and your own little firsts.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

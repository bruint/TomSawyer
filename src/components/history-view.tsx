import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { DateTime } from "luxon";
import { useState } from "react";
import { kindLabels, type Activity, type Child } from "../../shared/types";
import { EntryList } from "./entry-list";
import { PageHeader } from "./page-header";
import { Button } from "./ui/button";
import { Select } from "./ui/field";
import { Input } from "./ui/input";

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
      <PageHeader
        child={child}
        title="Journal"

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

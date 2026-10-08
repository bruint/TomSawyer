import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { DateTime } from "luxon";
import { useState } from "react";
import { kindLabels, type Activity, type Child } from "../../shared/types";
import { useHistoryDay } from "../hooks/use-history-day";
import { EntryList } from "./entry-list";
import { PageHeader } from "./page-header";
import { Button } from "./ui/button";
import { Select } from "./ui/field";
import { Input } from "./ui/input";
import { trackerEnabled } from "../../shared/tracking";

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
  const today = DateTime.now().setZone(child.timezone).toISODate()!;
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const history = useHistoryDay(child, events, date);
  const day = date
    ? DateTime.fromISO(date, { zone: child.timezone })
    : DateTime.now().setZone(child.timezone);
  const filtered = history.entries.filter(
    (a) =>
      trackerEnabled(child, a.kind) &&
      (kind === "all" || a.kind === kind) &&
      JSON.stringify([kindLabels[a.kind], a.notes, a.details, a.authorName])
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        child={child}
        title="Journal"
        action={
          <Button onClick={onLog}>
            <Plus />
            Add entry
          </Button>
        }
      />
      <section className="journal">
        <div className="journal-filters">
          <div className="search-field">
            <Search size={17} />
            <Input
              aria-label="Search entries"
              placeholder="Search entries"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select
            aria-label="Activity category"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All activities</option>
            {Object.entries(kindLabels)
              .filter(([kind]) =>
                trackerEnabled(child, kind as Activity["kind"]),
              )
              .map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
          </Select>
          <div className="journal-date-controls">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous day"
              onClick={() => setDate(day.minus({ days: 1 }).toISODate()!)}
            >
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              aria-label="Activity date"
              value={date}
              max={DateTime.now().setZone(child.timezone).toISODate()!}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next day"
              disabled={
                !date ||
                day.startOf("day") >=
                  DateTime.now().setZone(child.timezone).startOf("day")
              }
              onClick={() => setDate(day.plus({ days: 1 }).toISODate()!)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="journal-heading">
          <h2>{date ? day.toFormat("cccc, d LLLL yyyy") : "Recent history"}</h2>
          <div className="journal-date-actions">
            {date !== today && (
              <button className="text-button" onClick={() => setDate(today)}>
                Today
              </button>
            )}
            {date && (
              <button className="text-button" onClick={() => setDate("")}>
                All recent entries
              </button>
            )}
          </div>
        </div>
        {history.loading ? (
          <div className="loading">Loading entries…</div>
        ) : history.error ? (
          <div className="history-error">
            <p>{history.error}</p>
            <Button variant="outline" onClick={history.retry}>
              Try again
            </Button>
          </div>
        ) : (
          <EntryList
            child={child}
            events={filtered}
            onEdit={onEdit}
            groupByDay={!date}
          />
        )}
      </section>
    </>
  );
}

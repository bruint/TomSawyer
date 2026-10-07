import { CalendarDays, ChevronRight } from "lucide-react";
import { kindLabels, type Activity, type Child } from "../../shared/types";
import { describe, time } from "../lib/format";
import { ActivityIcon } from "./activity-icon";

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
      <h3>No entries yet</h3>
    </div>
  );
}

import { CalendarDays, ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import { Fragment } from "react";
import { kindLabels, type Activity, type Child } from "../../shared/types";
import { describe, time } from "../lib/format";
import { ActivityIcon } from "./activity-icon";

export function EntryList({
  events,
  child,
  onEdit,
  limit,
  groupByDay = false,
}: {
  events: Activity[];
  child: Child;
  onEdit: (a: Activity) => void;
  limit?: number;
  groupByDay?: boolean;
}) {
  const rows = limit ? events.slice(0, limit) : events;
  const today = DateTime.now().setZone(child.timezone).startOf("day");
  let previousDay = "";
  if (!rows.length)
    return (
      <div className="empty-state compact">
        <CalendarDays size={30} />
        <h3>No entries</h3>
      </div>
    );
  return (
    <div className="entry-list">
      {rows.map((a) => {
        const day = DateTime.fromISO(a.startedAt)
          .setZone(child.timezone)
          .startOf("day");
        const date = day.toISODate()!;
        const showDate = groupByDay && date !== previousDay;
        previousDay = date;
        const label = day.equals(today)
          ? "Today"
          : day.equals(today.minus({ days: 1 }))
            ? "Yesterday"
            : day.toFormat("ccc, d LLL yyyy");
        return (
          <Fragment key={a.id}>
            {showDate && <h3 className="entry-date">{label}</h3>}
            <button className="entry-row" onClick={() => onEdit(a)}>
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
                {a.kind === "sleep" && (
                  <span>
                    {a.endedAt
                      ? `– ${time(a.endedAt, child.timezone)}`
                      : "Ongoing"}
                  </span>
                )}
                <small>{a.authorName}</small>
              </span>
              <ChevronRight size={16} className="muted" />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

import { DateTime } from "luxon";
import type { Activity } from "../../shared/types";

export interface DailyReport {
  day: DateTime;
  logged: Activity[];
  nap: number;
  night: number;
  feeds: number;
  diapers: number;
}

export function buildDailyReport(
  events: Activity[],
  start: DateTime,
  days: number,
): DailyReport[] {
  const completedSleep = events.filter(
    (activity) => activity.kind === "sleep" && activity.endedAt,
  );
  return Array.from({ length: days }, (_, index) => {
    const day = start.plus({ days: index });
    const end = day.plus({ days: 1 });
    const logged = events.filter((activity) => {
      const startedAt = DateTime.fromISO(activity.startedAt);
      return startedAt >= day && startedAt < end;
    });
    let nap = 0;
    let night = 0;
    for (const sleep of completedSleep) {
      // Allocate overnight sessions to each local day they overlap.
      const overlapStart = Math.max(
        Date.parse(sleep.startedAt),
        day.toMillis(),
      );
      const overlapEnd = Math.min(Date.parse(sleep.endedAt!), end.toMillis());
      const minutes = Math.max(0, overlapEnd - overlapStart) / 60000;
      if (sleep.details.sleepType === "night") night += minutes;
      else nap += minutes;
    }
    return {
      day,
      logged,
      nap,
      night,
      feeds: logged.filter((activity) =>
        ["bottle", "nursing", "solids"].includes(activity.kind),
      ).length,
      diapers: logged.filter((activity) => activity.kind === "diaper").length,
    };
  });
}

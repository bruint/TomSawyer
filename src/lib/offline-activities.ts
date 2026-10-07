import type {
  Activity,
  ActivityInput,
  Strategy,
  User,
} from "../../shared/types";

export interface PendingActivity {
  userId: string;
  childId: string;
  body: ActivityInput;
}

export interface ChildCache {
  events: Activity[];
  strategy: Strategy;
}

export function mergePendingActivities(
  saved: Activity[],
  pending: PendingActivity[],
  childId: string,
  user: Pick<User, "id" | "name">,
): Activity[] {
  const savedIds = new Set(saved.map((activity) => activity.id));
  const unsynced = pending
    .filter(
      (item) =>
        item.userId === user.id &&
        item.childId === childId &&
        !savedIds.has(item.body.id),
    )
    .map(({ body }): Activity => ({
      ...body,
      childId,
      createdBy: user.id,
      authorName: user.name,
      version: 1,
      pausedAt: null,
      createdAt: body.startedAt,
      updatedAt: body.startedAt,
    }));
  return [...saved, ...unsynced].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export function downloadPendingActivities(pending: PendingActivity[]) {
  const blob = new Blob(
    [JSON.stringify({ activities: pending.map((item) => item.body) }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tomsawyer-unsynced.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

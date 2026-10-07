import { Bell, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { kindLabels, type Child, type Reminder } from "../../../shared/types";
import { api, put, remove } from "../../lib/api";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { ReminderDialog } from "./reminder-dialog";

export function RemindersCard({ child }: { child: Child }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderDialog, setReminderDialog] = useState<Reminder | true | null>(
    null,
  );
  const refreshReminders = useCallback(async () => {
    setReminders(await api<Reminder[]>(`/children/${child.id}/reminders`));
  }, [child.id]);
  useEffect(() => {
    void refreshReminders().catch((error) => toast.error(error.message));
  }, [refreshReminders]);
  async function toggleReminder(reminder: Reminder, enabled: boolean) {
    try {
      await put(`/children/${child.id}/reminders/${reminder.id}`, {
        ...reminder,
        enabled,
      });
      await refreshReminders();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function deleteReminder(reminder: Reminder) {
    try {
      await remove(`/children/${child.id}/reminders/${reminder.id}`);
      await refreshReminders();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  return (
    <>
      <section className="settings-section">
        <div className="section-heading">
          <h2>{child.name}’s reminders</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReminderDialog(true)}
          >
            <Plus />
            Add
          </Button>
        </div>
        {reminders.length ? (
          reminders.map((r) => (
            <div className="reminder-row" key={r.id}>
              <button
                className="reminder-main"
                onClick={() => setReminderDialog(r)}
              >
                <strong>{r.title}</strong>
                <span>
                  {r.mode === "clock"
                    ? `At ${r.atTime}`
                    : `${r.intervalMinutes} min after ${kindLabels[r.kind].toLowerCase()}`}
                </span>
                <small>
                  {r.weekdays.length === 7
                    ? "Every day"
                    : r.weekdays
                        .map(
                          (d) =>
                            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                              d - 1
                            ],
                        )
                        .join(", ")}
                  {r.daytimeOnly ? " · daytime only" : ""}
                </small>
              </button>
              <Switch
                aria-label={`Enable ${r.title}`}
                checked={r.enabled}
                onCheckedChange={(enabled) => toggleReminder(r, enabled)}
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${r.title}`}
                onClick={() => deleteReminder(r)}
              >
                <Trash2 />
              </Button>
            </div>
          ))
        ) : (
          <div className="empty-state compact">
            <Bell />
            <h3>No reminders yet</h3>
          </div>
        )}
      </section>
      {reminderDialog && (
        <ReminderDialog
          child={child}
          reminder={reminderDialog === true ? undefined : reminderDialog}
          onClose={() => setReminderDialog(null)}
          onSaved={refreshReminders}
        />
      )}
    </>
  );
}

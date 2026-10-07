import { useState } from "react";
import { toast } from "sonner";
import type { Child } from "../../../shared/types";
import {
  activityKinds,
  kindLabels,
  type Reminder,
} from "../../../shared/types";
import { post, put } from "../../lib/api";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Field, Select } from "../ui/field";
import { Input } from "../ui/input";

export function ReminderDialog({
  child,
  reminder,
  onClose,
  onSaved,
}: {
  child: Child;
  reminder?: Reminder;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState(reminder?.mode || "interval");
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(reminder?.weekdays || [1, 2, 3, 4, 5, 6, 7]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const body = {
        title: d.title,
        kind: d.kind,
        mode,
        atTime: d.atTime || "09:00",
        intervalMinutes: Number(d.intervalMinutes || 180),
        weekdays: days,
        daytimeOnly: d.daytimeOnly === "on",
        enabled: reminder?.enabled ?? true,
      };
      if (reminder)
        await put(`/children/${child.id}/reminders/${reminder.id}`, body);
      else await post(`/children/${child.id}/reminders`, body);
      await onSaved();
      onClose();
      toast.success("Reminder saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {reminder ? "Edit reminder" : "Add reminder"}
          </DialogTitle>
          <DialogDescription>
            Shared with your family’s enabled devices. Times follow{" "}
            {child.timezone}.
          </DialogDescription>
        </DialogHeader>
        <form className="form-stack" onSubmit={submit}>
          <Field label="Reminder name">
            <Input
              name="title"
              defaultValue={reminder?.title}
              required
              placeholder="Time for a bottle"
              maxLength={100}
            />
          </Field>
          <Field label="Activity">
            <Select name="kind" defaultValue={reminder?.kind || "bottle"}>
              {activityKinds
                .filter((k) => !["skipped_nap", "wake"].includes(k))
                .map((k) => (
                  <option value={k} key={k}>
                    {kindLabels[k]}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="segmented">
            <button
              className={mode === "interval" ? "selected" : ""}
              type="button"
              onClick={() => setMode("interval")}
            >
              After last entry
            </button>
            <button
              className={mode === "clock" ? "selected" : ""}
              type="button"
              onClick={() => setMode("clock")}
            >
              At a time
            </button>
          </div>
          {mode === "interval" ? (
            <Field
              label="Minutes after the last entry"
              hint="Counts from the start of the most recent activity. Sent once until you log another."
            >
              <Input
                name="intervalMinutes"
                type="number"
                min={5}
                max={10080}
                defaultValue={reminder?.intervalMinutes || 180}
                required
              />
            </Field>
          ) : (
            <Field label="Time of day">
              <Input
                name="atTime"
                type="time"
                required
                defaultValue={reminder?.atTime || "09:00"}
              />
            </Field>
          )}
          <div className="field">
            <span>Days</span>
            <div className="weekday-picker">
              {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => (
                <button
                  type="button"
                  key={i}
                  aria-label={
                    [
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ][i]
                  }
                  aria-pressed={days.includes(i + 1)}
                  className={days.includes(i + 1) ? "selected" : ""}
                  onClick={() =>
                    setDays(
                      days.includes(i + 1)
                        ? days.filter((d) => d !== i + 1)
                        : [...days, i + 1],
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="daytimeOnly"
              defaultChecked={reminder?.daytimeOnly}
            />
            Only between usual wake time and bedtime
          </label>
          <div className="notice">
            Reminders follow times you choose. They don’t determine when
            medication, feeding, or medical care is needed.
          </div>
          <div className="dialog-footer">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy || !days.length}>Save reminder</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

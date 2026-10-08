import { Loader2, Play, Save, Trash2 } from "lucide-react";
import { DateTime } from "luxon";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  activityKinds,
  kindLabels,
  type Activity,
  type ActivityInput,
  type ActivityKind,
  type Child,
  type Details,
} from "../../shared/types";
import { post } from "../lib/api";
import { ActivityFields } from "./activity-fields";
import { ActivityIcon } from "./activity-icon";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, Select } from "./ui/field";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { trackerEnabled } from "../../shared/tracking";

const timed = ["sleep", "nursing", "pumping", "activity", "contraction"];

export function LogDialog({
  child,
  initialKind,
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  child: Child;
  initialKind: ActivityKind;
  entry?: Activity;
  onClose: () => void;
  onSave: (body: ActivityInput, id?: string) => Promise<void>;
  onDelete?: (entry: Activity) => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [kind, setKind] = useState<ActivityKind>(entry?.kind || initialKind);
  const [mode, setMode] = useState<"complete" | "active">(
    entry?.kind === "sleep" && entry.state !== "complete"
      ? "active"
      : "complete",
  );
  const local = (iso?: string | null) =>
    DateTime.fromISO(iso || new Date().toISOString())
      .setZone(child.timezone)
      .toFormat("yyyy-MM-dd'T'HH:mm");
  const [started, setStarted] = useState(
    local(
      entry?.startedAt ||
        (kind === "sleep"
          ? DateTime.now().minus({ minutes: 30 }).toISO()
          : undefined),
    ),
  );
  const [ended, setEnded] = useState(local(entry?.endedAt));
  const [details, setDetails] = useState<Details>(
    entry?.details || {
      sleepType:
        DateTime.now().setZone(child.timezone).hour >= 18 ? "night" : "nap",
      side: "Left",
      unit: child.settings.units === "metric" ? "ml" : "oz",
      milkType: "Breast milk",
      diaperType: "Wet",
      activityType: "Tummy time",
      weightUnit: child.settings.units === "metric" ? "kg" : "lb",
      lengthUnit: child.settings.units === "metric" ? "cm" : "in",
      result: "Success",
      pottyType: "Pee",
    },
  );
  const [notes, setNotes] = useState(entry?.notes || "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const updateDetail = (key: string, value: string | number) =>
    setDetails((previous) => ({ ...previous, [key]: value }));
  function timestamp(value: string, original?: string | null) {
    // Keep seconds from quick logs when only another field is being edited.
    if (original && value === local(original)) return original;
    return DateTime.fromISO(value, { zone: child.timezone }).toUTC().toISO();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const clean = { ...details };
      if (kind === "temperature" && !["C", "F"].includes(String(clean.unit)))
        clean.unit = child.settings.units === "metric" ? "C" : "F";
      if (
        kind === "medicine" &&
        !["mg", "ml", "drops", "puffs", "other"].includes(String(clean.unit))
      )
        clean.unit = "ml";
      if (kind === "sleep" && !clean.sleepType) clean.sleepType = "nap";
      const startedAt = timestamp(started, entry?.startedAt);
      const endedAt =
        timed.includes(kind) && mode === "complete"
          ? timestamp(ended, entry?.endedAt)
          : null;
      if (
        !startedAt ||
        (timed.includes(kind) && mode === "complete" && !endedAt)
      ) {
        throw new Error("Enter a valid start and end time.");
      }
      const body: ActivityInput = {
        id: entry?.id || crypto.randomUUID(),
        kind,
        startedAt,
        endedAt,
        state: mode,
        pausedMs: entry?.pausedMs || 0,
        details: clean,
        notes,
        version: entry?.version,
      };
      await onSave(body, entry?.id);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadPhoto(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 4 MB.");
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const result = await post<{ id: string }>("/photos", { data });
      updateDetail("photoId", result.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        <DialogHeader>
          <span className={`activity-symbol ${kind}`}>
            <ActivityIcon kind={kind} />
          </span>
          <DialogTitle ref={heading} tabIndex={-1}>
            {entry ? "Edit" : "Log"} {kindLabels[kind].toLowerCase()}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="form-stack">
          {!entry && (
            <Field label="What happened?">
              <Select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as ActivityKind);
                  setMode("complete");
                }}
              >
                {activityKinds
                  .filter((kind) => trackerEnabled(child, kind))
                  .map((k) => (
                    <option value={k} key={k}>
                      {kindLabels[k]}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {timed.includes(kind) && kind !== "sleep" && !entry && (
            <div className="segmented">
              <button
                type="button"
                className={mode === "complete" ? "selected" : ""}
                onClick={() => setMode("complete")}
              >
                Finished
              </button>
              <button
                type="button"
                className={mode === "active" ? "selected" : ""}
                onClick={() => {
                  setMode("active");
                  setStarted(local());
                }}
              >
                Ongoing
              </button>
            </div>
          )}
          <div
            className={
              kind === "sleep" || (timed.includes(kind) && mode === "complete")
                ? "form-row"
                : ""
            }
          >
            <Field label={timed.includes(kind) ? "Started" : "When"}>
              <Input
                type="datetime-local"
                required
                value={started}
                onChange={(e) => setStarted(e.target.value)}
              />
            </Field>
            {kind === "sleep" ? (
              <div className="field">
                <div className="sleep-end-heading">
                  <span>Ended</span>
                  <label className="ongoing-option">
                    <Switch
                      checked={mode === "active"}
                      onCheckedChange={(checked) =>
                        setMode(checked ? "active" : "complete")
                      }
                    />
                    Ongoing
                  </label>
                </div>
                {mode === "complete" && (
                  <Input
                    type="datetime-local"
                    aria-label="Ended"
                    required
                    value={ended}
                    onChange={(e) => setEnded(e.target.value)}
                  />
                )}
              </div>
            ) : (
              timed.includes(kind) &&
              mode === "complete" && (
                <Field label="Ended">
                  <Input
                    type="datetime-local"
                    required
                    value={ended}
                    onChange={(e) => setEnded(e.target.value)}
                  />
                </Field>
              )
            )}
          </div>
          <ActivityFields
            kind={kind}
            details={details}
            units={child.settings.units}
            onChange={updateDetail}
            photoBusy={photoBusy}
            onPhoto={uploadPhoto}
          />
          <Field label="Notes">
            <textarea
              className="input textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={3000}
              required={kind === "note"}
            />
          </Field>
          <div className="dialog-footer">
            {entry && onDelete && (
              <Button
                type="button"
                variant="ghost"
                className="danger-text"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || photoBusy}>
              {busy ? (
                <Loader2 className="spin" />
              ) : mode === "active" && !entry ? (
                <Play />
              ) : (
                <Save />
              )}
              {mode === "active" && !entry ? "Start timer" : "Save"}
            </Button>
          </div>
          {confirmDelete && (
            <div className="notice error">
              <p>Delete this entry?</p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete!(entry!);
                    onClose();
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete entry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Keep it
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Play, Save, Trash2, Camera, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ActivityIcon } from "./activity-icon";
import {
  activityKinds,
  kindLabels,
  type ActivityKind,
  type Child,
  type Activity,
  type Details,
} from "../../shared/types";
import { post } from "../lib/api";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="input" {...props}>
      {children}
    </select>
  );
}
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
  onSave: (body: any, id?: string) => Promise<void>;
  onDelete?: (entry: Activity) => Promise<void>;
}) {
  const [kind, setKind] = useState<ActivityKind>(entry?.kind || initialKind);
  const [mode, setMode] = useState<"complete" | "active">("complete");
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
  const d = (key: string, v: string | number) =>
    setDetails((x) => ({ ...x, [key]: v }));
  const text = (
    key: string,
    label: string,
    placeholder = "",
    required = false,
  ) => (
    <Field label={label}>
      <Input
        value={String(details[key] ?? "")}
        onChange={(e) => d(key, e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </Field>
  );
  const number = (
    key: string,
    label: string,
    unit?: string,
    required = false,
  ) => (
    <Field label={label}>
      <div className="input-unit">
        <Input
          type="number"
          min="0"
          step="any"
          value={String(details[key] ?? "")}
          onChange={(e) =>
            d(key, e.target.value === "" ? "" : Number(e.target.value))
          }
          required={required}
        />
        {unit && <span>{unit}</span>}
      </div>
    </Field>
  );
  const select = (key: string, label: string, values: string[]) => (
    <Field label={label}>
      <Select
        value={String(details[key] || values[0])}
        onChange={(e) => d(key, e.target.value)}
      >
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </Select>
    </Field>
  );
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
      const body = {
        id: entry?.id || crypto.randomUUID(),
        kind,
        startedAt: DateTime.fromISO(started, { zone: child.timezone })
          .toUTC()
          .toISO(),
        endedAt:
          timed.includes(kind) && mode === "complete"
            ? DateTime.fromISO(ended, { zone: child.timezone }).toUTC().toISO()
            : null,
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
  async function photo(file?: File) {
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
      const result = await post("/photos", { data });
      d("photoId", result.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <span className={`activity-symbol ${kind}`}>
            <ActivityIcon kind={kind} />
          </span>
          <DialogTitle>
            {entry ? "Edit" : "Log"} {kindLabels[kind].toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            A little detail, remembered. Shared with your family.
          </DialogDescription>
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
                {activityKinds.map((k) => (
                  <option value={k} key={k}>
                    {kindLabels[k]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {timed.includes(kind) && !entry && (
            <div className="segmented">
              <button
                type="button"
                className={mode === "complete" ? "selected" : ""}
                onClick={() => setMode("complete")}
              >
                Log a session
              </button>
              <button
                type="button"
                className={mode === "active" ? "selected" : ""}
                onClick={() => {
                  setMode("active");
                  setStarted(local());
                }}
              >
                Start a timer
              </button>
            </div>
          )}
          <div
            className={
              timed.includes(kind) && mode === "complete" ? "form-row" : ""
            }
          >
            <Field
              label={timed.includes(kind) ? "Started" : "When"}
              hint={child.timezone}
            >
              <Input
                type="datetime-local"
                required
                value={started}
                onChange={(e) => setStarted(e.target.value)}
              />
            </Field>
            {timed.includes(kind) && mode === "complete" && (
              <Field label="Ended">
                <Input
                  type="datetime-local"
                  required
                  value={ended}
                  onChange={(e) => setEnded(e.target.value)}
                />
              </Field>
            )}
          </div>
          {kind === "sleep" && (
            <>
              {select("sleepType", "Type of sleep", ["nap", "night"])}
              <div className="form-row">
                {select("settledBy", "Settled with", [
                  "Not specified",
                  "Independently",
                  "Rocking",
                  "Nursing",
                  "Held",
                  "Pram",
                  "Car",
                ])}
                {select("mood", "Woke feeling", [
                  "Not specified",
                  "Content",
                  "Upset",
                  "Woken by caregiver",
                ])}
              </div>
              {number("settlingMinutes", "Time to fall asleep", "min")}
            </>
          )}
          {kind === "nursing" && (
            <>
              {select("side", "Side", ["Left", "Right", "Both"])}
              <div className="form-row">
                {number("leftMinutes", "Left side", "min")}
                {number("rightMinutes", "Right side", "min")}
              </div>
              <p className="form-hint">
                Side minutes are optional. The session timer records total time;
                pause it for breaks.
              </p>
            </>
          )}
          {(kind === "bottle" || kind === "pumping") && (
            <>
              <div className="form-row">
                {number(
                  "amount",
                  kind === "pumping" ? "Total expressed" : "Amount",
                  "",
                  true,
                )}
                {select("unit", "Unit", ["ml", "oz"])}
              </div>
              {kind === "bottle"
                ? select("milkType", "Milk", [
                    "Breast milk",
                    "Formula",
                    "Mixed",
                    "Other",
                    "Tube feed",
                  ])
                : select("side", "Side", ["Both", "Left", "Right"])}
            </>
          )}
          {kind === "diaper" && (
            <>
              {select("diaperType", "Diaper", ["Wet", "Dirty", "Mixed", "Dry"])}
              <div className="form-row">
                {select("color", "Colour", [
                  "Not specified",
                  "Yellow",
                  "Brown",
                  "Green",
                  "Black",
                  "Red",
                  "Pale",
                ])}
                {select("consistency", "Consistency", [
                  "Not specified",
                  "Loose",
                  "Seedy",
                  "Formed",
                  "Hard",
                ])}
              </div>
            </>
          )}
          {kind === "potty" && (
            <div className="form-row">
              {select("result", "Result", ["Success", "Attempt", "Accident"])}
              {select("pottyType", "Type", ["Pee", "Poo", "Both"])}
            </div>
          )}
          {kind === "solids" && (
            <>
              {text("food", "Food", "e.g. Avocado, oats, banana", true)}
              {text(
                "allergens",
                "Allergens introduced",
                "e.g. Egg, peanut, dairy",
              )}
              <div className="form-row">
                {select("reaction", "Response", [
                  "Not specified",
                  "Loved it",
                  "Tried it",
                  "Not keen",
                  "Possible reaction",
                ])}
                {select("meal", "Meal", [
                  "Breakfast",
                  "Lunch",
                  "Dinner",
                  "Snack",
                ])}
              </div>
            </>
          )}
          {kind === "medicine" && (
            <>
              {text(
                "medicine",
                "Medicine name",
                "As written on the label",
                true,
              )}
              <div className="form-row">
                {number("dose", "Dose given", "", true)}
                {select("unit", "Dose unit", [
                  "ml",
                  "mg",
                  "drops",
                  "puffs",
                  "other",
                ])}
              </div>
              <p className="form-hint">
                Record the dose you gave. Follow the label or your clinician’s
                instructions; TomSawyer does not calculate doses.
              </p>
            </>
          )}
          {kind === "growth" && (
            <>
              <div className="form-row">
                {number("weight", "Weight")}
                {select("weightUnit", "Weight unit", ["kg", "lb"])}
              </div>
              <div className="form-row">
                {number("height", "Length / height")}
                {number("head", "Head circumference")}
              </div>
              {select("lengthUnit", "Length unit", ["cm", "in"])}
            </>
          )}
          {kind === "temperature" && (
            <div className="form-row">
              {number("temperature", "Temperature", "", true)}
              <Field label="Unit">
                <Select
                  value={
                    ["C", "F"].includes(String(details.unit))
                      ? String(details.unit)
                      : child.settings.units === "metric"
                        ? "C"
                        : "F"
                  }
                  onChange={(e) => d("unit", e.target.value)}
                >
                  <option>C</option>
                  <option>F</option>
                </Select>
              </Field>
            </div>
          )}
          {kind === "activity" && (
            <>
              {text(
                "activityType",
                "Activity",
                "Tummy time, bath, story time…",
                true,
              )}
              <div className="suggestions">
                {[
                  "Tummy time",
                  "Bath time",
                  "Story time",
                  "Screen time",
                  "Skin to skin",
                  "Outdoor play",
                  "Indoor play",
                  "Brush teeth",
                ].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => d("activityType", v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </>
          )}
          {kind === "milestone" && (
            <>
              {text(
                "title",
                "The little (or big) moment",
                "That very first smile",
                true,
              )}
              <div className="photo-upload">
                {details.photoId ? (
                  <img
                    src={`/api/photos/${details.photoId}`}
                    alt="Milestone attachment"
                  />
                ) : (
                  <Camera size={22} />
                )}
                <label className="upload-label">
                  {photoBusy
                    ? "Uploading…"
                    : details.photoId
                      ? "Change photo"
                      : "Add a photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => photo(e.target.files?.[0])}
                    disabled={photoBusy}
                  />
                </label>
              </div>
            </>
          )}
          {kind === "contraction" && (
            <>
              {select("intensity", "Intensity", ["Mild", "Moderate", "Strong"])}
              <p className="form-hint">
                A record to share with your care team. Follow their guidance on
                when to call or seek care.
              </p>
            </>
          )}
          {kind === "skipped_nap" && (
            <div className="notice sage">
              Save the time the nap attempt ended. Your strategy will
              recalculate the retry time and the rest of the day.
            </div>
          )}
          <Field label={kind === "note" ? "Your note" : "Notes (optional)"}>
            <textarea
              className="input textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={3000}
              placeholder="Anything the next caregiver should know?"
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
              ) : mode === "active" ? (
                <Play />
              ) : (
                <Save />
              )}
              {mode === "active" ? "Start timer" : "Save entry"}
            </Button>
          </div>
          {confirmDelete && (
            <div className="notice error">
              <p>Delete this entry for everyone in your family?</p>
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

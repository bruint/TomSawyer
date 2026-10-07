import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Child } from "../../../shared/types";
import { defaultSettings } from "../../../shared/types";
import { post, put } from "../../lib/api";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, Select } from "../ui/field";
import { Input } from "../ui/input";

export function ChildDialog({
  child,
  onClose,
  onSaved,
}: {
  child?: Child;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const body = {
        name: data.name,
        birthDate: data.birthDate,
        dueDate: data.dueDate || null,
        timezone: data.timezone,
        color: data.color,
        settings: child?.settings || defaultSettings,
      };
      if (child) await put(`/children/${child.id}`, body);
      else await post("/children", body);
      await onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{child ? "Edit child" : "Add child"}</DialogTitle>
        </DialogHeader>
        <form className="form-stack" onSubmit={submit}>
          <Field label="Name">
            <Input
              name="name"
              required
              maxLength={60}
              defaultValue={child?.name}
              placeholder="Their first name"
            />
          </Field>
          <div className="form-row">
            <Field label="Date of birth">
              <Input
                name="birthDate"
                type="date"
                required
                defaultValue={child?.birthDate}
              />
            </Field>
            <Field
              label="Due date (optional)"
              hint="For corrected age if born early."
            >
              <Input
                name="dueDate"
                type="date"
                defaultValue={child?.dueDate || ""}
              />
            </Field>
          </div>
          <Field
            label="Timezone"
            hint="Logs and sleep plans follow this timezone, even when a caregiver travels."
          >
            <Input
              name="timezone"
              required
              defaultValue={
                child?.timezone ||
                Intl.DateTimeFormat().resolvedOptions().timeZone
              }
              list="timezones"
            />
            <datalist id="timezones">
              {[
                "Australia/Perth",
                "Australia/Sydney",
                "Australia/Melbourne",
                "Europe/London",
                "America/New_York",
                "America/Los_Angeles",
                "Pacific/Auckland",
                "Asia/Singapore",
                "UTC",
              ].map((z) => (
                <option value={z} key={z} />
              ))}
            </datalist>
          </Field>
          <Field label="Their colour">
            <Select name="color" defaultValue={child?.color || "sage"}>
              <option value="sage">River sage</option>
              <option value="peach">Apricot morning</option>
              <option value="lavender">Lilac dusk</option>
              <option value="sky">Clear blue</option>
            </Select>
          </Field>
          <div className="dialog-footer">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy ? <Loader2 className="spin" /> : <Plus />}
              {child ? "Save profile" : "Add child"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

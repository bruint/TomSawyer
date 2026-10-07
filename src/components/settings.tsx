import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Download,
  Upload,
  Plus,
  Copy,
  UserPlus,
  Trash2,
  Check,
  Smartphone,
  Save,
  Loader2,
  Moon,
  Sun,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { DateTime } from "luxon";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Field, Select } from "./log-dialog";
import { ActivityIcon } from "./activity-icon";
import { DayHeader } from "./dashboard";
import { api, post, put, remove } from "../lib/api";
import {
  activityKinds,
  defaultSettings,
  kindLabels,
  type ActivityKind,
  type Bootstrap,
  type Child,
  type Reminder,
} from "../../shared/types";

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {child ? "Their little profile" : "Meet your little one."}
          </DialogTitle>
          <DialogDescription>
            Every child has their own rhythm. Let’s make room for theirs.
          </DialogDescription>
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

function ReminderDialog({
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
          <DialogTitle>A little nudge.</DialogTitle>
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

export function SettingsView({
  child,
  bootstrap,
  onRefresh,
  onEditChild,
  onAddChild,
  theme,
  onTheme,
}: {
  child: Child;
  bootstrap: Bootstrap;
  onRefresh: () => Promise<void>;
  onEditChild: () => void;
  onAddChild: () => void;
  theme: string;
  onTheme: (value: string) => void;
}) {
  const [tab, setTab] = useState("routine");
  const [settings, setSettings] = useState(child.settings);
  const [windows, setWindows] = useState(child.settings.wakeWindows.join(", "));
  const [saving, setSaving] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderDialog, setReminderDialog] = useState<Reminder | true | null>(
    null,
  );
  const [invite, setInvite] = useState("");
  const [pushState, setPushState] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [importFile, setImportFile] = useState<{
    content: string;
    format: "csv" | "json";
    name: string;
  } | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const owner = bootstrap.user.role === "owner";
  const refreshReminders = async () =>
    setReminders(await api(`/children/${child.id}/reminders`));
  useEffect(() => {
    setSettings(child.settings);
    setWindows(child.settings.wakeWindows.join(", "));
    setImportFile(null);
    setPreview(null);
    void refreshReminders().catch((e) => toast.error(e.message));
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready
        .then((r) => r.pushManager?.getSubscription())
        .then((s) => setPushState(!!s))
        .catch(() => {});
  }, [child.id]);
  async function save() {
    setSaving(true);
    try {
      await put(`/children/${child.id}`, {
        ...child,
        settings: {
          ...settings,
          wakeWindows: windows.trim()
            ? windows.split(",").map((s) => Number(s.trim()))
            : [],
        },
      });
      await onRefresh();
      toast.success("Routine saved. Your plan has been updated.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function enablePush() {
    if (!window.isSecureContext) {
      toast.error("Open TomSawyer over HTTPS to enable notifications.");
      return;
    }
    if (!("Notification" in window) || !("PushManager" in window)) {
      toast.error(
        "On iPhone or iPad, add TomSawyer to your Home Screen, open it from there, and try again.",
      );
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Allow notifications in your browser or device settings to continue.",
        );
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = bootstrap.push.publicKey
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        const bytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
      }
      await post("/push/subscribe", sub.toJSON());
      setPushState(true);
      toast.success("Notifications are enabled on this device.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  }
  async function disablePush() {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await remove("/push/subscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setPushState(false);
      toast.success("Notifications disabled on this device");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  }
  async function testPush() {
    try {
      const sub = await (
        await navigator.serviceWorker.ready
      ).pushManager.getSubscription();
      if (!sub) throw new Error("Enable notifications first");
      await post("/push/test", { endpoint: sub.endpoint });
      toast.success("Test notification sent to the push service.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function readImport(file?: File) {
    if (!file) return;
    setImportBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a file smaller than 5 MB");
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
      const f = { content, format: format as "csv" | "json", name: file.name };
      setImportFile(f);
      setPreview(await post(`/children/${child.id}/import`, f));
    } catch (e) {
      toast.error((e as Error).message);
      setPreview(null);
    } finally {
      setImportBusy(false);
    }
  }
  return (
    <>
      <DayHeader
        child={child}
        title="Your family. Your rhythm."
        subtitle="A few preferences to make TomSawyer feel like yours."
      />
      <div className="settings-tabs">
        {[
          ["routine", "Sleep & trackers"],
          ["family", "Your crew"],
          ["notifications", "Notifications"],
          ["data", "Data & account"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "selected" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "routine" && (
        <div className="settings-grid">
          <section className="card">
            <div className="section-heading">
              <h2>{child.name}’s sleep rhythm</h2>
              <Moon size={18} />
            </div>
            <p className="muted">
              Starting points for a flexible day. The plan adapts to what
              actually happens.
            </p>
            <fieldset disabled={!owner} className="form-stack">
              <div className="form-row">
                <Field label="Usual morning wake">
                  <Input
                    type="time"
                    value={settings.wakeTime}
                    onChange={(e) =>
                      setSettings({ ...settings, wakeTime: e.target.value })
                    }
                  />
                </Field>
                <Field label="Preferred bedtime">
                  <Input
                    type="time"
                    value={settings.bedtime}
                    onChange={(e) =>
                      setSettings({ ...settings, bedtime: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Naps per day">
                  <Select
                    value={settings.napCount ?? "auto"}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        napCount:
                          e.target.value === "auto"
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  >
                    <option value="auto">Age-based starting point</option>
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "nap" : "naps"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Typical nap length (minutes)">
                  <Input
                    type="number"
                    min={15}
                    max={180}
                    value={settings.napMinutes}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        napMinutes: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <Field
                label="Custom wake windows (optional)"
                hint="Minutes, separated by commas. For example: 150, 180, 210. Leave blank for age-based defaults."
              >
                <Input
                  value={windows}
                  onChange={(e) => setWindows(e.target.value)}
                  placeholder="150, 180, 210"
                />
              </Field>
              <div className="form-row">
                <Field label="Wind-down minutes">
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={settings.windDownMinutes}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        windDownMinutes: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Sleep day starts"
                  hint="Keeps overnight sleep with the right day."
                >
                  <Input
                    type="time"
                    value={settings.dayStart}
                    onChange={(e) =>
                      setSettings({ ...settings, dayStart: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Preferred measurement units">
                <Select
                  value={settings.units}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      units: e.target.value as "metric" | "imperial",
                    })
                  }
                >
                  <option value="metric">Metric · ml, kg, cm, °C</option>
                  <option value="imperial">Imperial · oz, lb, in, °F</option>
                </Select>
              </Field>
              <Button onClick={save} disabled={saving}>
                <Save />
                Save routine
              </Button>
            </fieldset>
            {!owner && (
              <p className="form-hint">
                Your family owner can change these settings.
              </p>
            )}
          </section>
          <div>
            <section className="card">
              <h2>A home screen that fits</h2>
              <p className="muted">
                Show what you track. Saved entries stay in your history.
              </p>
              <div className="tracker-toggles">
                {activityKinds
                  .filter((k) => !["wake", "skipped_nap"].includes(k))
                  .map((kind) => (
                    <div key={kind}>
                      <span className={`activity-symbol ${kind}`}>
                        <ActivityIcon kind={kind} size={17} />
                      </span>
                      <span>{kindLabels[kind]}</span>
                      <Switch
                        disabled={!owner}
                        aria-label={`Show ${kindLabels[kind]}`}
                        checked={settings.visibleTrackers.includes(kind)}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            visibleTrackers: checked
                              ? [...settings.visibleTrackers, kind]
                              : settings.visibleTrackers.filter(
                                  (k) => k !== kind,
                                ),
                          })
                        }
                      />
                    </div>
                  ))}
              </div>
              <Button
                variant="outline"
                className="full-width"
                disabled={!owner || saving}
                onClick={save}
              >
                Save home screen
              </Button>
            </section>
            <section className="card appearance-card">
              <h2>Easy on sleepy eyes</h2>
              <div className="segmented">
                {[
                  ["light", "Day"],
                  ["dark", "Night"],
                  ["system", "Auto"],
                ].map(([v, l]) => (
                  <button
                    className={theme === v ? "selected" : ""}
                    key={v}
                    onClick={() => onTheme(v)}
                  >
                    {v === "dark" ? <Moon size={16} /> : <Sun size={16} />} {l}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
      {tab === "family" && (
        <div className="settings-grid">
          <section className="card">
            <div className="section-heading">
              <h2>Your little ones</h2>
              {owner && (
                <Button size="sm" variant="outline" onClick={onAddChild}>
                  <Plus />
                  Add child
                </Button>
              )}
            </div>
            {bootstrap.children.map((c) => (
              <div className="family-row" key={c.id}>
                <span className={`child-avatar ${c.color}`}>
                  {c.name.charAt(0)}
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.birthDate} · {c.timezone}
                  </small>
                </span>
                {owner && c.id === child.id && (
                  <Button size="sm" variant="ghost" onClick={onEditChild}>
                    Edit
                  </Button>
                )}
              </div>
            ))}
            <p className="form-hint">
              Switch between children using their name at the top of the app.
            </p>
          </section>
          <section className="card">
            <div className="section-heading">
              <h2>The caregiving crew</h2>
              <UserPlus size={19} />
            </div>
            {bootstrap.members.map((m) => (
              <div className="family-row" key={m.id}>
                <span className="member-avatar">{m.name.charAt(0)}</span>
                <span>
                  <strong>
                    {m.name}
                    {m.id === bootstrap.user.id ? " (you)" : ""}
                  </strong>
                  <small>
                    {m.email} · {m.role}
                  </small>
                </span>
                {owner && m.role === "caregiver" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.name}`}
                    onClick={async () => {
                      if (
                        !confirm(
                          `Remove ${m.name}’s access? Their historical entries will stay.`,
                        )
                      )
                        return;
                      try {
                        await remove(`/family/members/${m.id}`);
                        await onRefresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {owner && (
              <>
                <Button
                  variant="outline"
                  className="full-width"
                  onClick={async () => {
                    try {
                      const r = await post("/family/invites", {});
                      setInvite(r.url);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Plus />
                  Create an invitation
                </Button>
                {invite && (
                  <div className="invite-result">
                    <Input
                      aria-label="Invitation link"
                      readOnly
                      value={invite}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Copy invitation"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(invite)
                          .then(() => toast.success("Invitation copied"))
                          .catch(() =>
                            toast.error("Select and copy the invitation link."),
                          )
                      }
                    >
                      <Copy />
                    </Button>
                    <small>
                      One use · expires in 7 days. Share it directly with your
                      caregiver.
                    </small>
                  </div>
                )}
              </>
            )}
            <p className="form-hint">
              Every caregiver has a separate login. Everyone can log and correct
              entries; the owner manages profiles and access.
            </p>
          </section>
        </div>
      )}
      {tab === "notifications" && (
        <div className="settings-grid">
          <div>
            <section className="card">
              <div className="section-heading">
                <h2>A gentle nudge, right on time.</h2>
                <BellRing size={20} />
              </div>
              <p className="muted">
                Sleep wind-down alerts follow your latest plan. Activity
                reminders follow the times your family chooses.
              </p>
              <div className="notification-state">
                <span className={`status-dot ${pushState ? "" : "off"}`} />
                {pushState
                  ? "Notifications enabled on this device"
                  : "This device hasn’t enabled notifications"}
              </div>
              <Button
                disabled={pushBusy}
                onClick={pushState ? disablePush : enablePush}
              >
                {pushBusy ? <Loader2 className="spin" /> : <Bell />}
                {pushState ? "Disable on this device" : "Enable notifications"}
              </Button>
              {pushState && (
                <Button variant="ghost" onClick={testPush}>
                  Send a test
                </Button>
              )}
            </section>
            <section className="card install-card">
              <Smartphone size={25} />
              <h2>Make yourself at home.</h2>
              <p>
                Install TomSawyer on your phone for a more comfortable,
                full-screen experience.
              </p>
              <h3>iPhone & iPad</h3>
              <p>
                In Safari, tap Share → Add to Home Screen. Open TomSawyer from
                that icon, then enable notifications. Requires iOS or iPadOS
                16.4 or later.
              </p>
              <h3>Android</h3>
              <p>
                In Chrome, choose Install app or Add to Home screen. Allow
                notifications when prompted.
              </p>
              <small>
                Push requires HTTPS, internet access, and your device’s
                permission. Focus, battery settings, or your browser may delay
                delivery.
              </small>
            </section>
          </div>
          <section className="card">
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
                                [
                                  "Mon",
                                  "Tue",
                                  "Wed",
                                  "Thu",
                                  "Fri",
                                  "Sat",
                                  "Sun",
                                ][d - 1],
                            )
                            .join(", ")}
                      {r.daytimeOnly ? " · daytime only" : ""}
                    </small>
                  </button>
                  <Switch
                    aria-label={`Enable ${r.title}`}
                    checked={r.enabled}
                    onCheckedChange={async (enabled) => {
                      try {
                        await put(`/children/${child.id}/reminders/${r.id}`, {
                          ...r,
                          enabled,
                        });
                        await refreshReminders();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${r.title}`}
                    onClick={async () => {
                      try {
                        await remove(`/children/${child.id}/reminders/${r.id}`);
                        await refreshReminders();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))
            ) : (
              <div className="empty-state compact">
                <Bell />
                <h3>One less thing to remember.</h3>
                <p>
                  Add a reminder for feeding, pumping, diapers, or anything you
                  choose.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {tab === "data" && (
        <div className="settings-grid">
          <div>
            <section className="card">
              <h2>Your memories are yours.</h2>
              <p className="muted">
                Download {child.name}’s complete history whenever you like.
              </p>
              <div className="button-row">
                <Button variant="outline" asChild>
                  <a href={`/api/children/${child.id}/export?format=csv`}>
                    <Download />
                    CSV spreadsheet
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/api/children/${child.id}/export?format=json`}>
                    <Download />
                    JSON archive
                  </a>
                </Button>
              </div>
              <p className="form-hint">
                Exports include logs and notes. Photo files, account access, and
                reminder settings are preserved in a server database backup.
              </p>
            </section>
            <section className="card">
              <h2>Bring your history along.</h2>
              <p className="muted">
                Import a TomSawyer JSON or CSV export. Generic CSVs need
                kind/type, start, and end columns; timestamps without offsets
                use {child.timezone}.
              </p>
              <label className="file-drop">
                <Upload size={23} />
                <strong>
                  {importBusy
                    ? "Reading your file…"
                    : importFile?.name || "Choose a CSV or JSON file"}
                </strong>
                <span>Up to 5 MB · preview before importing</span>
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={(e) => readImport(e.target.files?.[0])}
                  disabled={importBusy}
                />
              </label>
              {preview && (
                <div className="import-preview">
                  <strong>
                    {preview.valid} of {preview.total} entries are valid
                  </strong>
                  {preview.errors.length > 0 ? (
                    <div className="notice error">
                      {preview.errors.slice(0, 4).map((e: any) => (
                        <p key={e.row}>
                          Row {e.row}: {e.message}
                        </p>
                      ))}
                      <p>
                        Fix errors in the source file and try again. Nothing has
                        been imported.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p>
                        Repeated IDs are skipped. Unmapped CSV fields are kept
                        in notes. Review your file before continuing.
                      </p>
                      <Button
                        disabled={importBusy}
                        onClick={async () => {
                          setImportBusy(true);
                          try {
                            const r = await post(
                              `/children/${child.id}/import`,
                              { ...importFile, commit: true },
                            );
                            toast.success(
                              `${r.imported} entries imported, ${r.duplicates} duplicates skipped.`,
                            );
                            setPreview(null);
                            setImportFile(null);
                            await onRefresh();
                          } catch (e) {
                            toast.error((e as Error).message);
                          } finally {
                            setImportBusy(false);
                          }
                        }}
                      >
                        <Check />
                        Import {preview.valid} entries
                      </Button>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
          <div>
            <section className="card">
              <h2>Change your password</h2>
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  setSaving(true);
                  try {
                    await post(
                      "/account/password",
                      Object.fromEntries(new FormData(form)),
                    );
                    form.reset();
                    toast.success(
                      "Password updated. Other sessions have been signed out.",
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Field label="Current password">
                  <Input
                    name="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </Field>
                <Field label="New password">
                  <Input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </Field>
                <Button variant="outline" disabled={saving}>
                  <ShieldCheck />
                  Update password
                </Button>
              </form>
            </section>
            {owner && (
              <section className="card danger-card">
                <h2>Delete child profile</h2>
                <p>
                  This permanently removes {child.name}’s logs and reminders for
                  everyone in the family. Export a copy first.
                </p>
                <Field label={`Type ${child.name} to confirm`}>
                  <Input
                    value={deleteName}
                    onChange={(e) => setDeleteName(e.target.value)}
                  />
                </Field>
                <Button
                  variant="destructive"
                  disabled={deleteName !== child.name}
                  onClick={async () => {
                    try {
                      await remove(`/children/${child.id}`, {
                        confirmName: deleteName,
                      });
                      await onRefresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 />
                  Delete {child.name}’s profile
                </Button>
              </section>
            )}
          </div>
        </div>
      )}
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

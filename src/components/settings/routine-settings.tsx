import { Moon, Save, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Child } from "../../../shared/types";
import { activityKinds, kindLabels } from "../../../shared/types";
import { put } from "../../lib/api";
import { ActivityIcon } from "../activity-icon";
import { Button } from "../ui/button";
import { Field, Select } from "../ui/field";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export function RoutineSettings({
  child,
  owner,
  onRefresh,
  theme,
  onTheme,
}: {
  child: Child;
  owner: boolean;
  onRefresh: () => Promise<void>;
  theme: string;
  onTheme: (value: string) => void;
}) {
  const [settings, setSettings] = useState(child.settings);
  const [wakeWindowsInput, setWakeWindowsInput] = useState(
    child.settings.wakeWindows.join(", "),
  );
  const [saving, setSaving] = useState(false);
  async function saveRoutine() {
    setSaving(true);
    try {
      await put(`/children/${child.id}`, {
        ...child,
        settings: {
          ...settings,
          wakeWindows: wakeWindowsInput.trim()
            ? wakeWindowsInput.split(",").map((s) => Number(s.trim()))
            : [],
        },
      });
      await onRefresh();
      toast.success("Routine saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="settings-section">
        <div className="section-heading">
          <h2>{child.name}’s sleep routine</h2>
          <Moon size={18} />
        </div>
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
            <Field label="Usual bedtime">
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
                      e.target.value === "auto" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="auto">Automatic</option>
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
            hint="Minutes, comma separated. Blank uses age defaults."
          >
            <Input
              value={wakeWindowsInput}
              onChange={(e) => setWakeWindowsInput(e.target.value)}
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
              hint="Groups night sleep with the previous day."
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
          <Button onClick={saveRoutine} disabled={saving}>
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
        <section className="settings-section">
          <h2>Home screen trackers</h2>
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
                          : settings.visibleTrackers.filter((k) => k !== kind),
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
            onClick={saveRoutine}
          >
            Save home screen
          </Button>
        </section>
        <section className="settings-section appearance-card">
          <h2>Appearance</h2>
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
  );
}

import { useState } from "react";
import type { Bootstrap, Child } from "../../../shared/types";
import { PageHeader } from "../page-header";
import { DataSettings } from "./data-settings";
import { FamilySettings } from "./family-settings";
import { NotificationSettings } from "./notification-settings";
import { RoutineSettings } from "./routine-settings";

const tabs = [
  ["routine", "Sleep & trackers"],
  ["family", "Caregivers"],
  ["notifications", "Notifications"],
  ["data", "Data & account"],
] as const;
type SettingsTab = (typeof tabs)[number][0];

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
  const [tab, setTab] = useState<SettingsTab>("routine");
  const owner = bootstrap.user.role === "owner";
  return (
    <>
      <PageHeader child={child} title="Family settings" />
      <div className="settings-tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Keep forms mounted so switching tabs preserves unsaved input. */}
      <div hidden={tab !== "routine"}>
        <RoutineSettings
          child={child}
          owner={owner}
          onRefresh={onRefresh}
          theme={theme}
          onTheme={onTheme}
        />
      </div>
      <div hidden={tab !== "family"}>
        <FamilySettings
          child={child}
          bootstrap={bootstrap}
          onRefresh={onRefresh}
          onEditChild={onEditChild}
          onAddChild={onAddChild}
        />
      </div>
      <div hidden={tab !== "notifications"}>
        <NotificationSettings
          child={child}
          publicKey={bootstrap.push.publicKey}
        />
      </div>
      <div hidden={tab !== "data"}>
        <DataSettings child={child} owner={owner} onRefresh={onRefresh} />
      </div>
    </>
  );
}

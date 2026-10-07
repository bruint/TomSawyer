import { Bell, BellRing, Loader2, Smartphone } from "lucide-react";
import type { Child } from "../../../shared/types";
import type { AppInstallation } from "../../hooks/use-app-install";
import type { PushNotifications } from "../../hooks/use-push-notifications";
import { InstallApp, NotificationOptions } from "../device-setup";
import { Button } from "../ui/button";
import { RemindersCard } from "./reminders-card";

export function NotificationSettings({
  child,
  installation,
  push,
}: {
  child: Child;
  installation: AppInstallation;
  push: PushNotifications;
}) {
  return (
    <div className="settings-grid">
      <div>
        <section className="settings-section">
          <div className="section-heading">
            <h2>Device notifications</h2>
            <BellRing size={20} />
          </div>
          <NotificationOptions push={push} />
          <div className="device-actions">
            {(push.enabled ||
              (push.availability === "ready" &&
                push.permission !== "denied")) && (
              <Button
                disabled={push.busy || push.checking}
                onClick={push.enabled ? push.disable : push.enable}
              >
                {push.busy ? <Loader2 className="spin" /> : <Bell />}
                {push.enabled
                  ? "Disable on this device"
                  : "Enable notifications"}
              </Button>
            )}
            {push.enabled && (
              <Button
                variant="ghost"
                disabled={push.busy || push.checking}
                onClick={push.sendTest}
              >
                Send a test
              </Button>
            )}
          </div>
        </section>
        <section className="settings-section">
          <div className="section-heading">
            <h2>Install app</h2>
            <Smartphone size={20} />
          </div>
          <InstallApp installation={installation} />
        </section>
      </div>
      <RemindersCard child={child} />
    </div>
  );
}

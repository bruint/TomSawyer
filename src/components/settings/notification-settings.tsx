import { Bell, BellRing, Loader2, Smartphone } from "lucide-react";
import type { Child } from "../../../shared/types";
import { usePushNotifications } from "../../hooks/use-push-notifications";
import { Button } from "../ui/button";
import { RemindersCard } from "./reminders-card";

export function NotificationSettings({
  child,
  publicKey,
}: {
  child: Child;
  publicKey: string;
}) {
  const push = usePushNotifications(publicKey);
  return (
    <div className="settings-grid">
      <div>
        <section className="settings-section">
          <div className="section-heading">
            <h2>Device notifications</h2>
            <BellRing size={20} />
          </div>
          <div className="notification-state">
            <span className={`status-dot ${push.enabled ? "" : "off"}`} />
            {push.enabled
              ? "Enabled on this device"
              : "Disabled on this device"}
          </div>
          <Button
            disabled={push.busy}
            onClick={push.enabled ? push.disable : push.enable}
          >
            {push.busy ? <Loader2 className="spin" /> : <Bell />}
            {push.enabled ? "Disable on this device" : "Enable notifications"}
          </Button>
          {push.enabled && (
            <Button variant="ghost" onClick={push.sendTest}>
              Send a test
            </Button>
          )}
        </section>
        <section className="settings-section install-card">
          <Smartphone size={25} />
          <h2>Install app</h2>
          <h3>iPhone & iPad</h3>
          <p>
            Safari → Share → Add to Home Screen. Open the app to enable
            notifications. Requires iOS 16.4+.
          </p>
          <h3>Android</h3>
          <p>Chrome → Install app or Add to Home screen.</p>
        </section>
      </div>
      <RemindersCard child={child} />
    </div>
  );
}

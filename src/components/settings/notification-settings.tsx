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
        <section className="card">
          <div className="section-heading">
            <h2>Device notifications</h2>
            <BellRing size={20} />
          </div>
          <div className="notification-state">
            <span className={`status-dot ${push.enabled ? "" : "off"}`} />
            {push.enabled
              ? "Notifications enabled on this device"
              : "This device hasn’t enabled notifications"}
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
        <section className="card install-card">
          <Smartphone size={25} />
          <h2>Install app</h2>
          <h3>iPhone & iPad</h3>
          <p>
            In Safari, tap Share → Add to Home Screen. Open TomSawyer from that
            icon, then enable notifications. Requires iOS or iPadOS 16.4 or
            later.
          </p>
          <h3>Android</h3>
          <p>
            In Chrome, choose Install app or Add to Home screen. Allow
            notifications when prompted.
          </p>
          <small>
            Push requires HTTPS, internet access, and your device’s permission.
            Focus, battery settings, or your browser may delay delivery.
          </small>
        </section>
      </div>
      <RemindersCard child={child} />
    </div>
  );
}

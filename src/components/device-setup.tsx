import { Check, Download, Loader2 } from "lucide-react";
import { useId } from "react";
import type { AppInstallation } from "../hooks/use-app-install";
import type { PushNotifications } from "../hooks/use-push-notifications";
import { pushUnavailableMessage } from "../lib/device";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

export function InstallApp({
  installation,
  onInstalled,
}: {
  installation: AppInstallation;
  onInstalled?: () => void;
}) {
  if (installation.installed)
    return (
      <p className="device-state">
        <Check size={18} /> App installed
      </p>
    );
  return (
    <div className="install-app">
      {installation.canPrompt ? (
        <Button
          disabled={installation.busy}
          onClick={async () => {
            if (await installation.install()) onInstalled?.();
          }}
        >
          {installation.busy ? <Loader2 className="spin" /> : <Download />}
          Install app
        </Button>
      ) : (
        <ol className="install-steps">
          {installation.platform === "ios" ? (
            <>
              <li>
                In Safari, tap <strong>Share</strong>.
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>, then{" "}
                <strong>Add</strong>.
              </li>
              <li>Open TomSawyer from its new icon.</li>
            </>
          ) : installation.platform === "android" ? (
            <>
              <li>
                In Chrome, open the <strong>⋮ menu</strong>.
              </li>
              <li>
                Choose <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>.
              </li>
              <li>Open TomSawyer from its new icon.</li>
            </>
          ) : (
            <li>
              Use your browser’s <strong>Install app</strong> option if
              available.
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

export function NotificationOptions({ push }: { push: PushNotifications }) {
  const id = useId();
  const hint =
    push.error ||
    (push.availability !== "ready"
      ? pushUnavailableMessage[push.availability]
      : push.permission === "denied"
        ? "Notifications are blocked. Allow them in your browser or device settings."
        : "");
  return (
    <div className="notification-options">
      <div className="device-state" role="status">
        <span className={`status-dot ${push.enabled ? "" : "off"}`} />
        {push.checking
          ? "Checking this device…"
          : push.enabled
            ? "Enabled on this device"
            : "Disabled on this device"}
      </div>
      <div className="alert-options">
        <div className="alert-option">
          <label htmlFor={`${id}-wind-down`}>
            <strong>Wind-down alert</strong>
            <span>Time to begin the routine</span>
          </label>
          <Switch
            id={`${id}-wind-down`}
            checked={push.alerts.windDown}
            disabled={push.busy || push.checking}
            onCheckedChange={(windDown) =>
              void push.updateAlerts({ ...push.alerts, windDown })
            }
          />
        </div>
        <div className="alert-option">
          <label htmlFor={`${id}-sleep-window`}>
            <strong>Sleep-window alert</strong>
            <span>When the suggested window opens</span>
          </label>
          <Switch
            id={`${id}-sleep-window`}
            checked={push.alerts.sleepWindow}
            disabled={push.busy || push.checking}
            onCheckedChange={(sleepWindow) =>
              void push.updateAlerts({ ...push.alerts, sleepWindow })
            }
          />
        </div>
      </div>
      {hint && (
        <p className="device-hint" role={push.error ? "alert" : undefined}>
          {hint}
        </p>
      )}
    </div>
  );
}

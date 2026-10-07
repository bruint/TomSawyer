import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  defaultSleepAlerts,
  type PushDeviceState,
  type SleepAlertPreferences,
} from "../../shared/types";
import { api, post, remove } from "../lib/api";
import { pushAvailability, pushUnavailableMessage } from "../lib/device";
import type { AppInstallation } from "./use-app-install";

async function pushRegistration() {
  await navigator.serviceWorker.register("/sw.js");
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "Couldn’t start notifications. Reload the app and try again.",
              ),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

export function usePushNotifications(
  publicKey: string | undefined,
  userId: string | undefined,
  installation: AppInstallation,
) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alerts, setAlerts] = useState<SleepAlertPreferences>({
    ...defaultSleepAlerts,
  });
  const [error, setError] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>(
    "Notification" in window ? Notification.permission : "default",
  );
  const scope = useRef(userId);
  scope.current = userId;
  const availability = pushAvailability({
    platform: installation.platform,
    standalone: installation.standalone,
    secure: window.isSecureContext,
    supported:
      "Notification" in window &&
      "PushManager" in window &&
      "serviceWorker" in navigator,
  });

  useEffect(() => {
    let cancelled = false;
    setEnabled(false);
    setAlerts({ ...defaultSleepAlerts });
    setError("");
    async function refresh() {
      if (!userId || availability !== "ready") {
        setChecking(false);
        return;
      }
      setChecking(true);
      try {
        const allowed = Notification.permission;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        const state =
          sub && allowed === "granted"
            ? await api<PushDeviceState>(
                `/push/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`,
              )
            : { enabled: false, alerts: { ...defaultSleepAlerts } };
        if (!cancelled) {
          setPermission(allowed);
          setEnabled(state.enabled);
          if (state.enabled) setAlerts(state.alerts);
          setError("");
        }
      } catch {
        if (!cancelled)
          setError("Connect to your server to check notifications.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [userId, availability]);

  async function enable() {
    if (availability !== "ready") {
      toast.error(pushUnavailableMessage[availability]);
      return false;
    }
    if (!publicKey || !userId) return false;
    setBusy(true);
    setError("");
    try {
      // Request permission before awaiting anything, to preserve the user's tap on iOS.
      const allowed = await Notification.requestPermission();
      setPermission(allowed);
      if (allowed !== "granted")
        throw new Error(
          "Allow notifications in your browser or device settings, then try again.",
        );
      const reg = await pushRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = publicKey.replace(/-/g, "+").replace(/_/g, "/");
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(atob(key), (c) =>
            c.charCodeAt(0),
          ),
        });
      }
      if (scope.current !== userId) return false;
      const state = await post<PushDeviceState>("/push/subscribe", {
        ...sub.toJSON(),
        alerts,
      });
      if (scope.current !== userId) return false;
      setEnabled(state.enabled);
      setAlerts(state.alerts);
      toast.success("Notifications enabled on this device");
      return true;
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateAlerts(next: SleepAlertPreferences) {
    if (!enabled) {
      setAlerts(next);
      return;
    }
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error("Enable notifications first");
      const state = await post<PushDeviceState>("/push/subscribe", {
        ...sub.toJSON(),
        alerts: next,
      });
      setAlerts(state.alerts);
      setError("");
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remove("/push/subscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setError("");
      toast.success("Notifications disabled on this device");
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error("Enable notifications first");
      await post("/push/test", { endpoint: sub.endpoint });
      toast.success("Test sent to the push service");
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return {
    enabled,
    busy,
    checking,
    alerts,
    permission,
    availability,
    error,
    enable,
    disable,
    sendTest,
    updateAlerts,
  };
}

export type PushNotifications = ReturnType<typeof usePushNotifications>;

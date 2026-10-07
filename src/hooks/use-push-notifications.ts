import { useEffect, useState } from "react";
import { toast } from "sonner";
import { post, remove } from "../lib/api";

export function usePushNotifications(publicKey: string) {
  const [pushState, setPushState] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.pushManager?.getSubscription())
        .then((subscription) => {
          if (!cancelled) setPushState(!!subscription);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);
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
        const key = publicKey.replace(/-/g, "+").replace(/_/g, "/");
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
  return {
    enabled: pushState,
    busy: pushBusy,
    enable: enablePush,
    disable: disablePush,
    sendTest: testPush,
  };
}

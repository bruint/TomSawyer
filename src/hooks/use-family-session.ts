import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Bootstrap, ServerStatus } from "../../shared/types";
import { ApiError, api, post } from "../lib/api";
import { clearFamilyStorage, readStored, writeStored } from "../lib/storage";

export function useFamilySession() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [status, setStatus] = useState<ServerStatus>({
    needsSetup: false,
    setupKeyRequired: false,
  });
  const [failure, setFailure] = useState("");
  const [online, setOnline] = useState(navigator.onLine);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Bootstrap>("/bootstrap");
      setBootstrap(data);
      writeStored("ts:bootstrap", data);
      setFailure("");
      setOnline(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setBootstrap(null);
        localStorage.removeItem("ts:bootstrap");
        setStatus(await api<ServerStatus>("/status"));
      } else {
        const cached = readStored<Bootstrap | null>("ts:bootstrap", null);
        if (cached) {
          setBootstrap(cached);
          setOnline(false);
        } else {
          setFailure(
            "Couldn’t reach your server. Check your connection and try again.",
          );
        }
      }
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const connected = () => {
      setOnline(true);
      void refresh();
    };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [refresh]);

  async function signOut() {
    try {
      let subscription: PushSubscription | null = null;
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        subscription =
          (await registration?.pushManager?.getSubscription()) || null;
      }
      await post("/auth/logout", { endpoint: subscription?.endpoint });
      await subscription?.unsubscribe().catch(() => {});
      clearFamilyStorage();
      setBootstrap(null);
      setStatus(await api<ServerStatus>("/status"));
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  }

  return {
    bootstrap,
    initializing,
    status,
    failure,
    online,
    setOnline,
    refresh,
    signOut,
  };
}

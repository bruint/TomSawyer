import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { devicePlatform } from "../lib/device";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone
  );
}

export function useAppInstall() {
  const prompt = useRef<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(isStandalone);
  const [installed, setInstalled] = useState(isStandalone);
  const [canPrompt, setCanPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const platform = devicePlatform(navigator);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const available = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
      setCanPrompt(true);
    };
    const complete = () => {
      prompt.current = null;
      setCanPrompt(false);
      setInstalled(true);
    };
    const displayChanged = () => {
      const app = isStandalone();
      setStandalone(app);
      if (app) complete();
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    media.addEventListener("change", displayChanged);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      media.removeEventListener("change", displayChanged);
    };
  }, []);

  async function install() {
    const event = prompt.current;
    if (!event) return false;
    prompt.current = null;
    setCanPrompt(false);
    setBusy(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") setInstalled(true);
      return outcome === "accepted";
    } catch {
      toast.error("Use your browser’s menu to install TomSawyer.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { platform, standalone, installed, canPrompt, busy, install };
}

export type AppInstallation = ReturnType<typeof useAppInstall>;

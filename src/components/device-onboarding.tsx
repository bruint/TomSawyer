import { Bell, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppInstallation } from "../hooks/use-app-install";
import type { PushNotifications } from "../hooks/use-push-notifications";
import { deviceSetupKey } from "../lib/device";
import { readStored, writeStored } from "../lib/storage";
import { InstallApp, NotificationOptions } from "./device-setup";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function DeviceOnboarding({
  userId,
  installation,
  push,
}: {
  userId: string;
  installation: AppInstallation;
  push: PushNotifications;
}) {
  const key = deviceSetupKey(userId, installation.standalone);
  const [complete, setComplete] = useState(() => readStored(key, false));
  const [step, setStep] = useState<"install" | "notifications">(
    installation.installed ? "notifications" : "install",
  );
  const busy = push.busy || installation.busy;
  useEffect(() => {
    if (installation.installed) setStep("notifications");
  }, [installation.installed]);

  function finish() {
    writeStored(key, true);
    setComplete(true);
  }
  if (complete) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) finish();
      }}
    >
      <DialogContent
        className="device-onboarding"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <ol className="setup-progress" aria-label="Device setup">
          <li aria-current={step === "install" ? "step" : undefined}>
            1 · Install
          </li>
          <li aria-current={step === "notifications" ? "step" : undefined}>
            2 · Notifications
          </li>
        </ol>
        <DialogHeader>
          <DialogTitle>
            {step === "install" ? "Install TomSawyer" : "Sleep reminders"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Set up TomSawyer on this device. You can change these options in
            Family settings.
          </DialogDescription>
        </DialogHeader>
        {step === "install" ? (
          <>
            <InstallApp
              installation={installation}
              onInstalled={() => setStep("notifications")}
            />
            <div className="setup-actions">
              <Button
                variant={installation.canPrompt ? "ghost" : "default"}
                disabled={busy}
                onClick={() => setStep("notifications")}
              >
                {installation.canPrompt ? "Not now" : "Continue"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <NotificationOptions push={push} />
            <div className="setup-actions">
              {push.enabled ? (
                <Button disabled={busy || push.checking} onClick={finish}>
                  Done
                </Button>
              ) : (
                <>
                  {push.availability === "ready" &&
                    push.permission !== "denied" && (
                      <Button
                        disabled={busy || push.checking}
                        onClick={async () => {
                          if (await push.enable()) finish();
                        }}
                      >
                        {push.busy ? <Loader2 className="spin" /> : <Bell />}
                        Enable notifications
                      </Button>
                    )}
                  <Button variant="ghost" disabled={busy} onClick={finish}>
                    Maybe later
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

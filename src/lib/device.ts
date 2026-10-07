export type DevicePlatform = "ios" | "android" | "desktop";

export function devicePlatform(device: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): DevicePlatform {
  if (
    /iPhone|iPad|iPod/.test(device.userAgent) ||
    (device.platform === "MacIntel" && device.maxTouchPoints > 1)
  )
    return "ios";
  return /Android/.test(device.userAgent) ? "android" : "desktop";
}

export type PushAvailability = "ready" | "install" | "https" | "unsupported";

export function pushAvailability(device: {
  platform: DevicePlatform;
  standalone: boolean;
  secure: boolean;
  supported: boolean;
}): PushAvailability {
  if (!device.secure) return "https";
  if (device.platform === "ios" && !device.standalone) return "install";
  return device.supported ? "ready" : "unsupported";
}

export const pushUnavailableMessage: Record<
  Exclude<PushAvailability, "ready">,
  string
> = {
  install:
    "Add TomSawyer to your Home Screen, then open it from the icon to enable notifications.",
  https: "Open TomSawyer over HTTPS to enable notifications.",
  unsupported:
    "This browser does not support push notifications. Try an up-to-date Safari, Chrome, Edge or Firefox.",
};

export function deviceSetupKey(userId: string, standalone: boolean) {
  return `ts:device-setup:${userId}:${standalone ? "app" : "browser"}`;
}

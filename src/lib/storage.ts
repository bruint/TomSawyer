export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full; online use must still work.
  }
}

export function clearFamilyStorage() {
  for (const key of Object.keys(localStorage)) {
    if (
      key.startsWith("ts:") &&
      key !== "ts:theme" &&
      !key.startsWith("ts:device-setup:")
    ) {
      localStorage.removeItem(key);
    }
  }
}

export const activityKinds = [
  "sleep",
  "nursing",
  "bottle",
  "solids",
  "diaper",
  "potty",
  "pumping",
  "medicine",
  "growth",
  "temperature",
  "activity",
  "milestone",
  "contraction",
  "note",
  "wake",
  "skipped_nap",
] as const;
export type ActivityKind = (typeof activityKinds)[number];
export type Details = Record<string, string | number | boolean>;
export interface Child {
  id: string;
  familyId: string;
  name: string;
  birthDate: string;
  dueDate: string | null;
  timezone: string;
  color: string;
  settings: ChildSettings;
  createdAt: string;
}
export interface ChildSettings {
  wakeTime: string;
  bedtime: string;
  napCount: number | null;
  wakeWindows: number[];
  napMinutes: number;
  windDownMinutes: number;
  dayStart: string;
  visibleTrackers: ActivityKind[];
  units: "metric" | "imperial";
}
export const defaultSettings: ChildSettings = {
  wakeTime: "07:00",
  bedtime: "19:30",
  napCount: null,
  wakeWindows: [],
  napMinutes: 60,
  windDownMinutes: 15,
  dayStart: "04:00",
  visibleTrackers: [
    "sleep",
    "nursing",
    "bottle",
    "diaper",
    "pumping",
    "solids",
  ],
  units: "metric",
};
export interface Activity {
  id: string;
  childId: string;
  kind: ActivityKind;
  startedAt: string;
  endedAt: string | null;
  state: "active" | "paused" | "complete";
  pausedAt: string | null;
  pausedMs: number;
  details: Details;
  notes: string;
  createdBy: string;
  authorName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type ActivityInput = Pick<
  Activity,
  "id" | "kind" | "startedAt" | "endedAt" | "details" | "notes" | "pausedMs"
> & {
  state: "active" | "complete";
  version?: number;
};
export type TimerAction = "pause" | "resume" | "stop";

export interface ServerStatus {
  needsSetup: boolean;
  setupKeyRequired: boolean;
}

export interface ImportPreview {
  total: number;
  valid: number;
  errors: { row: number; message: string }[];
}

export interface ImportResult {
  imported: number;
  duplicates: number;
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: "owner" | "caregiver";
}
export interface Reminder {
  id: string;
  childId: string;
  title: string;
  kind: ActivityKind;
  mode: "clock" | "interval";
  atTime: string;
  intervalMinutes: number;
  weekdays: number[];
  daytimeOnly: boolean;
  enabled: boolean;
}
export interface PlanStep {
  id: string;
  kind: "nap" | "bedtime" | "wind-down" | "wake";
  at: string;
  endAt?: string;
  title: string;
  detail: string;
  tentative: boolean;
}
export interface Strategy {
  generatedAt: string;
  day: string;
  status: "settling" | "sleeping" | "ready" | "gentle" | "night";
  headline: string;
  summary: string;
  reasons: { code: string; title: string; detail: string }[];
  nextSleep: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  windDownAt: string | null;
  bedtime: string | null;
  steps: PlanStep[];
  alternatives: { title: string; detail: string }[];
  confidence: "Getting started" | "Based on your logs" | "Your custom routine";
  ageMonths: number;
  totalNapMinutes: number;
  completedNaps: number;
  plannedNaps: number;
  awakeSince: string | null;
  wakeWindowMinutes: number;
  caveat: string;
}
export interface Bootstrap {
  user: User;
  family: { id: string; name: string };
  children: Child[];
  members: User[];
  push: { publicKey: string; enabled: boolean };
  serverTime: string;
}
export interface SleepAlertPreferences {
  windDown: boolean;
  sleepWindow: boolean;
}
export const defaultSleepAlerts: SleepAlertPreferences = {
  windDown: true,
  sleepWindow: true,
};
export interface PushDeviceState {
  enabled: boolean;
  alerts: SleepAlertPreferences;
}
export const kindLabels: Record<ActivityKind, string> = {
  sleep: "Sleep",
  nursing: "Nursing",
  bottle: "Bottle",
  solids: "Solids",
  diaper: "Diaper",
  potty: "Potty",
  pumping: "Pumping",
  medicine: "Medicine",
  growth: "Growth",
  temperature: "Temperature",
  activity: "Activity",
  milestone: "Milestone",
  contraction: "Contraction",
  note: "Note",
  wake: "Morning wake",
  skipped_nap: "Missed nap",
};
export function elapsedMs(a: Activity, now = Date.now()): number {
  return Math.max(
    0,
    (a.endedAt
      ? Date.parse(a.endedAt)
      : a.pausedAt
        ? Date.parse(a.pausedAt)
        : now) -
      Date.parse(a.startedAt) -
      a.pausedMs,
  );
}

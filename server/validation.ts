import { z } from "zod";
import { DateTime, IANAZone } from "luxon";
import { activityKinds, defaultSettings } from "../shared/types.js";
export const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, "Enter a valid date");
export const settingsSchema = z
  .object({
    wakeTime: clockSchema,
    bedtime: clockSchema,
    dayStart: clockSchema,
    napCount: z.number().int().min(0).max(6).nullable(),
    wakeWindows: z.array(z.number().int().min(30).max(480)).max(7),
    napMinutes: z.number().int().min(15).max(180),
    windDownMinutes: z.number().int().min(0).max(60),
    visibleTrackers: z.array(z.enum(activityKinds)).max(16),
    units: z.enum(["metric", "imperial"]),
  })
  .refine(
    (s) => s.wakeTime < s.bedtime,
    "Bedtime must be after your usual wake time",
  );
export const childSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    birthDate: daySchema,
    dueDate: daySchema.nullable().default(null),
    timezone: z
      .string()
      .refine((v) => IANAZone.isValidZone(v), "Choose a valid IANA timezone"),
    color: z.enum(["sage", "peach", "lavender", "sky"]).default("sage"),
    settings: settingsSchema.default(defaultSettings),
  })
  .refine(
    (c) => c.birthDate <= "2100-01-01" && c.birthDate >= "2000-01-01",
    "Birth date must be between 2000 and 2100",
  );
const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
export const activitySchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(activityKinds),
    startedAt: isoDate,
    endedAt: isoDate.nullable().default(null),
    state: z.enum(["active", "complete"]).default("complete"),
    pausedMs: z
      .number()
      .int()
      .min(0)
      .max(86400000 * 7)
      .default(0),
    details: z
      .record(
        z.string().max(50),
        z.union([z.string().max(500), z.number().finite(), z.boolean()]),
      )
      .refine((v) => Object.keys(v).length <= 30, "Too many details")
      .default({}),
    notes: z.string().max(3000).default(""),
    version: z.number().int().positive().optional(),
  })
  .superRefine((a, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (Date.parse(a.startedAt) > Date.now() + 60000)
      issue("Activity cannot start in the future");
    if (a.endedAt && Date.parse(a.endedAt) < Date.parse(a.startedAt))
      issue("End must be after start");
    if (a.endedAt && Date.parse(a.endedAt) > Date.now() + 60000)
      issue("Activity cannot end in the future");
    if (
      a.endedAt &&
      a.pausedMs > Date.parse(a.endedAt) - Date.parse(a.startedAt)
    )
      issue("Paused time cannot exceed the session duration");
    const timed = ["sleep", "nursing", "pumping", "activity", "contraction"];
    if (a.state === "active" && (!timed.includes(a.kind) || a.endedAt))
      issue("Only timed activities can have a running timer");
    if (a.state === "complete" && a.kind === "sleep" && !a.endedAt)
      issue("Completed sleep needs an end time");
    if (
      a.kind === "sleep" &&
      !["nap", "night"].includes(String(a.details.sleepType))
    )
      issue("Choose nap or night sleep");
    for (const key of [
      "amount",
      "leftMinutes",
      "rightMinutes",
      "weight",
      "height",
      "head",
      "dose",
      "durationMinutes",
    ])
      if (typeof a.details[key] === "number" && (a.details[key] as number) < 0)
        issue(`${key} must not be negative`);
  });
export const reminderSchema = z.object({
  title: z.string().trim().min(1).max(100),
  kind: z.enum(activityKinds),
  mode: z.enum(["clock", "interval"]),
  atTime: clockSchema.default("09:00"),
  intervalMinutes: z.number().int().min(5).max(10080).default(180),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .default([1, 2, 3, 4, 5, 6, 7]),
  daytimeOnly: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

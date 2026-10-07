import { Camera } from "lucide-react";
import type { ActivityKind, ChildSettings, Details } from "../../shared/types";
import { Field, Select } from "./ui/field";
import { Input } from "./ui/input";

interface ActivityFieldsProps {
  kind: ActivityKind;
  details: Details;
  units: ChildSettings["units"];
  onChange: (key: string, value: string | number) => void;
  photoBusy: boolean;
  onPhoto: (file?: File) => Promise<void>;
}

export function ActivityFields({
  kind,
  details,
  units,
  onChange,
  photoBusy,
  onPhoto,
}: ActivityFieldsProps) {
  const textField = (
    key: string,
    label: string,
    placeholder = "",
    required = false,
  ) => (
    <Field label={label}>
      <Input
        value={String(details[key] ?? "")}
        onChange={(e) => onChange(key, e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </Field>
  );
  const numberField = (
    key: string,
    label: string,
    unit?: string,
    required = false,
  ) => (
    <Field label={label}>
      <div className="input-unit">
        <Input
          type="number"
          min="0"
          step="any"
          value={String(details[key] ?? "")}
          onChange={(e) =>
            onChange(key, e.target.value === "" ? "" : Number(e.target.value))
          }
          required={required}
        />
        {unit && <span>{unit}</span>}
      </div>
    </Field>
  );
  const selectField = (key: string, label: string, values: string[]) => (
    <Field label={label}>
      <Select
        value={String(details[key] || values[0])}
        onChange={(e) => onChange(key, e.target.value)}
      >
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </Select>
    </Field>
  );
  return (
    <>
      {kind === "sleep" && (
        <>
          {selectField("sleepType", "Type of sleep", ["nap", "night"])}
          <details className="disclosure log-extra">
            <summary>Sleep details</summary>
            <div className="form-stack">
              <div className="form-row">
                {selectField("settledBy", "Settled with", [
                  "Not specified",
                  "Independently",
                  "Rocking",
                  "Nursing",
                  "Held",
                  "Pram",
                  "Car",
                ])}
                {selectField("mood", "Woke feeling", [
                  "Not specified",
                  "Content",
                  "Upset",
                  "Woken by caregiver",
                ])}
              </div>
              {numberField("settlingMinutes", "Time to fall asleep", "min")}
            </div>
          </details>
        </>
      )}
      {kind === "nursing" && (
        <>
          {selectField("side", "Side", ["Left", "Right", "Both"])}
          <div className="form-row">
            {numberField("leftMinutes", "Left side", "min")}
            {numberField("rightMinutes", "Right side", "min")}
          </div>
          <p className="form-hint">Side minutes are optional.</p>
        </>
      )}
      {(kind === "bottle" || kind === "pumping") && (
        <>
          <div className="form-row">
            {numberField(
              "amount",
              kind === "pumping" ? "Total expressed" : "Amount",
              "",
              true,
            )}
            {selectField("unit", "Unit", ["ml", "oz"])}
          </div>
          {kind === "bottle"
            ? selectField("milkType", "Milk", [
                "Breast milk",
                "Formula",
                "Mixed",
                "Other",
                "Tube feed",
              ])
            : selectField("side", "Side", ["Both", "Left", "Right"])}
        </>
      )}
      {kind === "diaper" && (
        <>
          {selectField("diaperType", "Diaper", [
            "Wet",
            "Dirty",
            "Mixed",
            "Dry",
          ])}
          <div className="form-row">
            {selectField("color", "Colour", [
              "Not specified",
              "Yellow",
              "Brown",
              "Green",
              "Black",
              "Red",
              "Pale",
            ])}
            {selectField("consistency", "Consistency", [
              "Not specified",
              "Loose",
              "Seedy",
              "Formed",
              "Hard",
            ])}
          </div>
        </>
      )}
      {kind === "potty" && (
        <div className="form-row">
          {selectField("result", "Result", ["Success", "Attempt", "Accident"])}
          {selectField("pottyType", "Type", ["Pee", "Poo", "Both"])}
        </div>
      )}
      {kind === "solids" && (
        <>
          {textField("food", "Food", "e.g. Avocado, oats, banana", true)}
          {textField(
            "allergens",
            "Allergens introduced",
            "e.g. Egg, peanut, dairy",
          )}
          <div className="form-row">
            {selectField("reaction", "Response", [
              "Not specified",
              "Loved it",
              "Tried it",
              "Not keen",
              "Possible reaction",
            ])}
            {selectField("meal", "Meal", [
              "Breakfast",
              "Lunch",
              "Dinner",
              "Snack",
            ])}
          </div>
        </>
      )}
      {kind === "medicine" && (
        <>
          {textField(
            "medicine",
            "Medicine name",
            "As written on the label",
            true,
          )}
          <div className="form-row">
            {numberField("dose", "Dose given", "", true)}
            {selectField("unit", "Dose unit", [
              "ml",
              "mg",
              "drops",
              "puffs",
              "other",
            ])}
          </div>
          <p className="form-hint">
            Log the dose given. Doses aren’t calculated here.
          </p>
        </>
      )}
      {kind === "growth" && (
        <>
          <div className="form-row">
            {numberField("weight", "Weight")}
            {selectField("weightUnit", "Weight unit", ["kg", "lb"])}
          </div>
          <div className="form-row">
            {numberField("height", "Length / height")}
            {numberField("head", "Head circumference")}
          </div>
          {selectField("lengthUnit", "Length unit", ["cm", "in"])}
        </>
      )}
      {kind === "temperature" && (
        <div className="form-row">
          {numberField("temperature", "Temperature", "", true)}
          <Field label="Unit">
            <Select
              value={
                ["C", "F"].includes(String(details.unit))
                  ? String(details.unit)
                  : units === "metric"
                    ? "C"
                    : "F"
              }
              onChange={(e) => onChange("unit", e.target.value)}
            >
              <option>C</option>
              <option>F</option>
            </Select>
          </Field>
        </div>
      )}
      {kind === "activity" && (
        <>
          {textField(
            "activityType",
            "Activity",
            "Tummy time, bath, story time…",
            true,
          )}
          <div className="suggestions">
            {[
              "Tummy time",
              "Bath time",
              "Story time",
              "Screen time",
              "Skin to skin",
              "Outdoor play",
              "Indoor play",
              "Brush teeth",
            ].map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => onChange("activityType", v)}
              >
                {v}
              </button>
            ))}
          </div>
        </>
      )}
      {kind === "milestone" && (
        <>
          {textField("title", "Milestone", "That very first smile", true)}
          <div className="photo-upload">
            {details.photoId ? (
              <img
                src={`/api/photos/${details.photoId}`}
                alt="Milestone attachment"
              />
            ) : (
              <Camera size={22} />
            )}
            <label className="upload-label">
              {photoBusy
                ? "Uploading…"
                : details.photoId
                  ? "Change photo"
                  : "Add a photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => onPhoto(e.target.files?.[0])}
                disabled={photoBusy}
              />
            </label>
          </div>
        </>
      )}
      {kind === "contraction" && (
        <>
          {selectField("intensity", "Intensity", [
            "Mild",
            "Moderate",
            "Strong",
          ])}
        </>
      )}
      {kind === "skipped_nap" && (
        <div className="notice sage">Use the time the nap attempt ended.</div>
      )}
    </>
  );
}

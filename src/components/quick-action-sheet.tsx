import { Clock3, Droplets, Milk, Moon, Sunrise } from "lucide-react";
import { useState } from "react";
import { kindLabels, type ActivityKind, type Child } from "../../shared/types";
import type { QuickActionsController } from "../hooks/use-quick-actions";
import { ActivityIcon } from "./activity-icon";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const otherTrackers: ActivityKind[] = [
  "solids",
  "potty",
  "growth",
  "temperature",
  "medicine",
  "activity",
  "milestone",
  "contraction",
  "note",
];

function BottleChoices({
  child,
  actions,
}: {
  child: Child;
  actions: QuickActionsController;
}) {
  const unit = child.settings.units === "imperial" ? "oz" : "ml";
  const [milkType, setMilkType] = useState(actions.bottle?.milkType || "");
  const amounts =
    unit === "oz" ? [2, 3, 4, 5, 6, 7] : [60, 90, 120, 150, 180, 210];
  return (
    <>
      <div className="quick-milk-options" role="group" aria-label="Milk type">
        {["Breast milk", "Formula", "Mixed"].map((type) => (
          <button
            type="button"
            key={type}
            aria-pressed={milkType === type}
            disabled={actions.busy}
            onClick={() => setMilkType(milkType === type ? "" : type)}
          >
            {type}
          </button>
        ))}
      </div>
      <div className="quick-amounts">
        {amounts.map((amount) => (
          <button
            type="button"
            key={amount}
            disabled={actions.busy}
            onClick={() =>
              void actions.logBottle({
                amount,
                unit,
                ...(milkType ? { milkType } : {}),
              })
            }
            aria-label={`Log bottle ${amount} ${unit}`}
          >
            <strong>{amount}</strong>
            <span>{unit}</span>
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        className="full-width"
        disabled={actions.busy}
        onClick={() => actions.details("bottle")}
      >
        Other amount or time
      </Button>
    </>
  );
}

export function QuickActionSheet({
  child,
  actions,
}: {
  child: Child;
  actions: QuickActionsController;
}) {
  return (
    <Dialog
      open={actions.sheet !== null}
      onOpenChange={(open) => {
        if (!open && !actions.busy) actions.setSheet(null);
      }}
    >
      <DialogContent
        className="quick-action-sheet"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {actions.sheet === "bottle" ? "Bottle amount" : "Quick actions"}
          </DialogTitle>
        </DialogHeader>
        {actions.sheet === "bottle" ? (
          <BottleChoices child={child} actions={actions} />
        ) : (
          <>
            <div className="quick-choice-grid">
              <button
                type="button"
                disabled={actions.busy || !actions.online}
                onClick={() =>
                  void actions.startSleep(actions.night ? "night" : "nap")
                }
              >
                <Moon />
                {actions.night
                  ? actions.label("sleep")
                  : actions.sleep
                    ? "Wake up"
                    : "Start nap"}
              </button>
              {!actions.sleep && !actions.night && (
                <button
                  type="button"
                  disabled={actions.busy || !actions.online}
                  onClick={() => void actions.startSleep("night")}
                >
                  <Moon />
                  Night sleep
                </button>
              )}
              <button
                type="button"
                disabled={actions.busy || !actions.online}
                onClick={() => void actions.nurse("Left")}
              >
                <ActivityIcon kind="nursing" />
                {actions.nursing ? "Stop nursing" : "Nurse left"}
              </button>
              {!actions.nursing && (
                <button
                  type="button"
                  disabled={actions.busy || !actions.online}
                  onClick={() => void actions.nurse("Right")}
                >
                  <ActivityIcon kind="nursing" />
                  Nurse right
                </button>
              )}
              <button
                type="button"
                disabled={actions.busy}
                onClick={() => actions.setSheet("bottle")}
              >
                <Milk />
                Bottle amount
              </button>
              <button
                type="button"
                disabled={actions.busy}
                onClick={() => void actions.diaper("Mixed")}
              >
                <Droplets />
                Wet + dirty
              </button>
              <button
                type="button"
                disabled={actions.busy || !actions.online}
                onClick={() => void actions.activate("pumping")}
              >
                <ActivityIcon kind="pumping" />
                {actions.pumping ? "Stop pumping" : "Start pumping"}
              </button>
              <button
                type="button"
                disabled={
                  actions.busy ||
                  ((!!actions.sleep || !!actions.night) && !actions.online)
                }
                onClick={() => void actions.activate("wake")}
              >
                <Sunrise />
                {actions.night
                  ? "Up for the day"
                  : actions.sleep
                    ? "Wake up"
                    : "Morning wake"}
              </button>
              <button
                type="button"
                disabled={actions.busy || !!actions.sleep || !!actions.night}
                onClick={() => void actions.activate("skipped_nap")}
              >
                <ActivityIcon kind="skipped_nap" />
                Missed nap
              </button>
            </div>
            <div className="quick-other-trackers">
              {otherTrackers.map((kind) => (
                <button
                  type="button"
                  key={kind}
                  disabled={actions.busy}
                  onClick={() => actions.details(kind)}
                >
                  <ActivityIcon kind={kind} size={19} />
                  {kindLabels[kind]}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              className="full-width"
              disabled={actions.busy}
              onClick={() => actions.details("sleep")}
            >
              <Clock3 />
              Earlier entry / add details
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

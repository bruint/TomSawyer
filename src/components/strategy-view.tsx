import { CloudMoon } from "lucide-react";
import type { ActivityKind, Child, Strategy } from "../../shared/types";
import { duration, time } from "../lib/format";
import { PageHeader } from "./page-header";
import { Button } from "./ui/button";

export function StrategyView({
  child,
  strategy,
  onLog,
  quickBusy,
  compare,
  setCompare,
}: {
  child: Child;
  strategy: Strategy | null;
  onLog: (k: ActivityKind) => void;
  quickBusy: boolean;
  compare: number | null;
  setCompare: (n: number | null) => void;
}) {
  if (!strategy) return <div className="loading">Loading plan…</div>;
  return (
    <>
      <PageHeader
        child={child}
        title="Your strategy"
        action={
          <Button
            variant="outline"
            disabled={quickBusy || strategy.status === "sleeping"}
            onClick={() => onLog("skipped_nap")}
          >
            <CloudMoon />
            Missed nap
          </Button>
        }
      />
      <div className="strategy-content">
        {compare !== null && (
          <div className="plan-preview-state">
            <span>
              Preview: {compare} {compare === 1 ? "nap" : "naps"}
            </span>
            <button className="text-button" onClick={() => setCompare(null)}>
              Return to live plan
            </button>
          </div>
        )}
        <section className="plan-overview">
          <h2>{strategy.headline}</h2>
          <p>{strategy.summary}</p>
          {strategy.steps.length > 0 && (
            <div className="plan-stats">
              <span>
                <strong>{duration(strategy.totalNapMinutes)}</strong> day sleep
              </span>
              <span>
                <strong>{duration(strategy.wakeWindowMinutes)}</strong> next
                wake window
              </span>
              {strategy.bedtime && (
                <span>
                  Bed <strong>{time(strategy.bedtime, child.timezone)}</strong>
                </span>
              )}
            </div>
          )}
        </section>
        {strategy.steps.length > 0 && (
          <section className="remaining-plan">
            <h2>From here</h2>
            <ol className="schedule">
              {strategy.steps.map((step) => (
                <li key={step.id}>
                  <span className="schedule-time">
                    <strong>{time(step.at, child.timezone)}</strong>
                    {step.endAt && (
                      <span>– {time(step.endAt, child.timezone)}</span>
                    )}
                  </span>
                  <strong>{step.title}</strong>
                  {step.tentative && (
                    <span className="schedule-estimate">Estimate</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
        {strategy.alternatives.length > 0 && (
          <details className="disclosure">
            <summary>If plans change</summary>
            <div className="plan-explanations">
              {strategy.alternatives.map((a) => (
                <div key={a.title}>
                  <h3>{a.title}</h3>
                  <p>{a.detail}</p>
                </div>
              ))}
            </div>
          </details>
        )}
        <details className="disclosure">
          <summary>Why this plan</summary>
          <div className="plan-explanations">
            {strategy.reasons.map((r) => (
              <div key={r.code}>
                <h3>{r.title}</h3>
                <p>{r.detail}</p>
              </div>
            ))}
            {strategy.steps.map((step) => (
              <div key={step.id}>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
            ))}
            <p>{strategy.caveat}</p>
          </div>
        </details>
        <details className="disclosure">
          <summary>Preview nap counts</summary>
          <div className="nap-options">
            {Array.from(
              new Set([
                Math.max(0, strategy.plannedNaps - 1),
                strategy.plannedNaps,
                Math.min(6, strategy.plannedNaps + 1),
              ]),
            ).map((n) => (
              <button
                className={compare === n ? "selected" : ""}
                aria-pressed={compare === n}
                key={n}
                onClick={() => setCompare(n)}
              >
                {n} {n === 1 ? "nap" : "naps"}
              </button>
            ))}
          </div>
        </details>
      </div>
    </>
  );
}

import { ArrowRight, Check, CloudMoon, Moon, Sparkles } from "lucide-react";
import {
  type ActivityKind,
  type Child,
  type Strategy,
} from "../../shared/types";
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
  if (!strategy) return <div className="loading">Building your plan…</div>;
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
            Log missed nap
          </Button>
        }
      />
      <div className="strategy-layout">
        <div>
          <section className="strategy-intro card">
            <span className="badge sage">
              <Sparkles size={13} />
              {compare !== null ? "Preview · not saved" : strategy.confidence}
            </span>
            <h2>{strategy.headline}</h2>
            <p>{strategy.summary}</p>
            <div className="strategy-numbers">
              <div>
                <small>Day sleep so far</small>
                <strong>{duration(strategy.totalNapMinutes)}</strong>
              </div>
              <div>
                <small>Next wake window</small>
                <strong>{duration(strategy.wakeWindowMinutes)}</strong>
              </div>
              <div>
                <small>Bedtime estimate</small>
                <strong>{time(strategy.bedtime, child.timezone)}</strong>
              </div>
            </div>
          </section>
          <section className="card full-plan">
            <div className="section-heading">
              <h2>Remaining schedule</h2>
              <span className="muted">
                {child.timezone.split("/").at(-1)?.replaceAll("_", " ")}
              </span>
            </div>
            {strategy.steps.length ? (
              <div className="plan-timeline">
                {strategy.steps.map((step, i) => (
                  <div
                    className={`plan-step ${step.kind === "bedtime" ? "bedtime-step" : ""}`}
                    key={step.id}
                  >
                    <div className="plan-time">
                      <strong>{time(step.at, child.timezone)}</strong>
                      {step.endAt && (
                        <small>to {time(step.endAt, child.timezone)}</small>
                      )}
                    </div>
                    <div className="plan-node">
                      {step.kind === "bedtime" ? (
                        <Moon size={19} />
                      ) : step.kind === "wind-down" ? (
                        <Sparkles size={18} />
                      ) : (
                        <CloudMoon size={19} />
                      )}
                    </div>
                    <div className="plan-detail">
                      <div>
                        <h3>{step.title}</h3>
                        <span className="badge neutral">
                          {step.tentative
                            ? "Tentative"
                            : i === 0
                              ? "Up next"
                              : "Estimate"}
                        </span>
                      </div>
                      <p>{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Moon />
                <p>{strategy.summary}</p>
              </div>
            )}
          </section>
          <section className="card">
            <h2>If plans change</h2>
            <div className="contingencies">
              {strategy.alternatives.map((a) => (
                <div key={a.title}>
                  <h3>{a.title}</h3>
                  <p>{a.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside>
          <section className="card reasons-card">
            <h2>Why this plan?</h2>
            {strategy.reasons.map((r) => (
              <div className="reason" key={r.code}>
                <span>
                  <Check size={14} />
                </span>
                <div>
                  <h3>{r.title}</h3>
                  <p>{r.detail}</p>
                </div>
              </div>
            ))}
          </section>
          <section className="card compare-card">
            <h2>Preview nap counts</h2>
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
                  key={n}
                  onClick={() => setCompare(n)}
                >
                  {n} {n === 1 ? "nap" : "naps"}
                </button>
              ))}
            </div>
            {compare !== null && (
              <button className="text-button" onClick={() => setCompare(null)}>
                Back to your live plan
                <ArrowRight size={14} />
              </button>
            )}
          </section>
          <p className="plan-caveat">{strategy.caveat}</p>
          <p className="plan-caveat">
            Wake windows are planning estimates, not medical predictions.
          </p>
        </aside>
      </div>
    </>
  );
}

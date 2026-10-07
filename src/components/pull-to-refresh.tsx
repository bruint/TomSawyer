import { ArrowDown, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { usePullToRefresh } from "../hooks/use-pull-to-refresh";

export function PullToRefresh({
  onRefresh,
  scope,
  disabled = false,
  children,
}: {
  onRefresh: () => Promise<void>;
  scope: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { containerRef, phase, offset } = usePullToRefresh({
    onRefresh,
    scope,
    disabled,
  });
  const refreshing = phase === "refreshing";
  const pulling = phase === "pulling" || phase === "ready";

  return (
    <div
      ref={containerRef}
      className={`pull-to-refresh ${pulling ? "is-pulling" : ""}`}
      style={{ paddingTop: offset }}
    >
      <div
        className={`pull-to-refresh-indicator ${phase === "ready" ? "is-ready" : ""}`}
        style={{ height: offset, opacity: Math.min(1, offset / 40) }}
        role="status"
      >
        {offset > 0 && (
          <>
            {refreshing ? (
              <LoaderCircle
                className="pull-to-refresh-spinner"
                size={18}
                aria-hidden="true"
              />
            ) : (
              <ArrowDown size={18} aria-hidden="true" />
            )}
            <span>
              {refreshing
                ? "Refreshing…"
                : phase === "ready"
                  ? "Release to refresh"
                  : "Pull to refresh"}
            </span>
          </>
        )}
      </div>
      {children}
    </div>
  );
}

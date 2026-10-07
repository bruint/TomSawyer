import { DateTime } from "luxon";
import type { Child } from "../../shared/types";

export function PageHeader({
  child,
  title,
  action,
}: {
  child: Child;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          {DateTime.now().setZone(child.timezone).toFormat("cccc, d LLLL")}
        </div>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

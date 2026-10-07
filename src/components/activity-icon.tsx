import {
  Moon,
  Milk,
  Heart,
  Droplets,
  Apple,
  Pill,
  Ruler,
  Thermometer,
  Blocks,
  Sparkles,
  Flower2,
  NotebookPen,
  Sunrise,
  CloudMoon,
  Baby,
} from "lucide-react";
import type { ActivityKind } from "../../shared/types";
const icons = {
  sleep: Moon,
  nursing: Heart,
  bottle: Milk,
  solids: Apple,
  diaper: Droplets,
  potty: Baby,
  pumping: Milk,
  medicine: Pill,
  growth: Ruler,
  temperature: Thermometer,
  activity: Blocks,
  milestone: Sparkles,
  contraction: Flower2,
  note: NotebookPen,
  wake: Sunrise,
  skipped_nap: CloudMoon,
};
export function ActivityIcon({
  kind,
  size = 20,
}: {
  kind: ActivityKind;
  size?: number;
}) {
  const Icon = icons[kind];
  return <Icon size={size} strokeWidth={1.7} />;
}

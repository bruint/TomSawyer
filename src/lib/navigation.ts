import {
  CalendarDays,
  ChartNoAxesCombined,
  Route,
  Settings2,
  Sun,
} from "lucide-react";

export const navigation = [
  { id: "today", label: "Today", icon: Sun },
  { id: "strategy", label: "Your strategy", icon: Route },
  { id: "history", label: "Journal", icon: CalendarDays },
  { id: "reports", label: "Patterns", icon: ChartNoAxesCombined },
  { id: "settings", label: "Your family", icon: Settings2 },
] as const;

export type Page = (typeof navigation)[number]["id"];
export function parsePage(value: string | null): Page {
  return navigation.find((item) => item.id === value)?.id || "today";
}

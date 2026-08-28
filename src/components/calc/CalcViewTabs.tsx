/** Єдина панель вкладок калькулятора для всіх напрямків. */
import { Calculator, FileText, ShoppingCart, HardHat, ClipboardCheck } from "lucide-react";

export type CalcView = "calc" | "estimate" | "purchase" | "production" | "planfact";

const TABS = [
  ["calc", "Калькулятор", Calculator],
  ["estimate", "Кошторис / КП", FileText],
  ["purchase", "Для закупника", ShoppingCart],
  ["production", "Для прораба", HardHat],
  ["planfact", "План / факт", ClipboardCheck],
] as const;

export function CalcViewTabs({
  view,
  onChange,
}: {
  view: CalcView;
  onChange: (v: CalcView) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border relative z-10 overflow-x-auto">
      {TABS.map(([key, label, Icon]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap transition-colors ${
            view === key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );
}

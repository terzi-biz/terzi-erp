import { Link } from "@tanstack/react-router";
import { MODULE_KEYS, MODULE_LABEL, type ModuleKey } from "@/components/nav-model";

/**
 * Єдина оболонка калькулятора (Prompt №3): однакова послідовність кроків
 * і однаковий перемикач напрямків для всіх п'яти розрахунків.
 * Кроки — це якорі всередині наявної сторінки, дублюючих розрахунків не створюємо.
 */
export const CALC_STEPS = [
  { id: "client", label: "Клієнт і об'єкт" },
  { id: "direction", label: "Напрямок / система" },
  { id: "geometry", label: "Геометрія" },
  { id: "materials", label: "Матеріали і конструкція" },
  { id: "works", label: "Роботи" },
  { id: "logistics", label: "Логістика" },
  { id: "equipment", label: "Обладнання і амортизація" },
  { id: "taxes", label: "Оплата / податки" },
  { id: "result", label: "Результат і перевірка" },
  { id: "save", label: "Збереження кошторису / КП" },
] as const;

export function CalcStepRail({ module }: { module: ModuleKey }) {
  return (
    <div className="panel p-3 sm:p-4 space-y-3 relative z-10">
      <div className="flex flex-wrap gap-1.5">
        {MODULE_KEYS.map((m) => (
          <Link
            key={m}
            to={`/${m}`}
                  search={{ estimate: undefined }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              m === module
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
            }`}
          >
            {MODULE_LABEL[m]}
          </Link>
        ))}
      </div>
      <ol className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        {CALC_STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-secondary text-[9px] font-bold text-foreground">
              {i + 1}
            </span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

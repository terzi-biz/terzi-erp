/**
 * Робочі налаштування амортизації обладнання для калькуляторів.
 *
 * «Враховувати амортизацію» — за замовчуванням УВІМКНЕНО (собівартість).
 * «Включати амортизацію в клієнтську ціну» — за замовчуванням ВИМКНЕНО.
 * Перемикачі змінюють серверний канонічний результат і зберігаються у знімку.
 */
import { NumberInput } from "@/components/NumberInput";
import type { AmortSettings, ClientAmortMode } from "@/lib/core/amortization";

export const AMORT_MODES: { value: ClientAmortMode; label: string; unit?: string }[] = [
  { value: "included_in_works", label: "Включити у роботи" },
  { value: "separate_line", label: "Окремим рядком" },
  { value: "percent_of_works", label: "Відсоток від робіт", unit: "%" },
  { value: "percent_of_works_logistics", label: "Відсоток від робіт і логістики", unit: "%" },
  { value: "percent_of_net_total", label: "Відсоток від кошторису", unit: "%" },
  { value: "per_m2", label: "Грн за м²", unit: "грн/м²" },
  { value: "fixed", label: "Фіксована сума", unit: "грн" },
];

function Toggle({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="text-sm text-foreground">{label}</span>
        {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

export function AmortizationPanel({
  value, onChange, amortCost,
}: {
  value: AmortSettings;
  onChange: (patch: Partial<AmortSettings>) => void;
  /** Розрахована амортизація замовлення, грн (для довідки). */
  amortCost?: number;
}) {
  const mode = AMORT_MODES.find((m) => m.value === value.clientMode);
  const needsValue = !!mode?.unit;

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Амортизація обладнання</h3>
        {typeof amortCost === "number" && amortCost > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            Розрахунок: {amortCost.toLocaleString("uk-UA")} грн
          </span>
        ) : null}
      </header>

      <Toggle
        checked={value.includeInCost}
        onChange={(v) => onChange({ includeInCost: v })}
        label="Враховувати амортизацію"
        hint="Амортизація входить у внутрішню собівартість замовлення."
      />
      <Toggle
        checked={value.includeInClientPrice}
        onChange={(v) => onChange({ includeInClientPrice: v })}
        label="Включити амортизацію в клієнтську ціну"
        hint="Вимкнено за замовчуванням: клієнт не бачить амортизацію окремо."
      />

      {value.includeInClientPrice ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Спосіб</span>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={value.clientMode}
              onChange={(e) => onChange({ clientMode: e.target.value as ClientAmortMode })}
            >
              {AMORT_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          {needsValue ? (
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Значення, {mode?.unit}
              </span>
              <div className="mt-1">
                <NumberInput
                  value={value.clientValue}
                  onChange={(v) => onChange({ clientValue: v })}
                  min={0}
                />
              </div>
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

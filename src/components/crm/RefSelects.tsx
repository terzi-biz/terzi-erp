/**
 * Єдині випадаючі списки довідників (джерело, напрям робіт, співробітник).
 * Значення з цих списків потрапляють у ліди/замовлення й однаково рахуються на дашборді.
 * Якщо в записі вже є нестандартне значення (наприклад, з keyCRM) — воно зберігається як окремий пункт.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CANONICAL_CHANNELS } from "@/lib/marketing/channels";
import { TERZI_MODULES } from "@/lib/modules";
import { listCrmStaff } from "@/lib/crm/board.functions";

type Base = { value: string | null | undefined; onChange: (v: string) => void; className?: string; placeholder?: string };

const cls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-11";

function Sel({ value, onChange, className, placeholder, options }: Base & { options: { v: string; l: string }[] }) {
  const v = value ?? "";
  const known = !v || options.some((o) => o.v === v);
  return (
    <select className={className ?? cls} value={v} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? "— Оберіть —"}</option>
      {!known && <option value={v}>{v} (з імпорту)</option>}
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

export function SourceSelect(p: Base) {
  return <Sel {...p} options={CANONICAL_CHANNELS.map((c) => ({ v: c.label, l: c.label }))} />;
}

export function DirectionSelect(p: Base) {
  return <Sel {...p} options={TERZI_MODULES.filter((m) => m.active !== false).map((m) => ({ v: m.label, l: m.label }))} />;
}

export function useStaff() {
  const fn = useServerFn(listCrmStaff);
  return useQuery({ queryKey: ["crm", "staff"], queryFn: () => fn(), staleTime: 5 * 60_000 }).data ?? [];
}

/** byName=true — зберігає ім'я (для текстових полів, напр. прораб зони); інакше user_id. */
export function StaffSelect(p: Base & { byName?: boolean }) {
  const staff = useStaff() as any[];
  const options = staff
    .filter((s) => s.is_active !== false)
    .map((s) => ({ v: p.byName ? (s.display_name ?? s.user_id) : s.user_id, l: s.display_name ?? "Без імені" }));
  return <Sel {...p} options={options} />;
}

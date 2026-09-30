/**
 * Зони об'єкта в картці ліда: поверхи / частини будинку з власним видом робіт,
 * площею, периметром, товщиною і прорабом. Зберігаються разом із лідом,
 * при створенні замовлення переходять у зони замовлення.
 */
import { Plus, Trash2, Layers } from "lucide-react";
import { ORDER_SERVICES, SERVICE_LABELS } from "@/lib/orders.constants";
import type { LeadZone } from "@/lib/crm/board.server";

const inp = "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm";
const lbl = "text-[11px] uppercase tracking-wider text-muted-foreground";

const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

export function LeadZonesPanel({ zones, onChange }: { zones: LeadZone[]; onChange: (z: LeadZone[]) => void }) {
  const add = () =>
    onChange([...zones, { id: crypto.randomUUID(), name: `Зона ${zones.length + 1}`, service: "", area: null, perimeter: null, thickness_cm: null, foreman: "" }]);
  const set = (id: string, patch: Partial<LeadZone>) => onChange(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const remove = (id: string) => onChange(zones.filter((z) => z.id !== id));
  const totalArea = zones.reduce((s, z) => s + (Number(z.area) || 0), 0);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-bold"><Layers className="h-4 w-4" /> Зони об'єкта</h3>
        <div className="flex items-center gap-2">
          {zones.length > 0 && <span className="text-xs text-muted-foreground">Разом: <b className="text-foreground">{totalArea} м²</b></span>}
          <button type="button" onClick={add} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Додати зону
          </button>
        </div>
      </div>
      {zones.length === 0 ? (
        <p className="text-xs text-muted-foreground">Напр.: «Покрівля — пиріг під ключ», «2 поверх — тепла стяжка», «1 поверх — утеплення + стяжка».</p>
      ) : (
        <div className="space-y-3">
          {zones.map((z) => (
            <div key={z.id} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex gap-2">
                <input className={inp} value={z.name} placeholder="Назва зони" onChange={(e) => set(z.id, { name: e.target.value })} />
                <button type="button" onClick={() => remove(z.id)} aria-label="Видалити зону" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
                <label className="col-span-2 md:col-span-1"><span className={lbl}>Вид робіт</span>
                  <select className={inp} value={z.service ?? ""} onChange={(e) => set(z.id, { service: e.target.value })}>
                    <option value="">—</option>
                    {ORDER_SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s] ?? s}</option>)}
                  </select>
                </label>
                <label><span className={lbl}>Площа, м²</span><input type="number" inputMode="decimal" className={inp} value={z.area ?? ""} onChange={(e) => set(z.id, { area: num(e.target.value) })} /></label>
                <label><span className={lbl}>Периметр, м</span><input type="number" inputMode="decimal" className={inp} value={z.perimeter ?? ""} onChange={(e) => set(z.id, { perimeter: num(e.target.value) })} /></label>
                <label><span className={lbl}>Товщина, см</span><input type="number" inputMode="decimal" className={inp} value={z.thickness_cm ?? ""} onChange={(e) => set(z.id, { thickness_cm: num(e.target.value) })} /></label>
                <label className="col-span-2 md:col-span-1"><span className={lbl}>Прораб</span><input className={inp} value={z.foreman ?? ""} onChange={(e) => set(z.id, { foreman: e.target.value })} /></label>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Зони зберігаються кнопкою «Зберегти» і переходять у замовлення при його створенні.</p>
        </div>
      )}
    </section>
  );
}

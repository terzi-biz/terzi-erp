import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { kyivToday } from "@/lib/kyiv-time";
import { DEFAULT_COMPANY_SALES_TARGET, monthStart, planFactHint } from "@/lib/sales-plan";
import {
  listSalesPlan,
  setSalesPlanUnlock,
  upsertCompanySalesTarget,
  upsertManagerSalesTargets,
} from "@/lib/sales-plan.functions";

export const Route = createFileRoute("/settings/sales-plan")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "План продажів — Налаштування TERZI ERP" },
      { name: "description", content: "Місячний план продажів компанії та менеджерів TERZI. Редагування 1–5 числа місяця." },
      { property: "og:title", content: "План продажів — TERZI ERP" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPlanPage,
});

const money = (n: number) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + " ₴";

function SalesPlanPage() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const today = kyivToday();
  const [month, setMonth] = useState(monthStart(today));
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});

  const listFn = useServerFn(listSalesPlan);
  const saveCompanyFn = useServerFn(upsertCompanySalesTarget);
  const saveManagersFn = useServerFn(upsertManagerSalesTargets);
  const unlockFn = useServerFn(setSalesPlanUnlock);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["sales-plan", month],
    queryFn: () => listFn({ data: { month } }),
  });

  useEffect(() => {
    if (!plan) return;
    setCompany(String(plan.company_target ?? DEFAULT_COMPANY_SALES_TARGET));
    setNotes(plan.notes ?? "");
    const next: Record<string, string> = {};
    for (const m of plan.managers) next[m.user_id] = String(m.target ?? 0);
    setTargets(next);
  }, [plan]);

  const managersTotal = useMemo(
    () => Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0),
    [targets],
  );
  const companyNum = Number(company) || 0;
  const driftPct = companyNum === 0 ? 0 : Math.abs(managersTotal - companyNum) / companyNum;
  const driftWarn = companyNum > 0 && driftPct > 0.01;

  const saveCompany = useMutation({
    mutationFn: () =>
      saveCompanyFn({
        data: { month, company_target: companyNum, notes: notes || null },
      }),
    onSuccess: (res) => {
      if (res.warning) toast.warning(res.warning);
      else toast.success("Корпоративний план збережено");
      qc.invalidateQueries({ queryKey: ["sales-plan", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveManagers = useMutation({
    mutationFn: () =>
      saveManagersFn({
        data: {
          month,
          lines: Object.entries(targets).map(([user_id, target]) => ({
            user_id,
            target: Number(target) || 0,
          })),
        },
      }),
    onSuccess: (res) => {
      if (res.warning) toast.warning(res.warning);
      else toast.success("Плани менеджерів збережено");
      qc.invalidateQueries({ queryKey: ["sales-plan", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlockMut = useMutation({
    mutationFn: (unlocked: boolean) => unlockFn({ data: { month, unlocked } }),
    onSuccess: () => {
      toast.success("Статус unlock оновлено");
      qc.invalidateQueries({ queryKey: ["sales-plan", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editable = plan?.editable ?? false;
  const isAdmin = roles.includes("admin");
  const monthInput = month.slice(0, 7);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Налаштування</div>
            <h1 className="text-xl font-black tracking-tight md:text-3xl">План продажів</h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Корпоративна ціль і розклад по менеджерах. Редагування: 1–5 число місяця плану (Europe/Kyiv).
              Поза вікном — лише адмін (unlock).
            </p>
          </div>
          <Link to="/settings" className="text-xs font-semibold text-primary hover:underline">
            ← Загальні налаштування
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3 md:p-4">
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Місяць</span>
            <input
              type="month"
              value={monthInput}
              onChange={(e) => setMonth(`${e.target.value}-01`)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <div className="text-xs text-muted-foreground">
            Статус:{" "}
            <b className={editable ? "text-success" : "text-warning"}>
              {editable ? "редагування відкрите" : "лише перегляд"}
            </b>
            {plan ? ` · ${plan.edit_reason}` : null}
            {plan?.seeded_default ? (
              <span className="ml-2 text-muted-foreground">
                (немає запису — запропоновано дефолт {money(DEFAULT_COMPANY_SALES_TARGET)})
              </span>
            ) : null}
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              onClick={() => unlockMut.mutate(!plan?.admin_unlocked)}
              disabled={unlockMut.isPending}
            >
              {plan?.admin_unlocked ? "Закрити unlock" : "Admin unlock"}
            </button>
          ) : null}
        </div>

        {isLoading || !plan ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Завантаження…
          </div>
        ) : (
          <>
            <section className="space-y-3 rounded-xl border border-border bg-card p-3 md:p-4">
              <h2 className="text-sm font-bold">Корпоративний план</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">Ціль, ₴</span>
                  <input
                    inputMode="decimal"
                    disabled={!editable}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums disabled:opacity-60"
                  />
                </label>
                <div className="text-xs text-muted-foreground">
                  <div className="mb-1 font-semibold text-foreground">Факт місяця</div>
                  <div className="text-base font-black tabular-nums text-foreground">
                    {plan.fact_contract_value == null ? "немає даних" : money(plan.fact_contract_value)}
                  </div>
                  <div className="mt-1">{planFactHint(plan.fact_contract_value, companyNum)}</div>
                  <div className="mt-2 text-[10px] leading-snug">{plan.fact_label}</div>
                </div>
              </div>
              <label className="block text-xs">
                <span className="mb-1 block text-muted-foreground">Нотатки</span>
                <textarea
                  disabled={!editable}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                />
              </label>
              <button
                type="button"
                disabled={!editable || saveCompany.isPending}
                onClick={() => saveCompany.mutate()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                Зберегти корпоративний план
              </button>
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-card p-3 md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">Плани менеджерів</h2>
                <div className={`text-xs ${driftWarn ? "font-semibold text-warning" : "text-muted-foreground"}`}>
                  Сума менеджерів: {money(managersTotal)}
                  {driftWarn ? " · відхилення > 1% від компанії (збереження дозволене)" : null}
                </div>
              </div>
              {!plan.managers.length ? (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Немає активних менеджерів у user_access
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 pr-2 font-semibold">Менеджер</th>
                        <th className="py-2 pr-2 font-semibold">Відділ / роль</th>
                        <th className="py-2 text-right font-semibold">План, ₴</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.managers.map((m) => (
                        <tr key={m.user_id} className="border-b border-border/60">
                          <td className="py-2 pr-2">
                            <div className="font-semibold">{m.display_name ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{m.email}</div>
                          </td>
                          <td className="py-2 pr-2 text-muted-foreground">
                            {[m.department, m.role_key].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="py-2 text-right">
                            <input
                              inputMode="decimal"
                              disabled={!editable}
                              value={targets[m.user_id] ?? "0"}
                              onChange={(e) => setTargets((prev) => ({ ...prev, [m.user_id]: e.target.value }))}
                              className="w-32 rounded-md border border-border bg-background px-2 py-1 text-right tabular-nums disabled:opacity-60"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                type="button"
                disabled={!editable || saveManagers.isPending}
                onClick={() => saveManagers.mutate()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                Зберегти плани менеджерів
              </button>
            </section>
          </>
        )}
    </div>
  );
}

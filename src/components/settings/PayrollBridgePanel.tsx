import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPayrollBridgeStatus, openPayrollSheet, resendPayrollOrder, searchPayrollOrders } from "@/lib/payroll-bridge.functions";

const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" }) : "—";

export function PayrollOpenButton() {
  const open = useServerFn(openPayrollSheet);
  const m = useMutation({
    mutationFn: () => open(),
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.reason); return; }
      window.open(r.url, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button onClick={() => m.mutate()} disabled={m.isPending}>
      <ExternalLink className="w-4 h-4 mr-2" /> Відкрити відомість Payroll KPI
    </Button>
  );
}

export function PayrollBridgePanel({ showSettings = true }: { showSettings?: boolean }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getPayrollBridgeStatus);
  const searchFn = useServerFn(searchPayrollOrders);
  const resendFn = useServerFn(resendPayrollOrder);
  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState("");
  const st = useQuery({ queryKey: ["payroll-bridge-status"], queryFn: () => statusFn() });
  const orders = useQuery({ queryKey: ["payroll-orders", q], queryFn: () => searchFn({ data: { q } }), enabled: showSettings && !!st.data?.configured });
  const resend = useMutation({
    mutationFn: () => resendFn({ data: { orderId } }),
    onSuccess: (r) => { (r.status === "sent" ? toast.success : r.status === "error" ? toast.error : toast.warning)(r.message); qc.invalidateQueries({ queryKey: ["payroll-bridge-status"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (st.isLoading) return <div className="text-sm text-muted-foreground">Завантаження…</div>;
  if (st.error) return <div className="text-sm text-destructive">{(st.error as Error).message}</div>;
  const s = st.data!;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Зарплата і KPI / інтеграція</h3>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Адреса відомості: </span>{s.siteUrl}</div>
          <div><span className="text-muted-foreground">Endpoint замовлень: </span>{s.endpoint}</div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Стан: </span>
            {s.configured
              ? <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="w-4 h-4" />Секрет налаштовано</span>
              : <span className="inline-flex items-center gap-1 text-destructive"><ShieldAlert className="w-4 h-4" />Потрібне налаштування серверного секрету</span>}
          </div>
          <div><span className="text-muted-foreground">Остання успішна відправка: </span>{fmt(s.lastSent?.created_at)}</div>
          <div className="sm:col-span-2"><span className="text-muted-foreground">Остання помилка: </span>
            {s.lastError ? `${fmt(s.lastError.created_at)} — ${s.lastError.message ?? ""}` : "—"}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          «Налаштовано» означає лише наявність секрету на сервері; факт зв'язку підтверджує тільки успішна відправка з кодом 2xx.
        </p>
        {!s.configured && showSettings && (
          <div className="rounded border border-dashed p-3 text-sm space-y-1">
            <div className="font-semibold">Як безпечно встановити секрет</div>
            <ol className="list-decimal ml-5 space-y-0.5">
              <li>Згенеруйте випадкове значення (≥ 32 символи) у менеджері паролів.</li>
              <li>Внесіть те саме значення як секрет на боці відомості Payroll KPI.</li>
              <li>Додайте його в ERP: Налаштування проєкту → Secrets → ім'я <code>PAYROLL_BRIDGE_SECRET</code>.</li>
              <li>Не вставляйте секрет у чат, код, таблиці, URL чи змінні з префіксом VITE_.</li>
            </ol>
          </div>
        )}
      </section>

      {showSettings && s.configured && (
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold">Ручна повторна відправка об'єкта</h3>
          <Input placeholder="Пошук за назвою або номером" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="w-full rounded border bg-background p-2 text-sm" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">— оберіть об'єкт —</option>
            {(orders.data ?? []).map((o: any) => <option key={o.id} value={o.id}>{o.number ? `${o.number} · ` : ""}{o.name}</option>)}
          </select>
          <Button variant="secondary" disabled={!orderId || resend.isPending} onClick={() => resend.mutate()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Надіслати повторно
          </Button>
        </section>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold mb-2">Журнал відправок</h3>
        {s.recent.length === 0 ? <div className="text-sm text-muted-foreground">Відправок ще не було.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Час</th><th>Об'єкт</th><th>Джерело</th><th>Статус</th><th>Деталі</th></tr></thead>
              <tbody>
                {s.recent.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1 whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td>{r.orders?.number ?? ""} {r.orders?.name ?? r.order_id}</td>
                    <td>{r.trigger}</td>
                    <td>{r.status === "sent" ? <CheckCircle2 className="w-4 h-4 text-primary" /> : r.status === "error" ? <XCircle className="w-4 h-4 text-destructive" /> : "пропущено"}</td>
                    <td className="text-xs text-muted-foreground">{r.http_status ? `HTTP ${r.http_status} ` : ""}{r.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

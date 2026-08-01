/**
 * Картка дзвінка Binotel: прослуховування запису, диспозиція/SLA
 * та повна історія подій інтеграції за generalCallID.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Phone, X } from "lucide-react";
import { getBinotelCallDetail } from "@/lib/binotel.functions";
import { CALL_STATUS_LABEL } from "@/lib/integrations/binotel-constants";

const fmt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
const fmtSec = (n: number | null | undefined) => {
  const s = Number(n ?? 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const SLA_LABEL: Record<string, string> = {
  not_applicable: "—",
  no_task: "Без задачі",
  in_sla: "У межах SLA",
  overdue: "Прострочено SLA",
  done: "Відпрацьовано",
};

export function BinotelCallDialog({ generalCallId, onClose }: { generalCallId: string; onClose: () => void }) {
  const fn = useServerFn(getBinotelCallDetail);
  const q = useQuery({
    queryKey: ["binotel", "call", generalCallId],
    queryFn: () => fn({ data: { generalCallId } }),
  });

  const d = q.data as any;
  const call = d?.call;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold inline-flex items-center gap-2">
              <Phone className="h-4 w-4" /> Дзвінок {generalCallId}
            </h2>
            <p className="text-xs text-muted-foreground">{fmt(call?.started_at)}</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-border p-2" aria-label="Закрити">
            <X className="h-4 w-4" />
          </button>
        </div>

        {q.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Завантаження…</p>}
        {q.error ? <p className="py-6 text-sm text-destructive">{(q.error as any)?.message ?? "Помилка завантаження"}</p> : null}

        {call ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Напрямок" value={call.direction === "inbound" ? "Вхідний" : "Вихідний"} />
              <Field
                label="Диспозиція"
                value={`${CALL_STATUS_LABEL[call.status] ?? call.status ?? "—"}${call.disposition_raw ? ` (${call.disposition_raw})` : ""}`}
                accent={call.is_missed ? "text-destructive" : undefined}
              />
              <Field label="SLA" value={SLA_LABEL[d.sla_status] ?? "—"} />
              <Field label="Номер клієнта" value={call.phone_norm ?? (call.direction === "inbound" ? call.from_number : call.to_number) ?? "—"} />
              <Field label="Контакт" value={d.contact?.full_name ?? "—"} />
              <Field label="Менеджер" value={call.employee_name ?? (call.internal_number ? `вн. ${call.internal_number}` : "—")} />
              <Field label="Номер АТС" value={call.pbx_number_name ?? call.pbx_number ?? "—"} />
              <Field label="Очікування" value={fmtSec(call.wait_seconds)} />
              <Field label="Тривалість розмови" value={fmtSec(call.duration_sec)} />
              <Field label="Лід" value={d.lead?.title ?? "—"} />
              <Field label="Задача" value={d.task ? `${d.task.title} · ${d.task.status}` : "—"} />
              <Field label="Дедлайн задачі" value={fmt(d.task?.due_at)} />
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Запис розмови</div>
              {call.recording_url ? (
                <div className="space-y-2">
                  <audio controls preload="none" src={call.recording_url} className="w-full" />
                  <a
                    href={call.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" /> Завантажити запис
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Запис недоступний для цього дзвінка.</p>
              )}
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Історія подій</div>
              {!d.timeline?.length ? (
                <p className="text-sm text-muted-foreground">Подій інтеграції не зафіксовано.</p>
              ) : (
                <ol className="space-y-2">
                  {d.timeline.map((t: any, i: number) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums">{fmt(t.at)}</span>
                      <span className="flex-1">
                        <span className={t.level === "error" ? "font-semibold text-destructive" : "font-medium"}>{t.title}</span>
                        {t.detail ? <span className="block text-xs text-muted-foreground">{t.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className={`text-sm ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

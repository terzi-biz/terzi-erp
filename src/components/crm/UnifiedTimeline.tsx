/** Єдиний хронологічний таймлайн клієнта з фільтрами за типом події. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Phone, Target, CheckSquare, Package, FileText, Receipt, Banknote, ExternalLink, Inbox, Ruler } from "lucide-react";
import { getClientTimeline, type TimelineItem, type TimelineKind } from "@/lib/crm-timeline.functions";
import { formatUah } from "@/lib/screed-calc";

const KINDS: { key: TimelineKind; label: string; Icon: typeof Phone }[] = [
  { key: "request", label: "Звернення", Icon: Inbox },
  { key: "call", label: "Дзвінки", Icon: Phone },
  { key: "lead", label: "Ліди", Icon: Target },
  { key: "task", label: "Задачі", Icon: CheckSquare },
  { key: "measurement", label: "Заміри", Icon: Ruler },
  { key: "order", label: "Замовлення", Icon: Package },
  { key: "estimate", label: "Кошториси", Icon: FileText },
  { key: "invoice", label: "Рахунки", Icon: Receipt },
  { key: "payment", label: "Оплати", Icon: Banknote },
];


const ICONS = Object.fromEntries(KINDS.map((k) => [k.key, k.Icon])) as Record<TimelineKind, typeof Phone>;

function fmt(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function UnifiedTimeline({ clientId }: { clientId: string }) {
  const fetchTimeline = useServerFn(getClientTimeline);
  const [active, setActive] = useState<TimelineKind[]>([]);
  const { data = [], isLoading } = useQuery({
    queryKey: ["client-timeline", clientId],
    queryFn: () => fetchTimeline({ data: { client_id: clientId, limit: 80 } }),
  });

  const rows = useMemo(
    () => (active.length ? (data as TimelineItem[]).filter((i) => active.includes(i.kind)) : (data as TimelineItem[])),
    [data, active],
  );

  const toggle = (k: TimelineKind) =>
    setActive((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {KINDS.map(({ key, label, Icon }) => {
          const on = active.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold border ${
                on ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 border-border text-muted-foreground"
              }`}
            >
              <Icon className="w-3 h-3" /> {label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground p-2">Завантаження…</div>
      ) : !rows.length ? (
        <div className="text-xs text-muted-foreground p-2">Подій ще немає.</div>
      ) : (
        <ol className="relative space-y-2 border-l border-border pl-4">
          {rows.map((i) => {
            const Icon = ICONS[i.kind] ?? FileText;
            return (
              <li key={i.id} className="relative rounded border border-border bg-secondary/30 p-2 text-xs">
                <span className="absolute -left-[21px] top-3 w-2 h-2 rounded-full bg-primary" />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-semibold truncate">{i.title}</span>
                  </div>
                  {i.amount != null && <span className="font-bold text-primary whitespace-nowrap">{formatUah(i.amount)}</span>}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{fmt(i.at)}{i.subtitle ? ` · ${i.subtitle}` : ""}</span>
                  <span className="flex items-center gap-2">
                    {i.status && <span className="uppercase tracking-wide">{i.status}</span>}
                    {i.href && (
                      <Link to={i.href as any} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * Вкладка «Джерела»: звідки прийшов об'єкт і як дійшов до заміру та замовлення.
 * Відсутні дані показуються як «немає даних», а не як нуль.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getSourceTrace } from "@/lib/source-trace.functions";
import { Badge } from "@/components/ui/badge";
import { Radar, ArrowRight } from "lucide-react";

const dt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" }) : "—";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value ?? "—"}</span>
    </div>
  );
}

export function SourceTrace(props: { orderId?: string | null; leadId?: string | null; measurementId?: string | null }) {
  const fetchTrace = useServerFn(getSourceTrace);
  const { data, isLoading } = useQuery({
    queryKey: ["source-trace", props.orderId ?? null, props.leadId ?? null, props.measurementId ?? null],
    queryFn: () =>
      fetchTrace({
        data: {
          orderId: props.orderId ?? null,
          leadId: props.leadId ?? null,
          measurementId: props.measurementId ?? null,
        },
      }),
  });

  if (isLoading) return <div className="panel p-4 text-sm text-muted-foreground">Завантаження джерела…</div>;
  if (!data) return <div className="panel p-4 text-sm text-muted-foreground">Немає даних про джерело.</div>;

  const utm = Object.entries(data.utm);
  const clicks = Object.entries(data.clickIds);

  return (
    <div className="space-y-4">
      <section className="panel p-4 space-y-3">
        <header className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-wider text-primary">Джерело звернення</h3>
        </header>
        <Row label="Джерело" value={data.source ?? data.externalSource ?? "немає даних"} />
        <Row label="Канал" value={data.channelName ?? "немає даних"} />
        <Row label="Кампанія" value={data.campaignName ?? "немає даних"} />
        <Row label="Зовнішня система" value={data.externalSource ? `${data.externalSource}${data.externalId ? ` · ${data.externalId}` : ""}` : "немає даних"} />
        <Row label="Перший дотик" value={dt(data.firstTouchAt)} />
        <Row label="Останній дотик" value={dt(data.lastTouchAt)} />
        <Row label="Кількість дотиків" value={data.touchCount || "немає даних"} />
      </section>

      <section className="panel p-4 space-y-3">
        <h3 className="font-bold text-sm uppercase tracking-wider text-primary">UTM і рекламні ідентифікатори</h3>
        {utm.length === 0 && clicks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Немає даних — звернення прийшло без рекламних міток.</p>
        ) : (
          <>
            {utm.map(([k, v]) => <Row key={k} label={k} value={v} />)}
            {clicks.map(([k, v]) => <Row key={k} label={k} value={v} />)}
          </>
        )}
      </section>

      <section className="panel p-4 space-y-3">
        <h3 className="font-bold text-sm uppercase tracking-wider text-primary">Ланцюг конверсії</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={data.leadId ? "default" : "outline"}>
            {data.leadId ? "Лід" : "Ліда немає"}
          </Badge>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          <Badge variant={data.convertedToMeasurement ? "default" : "outline"}>
            {data.convertedToMeasurement ? "Замір" : "Заміру немає"}
          </Badge>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          <Badge variant={data.convertedToOrder ? "default" : "outline"}>
            {data.convertedToOrder ? "Замовлення" : "Замовлення немає"}
          </Badge>
        </div>
        <Row label="Лід" value={data.leadId ? <Link to="/crm/leads" className="text-primary hover:underline">{data.leadTitle ?? data.leadId.slice(0, 8)}</Link> : "немає даних"} />
        <Row label="Створено лід" value={dt(data.leadCreatedAt)} />
        <Row label="Замір" value={data.measurementId ? `${data.measurementStatus ?? "—"} · ${dt(data.measurementScheduledAt)}` : "немає даних"} />
        <Row
          label="Замовлення"
          value={data.orderId
            ? <Link to="/orders/$id" params={{ id: data.orderId }} className="text-primary hover:underline">{data.orderNumber ?? data.orderId.slice(0, 8)}</Link>
            : "немає даних"}
        />
      </section>
    </div>
  );
}

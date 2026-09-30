import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Check, Loader2, Plus, Search, X } from "lucide-react";
import { upsertClient } from "@/lib/clients.functions";
import { saveOrder } from "@/lib/orders.functions";
import { searchLinkTargets, type LinkHit, type LinkKind } from "@/lib/link-search.functions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type EstimateLink = {
  clientId: string | null;
  orderId: string | null;
};

type Meta = { clientName?: string; clientPhone?: string; address?: string };

const inp = "w-full bg-input border border-border rounded-lg px-3 py-2 text-sm";
const TABS: { key: LinkKind; label: string }[] = [
  { key: "leads", label: "Ліди" },
  { key: "measurements", label: "Заміри" },
  { key: "orders", label: "Замовлення" },
  { key: "clients", label: "Клієнти" },
];

/**
 * Привʼязка кошторису: пошук по телефону / назві / адресі серед лідів, замірів,
 * замовлень і клієнтів. Параметр URL `?lead=<id>` підставляє лід автоматично.
 */
export function EstimateLinkPicker({
  value,
  onChange,
  defaults,
}: {
  value: EstimateLink;
  onChange: (v: EstimateLink, meta?: Meta) => void;
  defaults?: Meta;
}) {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchLinkTargets);
  const fnSaveClient = useServerFn(upsertClient);
  const fnSaveObject = useServerFn(saveOrder);

  const [tab, setTab] = useState<LinkKind>("leads");
  const [q, setQ] = useState(defaults?.clientPhone ?? "");
  const dq = useDebouncedValue(q, 300);
  const [picked, setPicked] = useState<LinkHit | null>(null);
  const [newClient, setNewClient] = useState<null | { name: string; phone: string; address: string }>(null);

  const hits = useQuery({
    queryKey: ["link-search", tab, dq],
    queryFn: () => searchFn({ data: { kind: tab, q: dq } }),
    staleTime: 30_000,
  });

  const choose = (h: LinkHit) => {
    setPicked(h);
    onChange(
      { clientId: h.clientId, orderId: h.orderId },
      { clientName: h.kind === "clients" ? h.title : h.subtitle ?? h.title, clientPhone: h.phone ?? undefined, address: h.address ?? undefined },
    );
  };

  // Привʼязка з картки ліда: /calc?lead=<id>
  useEffect(() => {
    if (typeof window === "undefined" || value.clientId || value.orderId) return;
    const leadId = new URLSearchParams(window.location.search).get("lead");
    if (!leadId) return;
    searchFn({ data: { kind: "leads", q: "" } }).then((rows) => {
      const h = rows.find((r) => r.id === leadId);
      if (h) choose(h);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createClient = useMutation({
    mutationFn: (p: { name: string; phone: string; address: string }) =>
      fnSaveClient({ data: { name: p.name, phone: p.phone || null, address: p.address || null, status: "lead" } }),
    onSuccess: (row: any, p) => {
      setNewClient(null);
      qc.invalidateQueries({ queryKey: ["link-search"] });
      choose({ id: row.id, kind: "clients", title: row.name, subtitle: null, phone: p.phone, address: p.address, clientId: row.id, orderId: null, area: null });
      toast.success("Клієнта створено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити клієнта"),
  });

  const createOrder = useMutation({
    mutationFn: () => fnSaveObject({ data: { name: picked?.address || picked?.title || "Нове замовлення", address: picked?.address || null, client_id: value.clientId } }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      onChange({ clientId: value.clientId, orderId: row.id }, { address: row.address ?? undefined });
      toast.success("Замовлення створено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити замовлення"),
  });

  const rows = hits.data ?? [];

  return (
    <div className="space-y-3">
      {(value.clientId || value.orderId) && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <Check className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0 flex-1 truncate">
            {picked ? <><b>{picked.title}</b>{picked.phone ? ` · ${picked.phone}` : ""}</> : "Привʼязано"}
            <span className="text-muted-foreground">{value.orderId ? " · є замовлення" : " · без замовлення"}</span>
          </div>
          <button type="button" onClick={() => { setPicked(null); onChange({ clientId: null, orderId: null }); }}
            className="grid h-8 w-8 place-items-center rounded hover:bg-accent" aria-label="Відвʼязати"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`min-h-9 rounded-md text-xs font-semibold ${tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className={`${inp} pl-9`} inputMode="search" placeholder="Телефон (можна останні 4 цифри), імʼя або адреса"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {hits.isLoading ? (
          <div className="p-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Пошук…</div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Нічого не знайдено</div>
        ) : rows.map((h) => (
          <button key={`${h.kind}-${h.id}`} type="button" onClick={() => choose(h)}
            className={`w-full text-left px-3 py-2.5 hover:bg-muted ${picked?.id === h.id ? "bg-muted" : ""}`}>
            <div className="text-sm font-semibold truncate">{h.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {[h.subtitle, h.phone, h.address, h.area ? `${h.area} м²` : null].filter(Boolean).join(" · ") || "—"}
              {!h.clientId && h.kind !== "clients" ? " · без клієнта" : ""}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold hover:bg-accent"
          onClick={() => setNewClient({ name: defaults?.clientName ?? "", phone: defaults?.clientPhone ?? q, address: defaults?.address ?? "" })}>
          <Plus className="h-3.5 w-3.5" /> Новий клієнт
        </button>
        {value.clientId && !value.orderId && (
          <button type="button" disabled={createOrder.isPending} onClick={() => createOrder.mutate()}
            className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-50">
            <Building2 className="h-3.5 w-3.5" /> Створити замовлення
          </button>
        )}
      </div>

      {!value.clientId && (
        <div className="text-xs text-amber-600">Кошторис не привʼязаний до клієнта. Для статусів «Фінальний», «В роботі», «Виконано» звʼязка обовʼязкова.</div>
      )}

      {newClient && (
        <div className="panel p-3 space-y-2">
          <div className="text-sm font-semibold">Новий клієнт</div>
          <input className={inp} placeholder="Назва / ПІБ" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
          <input className={inp} placeholder="Телефон" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
          <input className={inp} placeholder="Адреса" value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
          <div className="flex gap-2">
            <button type="button" disabled={!newClient.name.trim() || createClient.isPending} onClick={() => createClient.mutate(newClient)}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">Створити</button>
            <button type="button" onClick={() => setNewClient(null)} className="px-3 py-1.5 rounded bg-secondary text-sm">Скасувати</button>
          </div>
        </div>
      )}
    </div>
  );
}

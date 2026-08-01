import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Loader2, Plus, User } from "lucide-react";
import { listClients, upsertClient } from "@/lib/clients.functions";
import { listObjects, saveObject } from "@/lib/objects.functions";

export type EstimateLink = {
  clientId: string | null;
  objectId: string | null;
};

const inp = "w-full bg-input border border-border rounded-lg px-3 py-2 text-sm";

/**
 * Привʼязка кошторису до клієнта та об'єкта зі швидким створенням,
 * якщо потрібного запису ще немає.
 */
export function EstimateLinkPicker({
  value,
  onChange,
  defaults,
}: {
  value: EstimateLink;
  onChange: (v: EstimateLink, meta?: { clientName?: string; clientPhone?: string; address?: string }) => void;
  defaults?: { clientName?: string; clientPhone?: string; address?: string };
}) {
  const qc = useQueryClient();
  const fnClients = useServerFn(listClients);
  const fnObjects = useServerFn(listObjects);
  const fnSaveClient = useServerFn(upsertClient);
  const fnSaveObject = useServerFn(saveObject);

  const clients = useQuery({ queryKey: ["clients"], queryFn: () => fnClients() });
  const objects = useQuery({ queryKey: ["objects"], queryFn: () => fnObjects() });

  const [newClient, setNewClient] = useState<null | { name: string; phone: string; address: string }>(null);
  const [newObject, setNewObject] = useState<null | { name: string; address: string }>(null);

  const clientList = (clients.data ?? []) as any[];
  const objectList = useMemo(() => {
    const rows = (objects.data ?? []) as any[];
    return value.clientId ? rows.filter((o) => o.client_id === value.clientId) : rows;
  }, [objects.data, value.clientId]);

  const createClient = useMutation({
    mutationFn: (p: { name: string; phone: string; address: string }) =>
      fnSaveClient({ data: { name: p.name, phone: p.phone || null, address: p.address || null, status: "lead" } }),
    onSuccess: (row: any, p) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setNewClient(null);
      onChange({ clientId: row.id, objectId: null }, { clientName: row.name, clientPhone: p.phone, address: p.address });
      toast.success("Клієнта створено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити клієнта"),
  });

  const createObject = useMutation({
    mutationFn: (p: { name: string; address: string }) =>
      fnSaveObject({ data: { name: p.name, address: p.address || null, client_id: value.clientId } }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["objects"] });
      setNewObject(null);
      onChange({ clientId: value.clientId, objectId: row.id }, { address: row.address ?? undefined });
      toast.success("Об'єкт створено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити об'єкт"),
  });

  const loading = clients.isLoading || objects.isLoading;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Клієнт */}
        <div className="space-y-1">
          <label className="text-xs uppercase text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Клієнт</label>
          <div className="flex gap-2">
            <select
              className={inp}
              value={value.clientId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const c = clientList.find((x) => x.id === id);
                onChange({ clientId: id, objectId: null }, c ? { clientName: c.name, clientPhone: c.phone ?? "", address: c.address ?? "" } : undefined);
              }}
            >
              <option value="">— не привʼязано —</option>
              {clientList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setNewClient({ name: defaults?.clientName ?? "", phone: defaults?.clientPhone ?? "", address: defaults?.address ?? "" })}
              className="px-2 rounded-lg bg-secondary hover:bg-accent"
              title="Швидко створити клієнта"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Об'єкт */}
        <div className="space-y-1">
          <label className="text-xs uppercase text-muted-foreground flex items-center gap-1"><Building2 className="w-3 h-3" /> Об'єкт</label>
          <div className="flex gap-2">
            <select
              className={inp}
              value={value.objectId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const o = objectList.find((x) => x.id === id);
                onChange({ clientId: o?.client_id ?? value.clientId, objectId: id }, o ? { address: o.address ?? "" } : undefined);
              }}
            >
              <option value="">— не привʼязано —</option>
              {objectList.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.address ? ` · ${o.address}` : ""}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!value.clientId}
              onClick={() => setNewObject({ name: defaults?.address ?? "", address: defaults?.address ?? "" })}
              className="px-2 rounded-lg bg-secondary hover:bg-accent disabled:opacity-40"
              title={value.clientId ? "Швидко створити об'єкт" : "Спочатку оберіть клієнта"}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Завантаження довідників…</div>}

      {!value.clientId && (
        <div className="text-xs text-amber-600">Кошторис не привʼязаний до клієнта. Для статусів «Фінальний», «В роботі», «Виконано» звʼязка обовʼязкова.</div>
      )}
      {value.clientId && !value.objectId && (
        <div className="text-xs text-amber-600">Оберіть або створіть об'єкт для цього клієнта.</div>
      )}

      {newClient && (
        <div className="panel p-3 space-y-2">
          <div className="text-sm font-semibold">Новий клієнт</div>
          <input className={inp} placeholder="Назва / ПІБ" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
          <input className={inp} placeholder="Телефон" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
          <input className={inp} placeholder="Адреса" value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newClient.name.trim() || createClient.isPending}
              onClick={() => createClient.mutate(newClient)}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              Створити
            </button>
            <button type="button" onClick={() => setNewClient(null)} className="px-3 py-1.5 rounded bg-secondary text-sm">Скасувати</button>
          </div>
        </div>
      )}

      {newObject && (
        <div className="panel p-3 space-y-2">
          <div className="text-sm font-semibold">Новий об'єкт</div>
          <input className={inp} placeholder="Назва об'єкта" value={newObject.name} onChange={(e) => setNewObject({ ...newObject, name: e.target.value })} />
          <input className={inp} placeholder="Адреса" value={newObject.address} onChange={(e) => setNewObject({ ...newObject, address: e.target.value })} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newObject.name.trim() || createObject.isPending}
              onClick={() => createObject.mutate(newObject)}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              Створити
            </button>
            <button type="button" onClick={() => setNewObject(null)} className="px-3 py-1.5 rounded bg-secondary text-sm">Скасувати</button>
          </div>
        </div>
      )}
    </div>
  );
}

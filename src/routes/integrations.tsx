import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Cable, Copy, KeyRound, Link2, Loader2, Plug, Plus, RefreshCw, Send, Shield, Trash2, Webhook,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  AUTH_LABEL, DIRECTION_LABEL, EVENT_STATUS_LABEL, EVENT_STATUS_TONE, MAPPING_ENTITIES,
  STATUS_LABEL, STATUS_TONE, type EventStatus, type IntegrationStatus,
} from "@/lib/integrations-constants";
import {
  bindIntegrationSecret, cancelIntegrationEvent, createIntegration, deleteIntegration, deleteIntegrationMapping,
  deleteIntegrationWebhook, enqueueIntegrationTestEvent, getIntegrationQueueStats, listIntegrationEventLogs,
  listIntegrationEvents, listIntegrationMappings, listIntegrationProviders, listIntegrations, retryIntegrationEvent,
  runIntegrationQueue, saveIntegrationMapping, saveIntegrationWebhook, startIntegrationOAuth,
  testIntegrationConnection, unbindIntegrationSecret, updateIntegration,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Інтеграції та API — TERZI ERP" },
      { name: "description", content: "Ядро інтеграцій TERZI: підключення, ключі, вебхуки, черга подій, журнал і мапінг полів." },
      { property: "og:title", content: "Інтеграції та API — TERZI ERP" },
      { property: "og:description", content: "Ядро інтеграцій TERZI: підключення, ключі, вебхуки, черга подій, журнал і мапінг полів." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationsPage,
});

type Tab = "connections" | "webhooks" | "mapping" | "queue" | "logs";

const TABS: { id: Tab; label: string }[] = [
  { id: "connections", label: "Підключення" },
  { id: "webhooks", label: "Вебхуки" },
  { id: "mapping", label: "Мапінг полів" },
  { id: "queue", label: "Черга подій" },
  { id: "logs", label: "Журнал" },
];

function fmt(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function IntegrationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("connections");
  const [selected, setSelected] = useState<string | null>(null);

  const fnProviders = useServerFn(listIntegrationProviders);
  const fnList = useServerFn(listIntegrations);
  const fnStats = useServerFn(getIntegrationQueueStats);

  const providers = useQuery({ queryKey: ["int-providers"], queryFn: () => fnProviders(), enabled: !!user });
  const items = useQuery({ queryKey: ["integrations"], queryFn: () => fnList(), enabled: !!user });
  const stats = useQuery({ queryKey: ["int-stats"], queryFn: () => fnStats(), enabled: !!user, refetchInterval: 30000 });

  const list = (items.data ?? []) as any[];
  const active = useMemo(() => list.find((i) => i.id === selected) ?? list[0] ?? null, [list, selected]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["integrations"] });
    qc.invalidateQueries({ queryKey: ["int-stats"] });
    qc.invalidateQueries({ queryKey: ["int-events"] });
  };

  if (items.isError) {
    return (
      <div className="p-6">
        <div className="panel p-6 text-sm text-muted-foreground">
          Розділ доступний лише власнику та операційному адміністратору.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Cable className="w-6 h-6 text-primary" /> Інтеграції та API
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ядро підключень: ключі, вебхуки, черга з повторами, журнал подій і мапінг полів.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["pending", "failed", "dead", "done"] as EventStatus[]).map((s) => (
            <span key={s} className={`px-2.5 py-1 rounded-full font-semibold ${EVENT_STATUS_TONE[s]}`}>
              {EVENT_STATUS_LABEL[s]}: {(stats.data as any)?.[s] ?? 0}
            </span>
          ))}
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "connections" && (
        <Connections
          list={list}
          providers={(providers.data ?? []) as any[]}
          active={active}
          onSelect={setSelected}
          onChanged={invalidate}
          loading={items.isLoading}
        />
      )}
      {tab === "webhooks" && <Webhooks list={list} active={active} onSelect={setSelected} onChanged={invalidate} />}
      {tab === "mapping" && <Mapping list={list} active={active} onSelect={setSelected} />}
      {tab === "queue" && <Queue list={list} onChanged={invalidate} />}
      {tab === "logs" && <Queue list={list} onChanged={invalidate} logsOnly />}
    </div>
  );
}

/* ------------------------------- Підключення ------------------------------ */

function Connections({
  list, providers, active, onSelect, onChanged, loading,
}: { list: any[]; providers: any[]; active: any; onSelect: (id: string) => void; onChanged: () => void; loading: boolean }) {
  const [providerKey, setProviderKey] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: useServerFn(createIntegration),
    onSuccess: () => { toast.success("Підключення створено"); setName(""); setProviderKey(""); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити"),
  });
  const update = useMutation({
    mutationFn: useServerFn(updateIntegration),
    onSuccess: () => { toast.success("Збережено"); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteIntegration),
    onSuccess: () => { toast.success("Видалено"); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const test = useMutation({
    mutationFn: useServerFn(testIntegrationConnection),
    onSuccess: (r: any) => { r.ok ? toast.success(r.message) : toast.error(r.message); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="panel p-4 space-y-2">
          <div className="text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Нове підключення</div>
          <select value={providerKey} onChange={(e) => setProviderKey(e.target.value)} className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm">
            <option value="">Оберіть сервіс…</option>
            {providers.map((p) => (
              <option key={p.key} value={p.key}>{p.name}{p.has_adapter ? "" : " (адаптер у планах)"}</option>
            ))}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва підключення" className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm" />
          <button
            disabled={!providerKey || name.trim().length < 2 || create.isPending}
            onClick={() => create.mutate({ providerKey, name: name.trim() })}
            className="w-full bg-primary text-primary-foreground rounded px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {create.isPending ? "Створення…" : "Створити"}
          </button>
        </div>

        <div className="panel divide-y divide-border overflow-hidden">
          {loading && <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Завантаження…</div>}
          {!loading && list.length === 0 && <div className="p-4 text-sm text-muted-foreground">Підключень ще немає.</div>}
          {list.map((i) => (
            <button key={i.id} onClick={() => onSelect(i.id)} className={`w-full text-left p-3 hover:bg-accent ${active?.id === i.id ? "bg-accent" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate">{i.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_TONE[i.status as IntegrationStatus]}`}>{STATUS_LABEL[i.status as IntegrationStatus]}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{i.provider_name} · {AUTH_LABEL[i.auth_kind as keyof typeof AUTH_LABEL] ?? i.auth_kind}</div>
            </button>
          ))}
        </div>
      </div>

      {active ? (
        <ConnectionCard
          item={active}
          onChanged={onChanged}
          onUpdate={(p) => update.mutate(p)}
          onRemove={() => { if (confirm(`Видалити «${active.name}»?`)) remove.mutate({ id: active.id }); }}
          onTest={() => test.mutate({ id: active.id })}
          testing={test.isPending}
        />
      ) : (
        <div className="panel p-6 text-sm text-muted-foreground">Оберіть або створіть підключення.</div>
      )}
    </div>
  );
}

function ConnectionCard({
  item, onChanged, onUpdate, onRemove, onTest, testing,
}: { item: any; onChanged: () => void; onUpdate: (p: any) => void; onRemove: () => void; onTest: () => void; testing: boolean }) {
  const [configText, setConfigText] = useState(() => JSON.stringify(item.config ?? {}, null, 2));
  const [secretKey, setSecretKey] = useState("api_key");
  const [secretRef, setSecretRef] = useState("");
  const [eventType, setEventType] = useState("echo.ping");

  const bind = useMutation({
    mutationFn: useServerFn(bindIntegrationSecret),
    onSuccess: (r: any) => { r.present ? toast.success("Ключ прив'язано") : toast.warning("Прив'язано, але значення секрету ще не задане"); setSecretRef(""); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const unbind = useMutation({
    mutationFn: useServerFn(unbindIntegrationSecret),
    onSuccess: () => { toast.success("Прив'язку знято"); onChanged(); },
  });
  const oauth = useMutation({
    mutationFn: useServerFn(startIntegrationOAuth),
    onSuccess: (r: any) => { window.location.href = r.url; },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const testEvent = useMutation({
    mutationFn: useServerFn(enqueueIntegrationTestEvent),
    onSuccess: (r: any) => { toast.success(r.duplicate ? "Дублікат — подія вже в черзі" : "Подію поставлено в чергу"); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const saveConfig = () => {
    try {
      onUpdate({ id: item.id, config: JSON.parse(configText || "{}") });
    } catch {
      toast.error("Налаштування мають бути коректним JSON");
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-black flex items-center gap-2"><Plug className="w-5 h-5 text-primary" /> {item.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{item.provider_name} · slug: <code>{item.slug}</code></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onTest} disabled={testing} className="px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent disabled:opacity-50">
              {testing ? "Перевірка…" : "Перевірити з'єднання"}
            </button>
            <button onClick={() => onUpdate({ id: item.id, enabled: !item.enabled })} className="px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent">
              {item.enabled ? "Вимкнути" : "Увімкнути"}
            </button>
            <button onClick={onRemove} className="px-3 py-1.5 rounded bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <div className="bg-secondary rounded p-2">Остання перевірка: <b>{fmt(item.last_test_at)}</b></div>
          <div className="bg-secondary rounded p-2">Останній успіх: <b>{fmt(item.last_success_at)}</b></div>
          <div className="bg-secondary rounded p-2">Стан: <b>{STATUS_LABEL[item.status as IntegrationStatus]}</b></div>
        </div>

        {item.last_error && (
          <div className="text-xs text-destructive flex items-start gap-2 bg-destructive/10 rounded p-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> <span>{item.last_error}</span>
          </div>
        )}
        {!item.has_adapter && (
          <div className="text-xs text-muted-foreground bg-secondary rounded p-2">
            Адаптер цього сервісу ще не реалізовано — ядро вже готове, підключення буде активним після додавання адаптера.
          </div>
        )}
      </div>

      <div className="panel p-4 space-y-2">
        <div className="text-sm font-bold flex items-center gap-2"><KeyRound className="w-4 h-4" /> Ключі й токени</div>
        <p className="text-xs text-muted-foreground">
          Значення ключів не зберігаються в базі. Тут задається лише ім'я секрету, у якому лежить значення.
        </p>
        <div className="space-y-1">
          {(item.secrets ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm bg-secondary rounded px-2 py-1.5">
              <span className="font-mono text-xs truncate">{s.secret_key} → {s.secret_ref}</span>
              <span className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.is_set ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive"}`}>
                  {s.is_set ? "задано" : "порожньо"}
                </span>
                <button onClick={() => unbind.mutate({ id: s.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            </div>
          ))}
          {(item.secrets ?? []).length === 0 && <div className="text-xs text-muted-foreground">Ключів ще не прив'язано.</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="ключ (api_key)" className="bg-input border border-border rounded px-2 py-1.5 text-sm w-40" />
          <input value={secretRef} onChange={(e) => setSecretRef(e.target.value.toUpperCase())} placeholder="ІМ'Я_СЕКРЕТУ" className="bg-input border border-border rounded px-2 py-1.5 text-sm font-mono flex-1 min-w-[180px]" />
          <button
            disabled={!secretRef || bind.isPending}
            onClick={() => bind.mutate({ integrationId: item.id, secretKey, secretRef })}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            Прив'язати
          </button>
        </div>
        {item.auth_kind === "oauth2" && (
          <button
            onClick={() => oauth.mutate({ integrationId: item.id, redirectUri: `${window.location.origin}/api/public/integrations/oauth/callback` })}
            className="mt-1 px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent flex items-center gap-2"
          >
            <Shield className="w-4 h-4" /> Підключити через OAuth
          </button>
        )}
      </div>

      <div className="panel p-4 space-y-2">
        <div className="text-sm font-bold">Налаштування (JSON)</div>
        <textarea value={configText} onChange={(e) => setConfigText(e.target.value)} rows={6} className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono" />
        <button onClick={saveConfig} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold">Зберегти налаштування</button>
      </div>

      <div className="panel p-4 space-y-2">
        <div className="text-sm font-bold flex items-center gap-2"><Send className="w-4 h-4" /> Тестова подія</div>
        <div className="flex flex-wrap gap-2">
          <input value={eventType} onChange={(e) => setEventType(e.target.value)} className="bg-input border border-border rounded px-2 py-1.5 text-sm flex-1 min-w-[180px]" />
          <button
            onClick={() => testEvent.mutate({ integrationId: item.id, eventType, payload: { ts: Date.now() } })}
            className="px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent"
          >
            Поставити в чергу
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Вебхуки -------------------------------- */

function Webhooks({ list, active, onSelect, onChanged }: { list: any[]; active: any; onSelect: (id: string) => void; onChanged: () => void }) {
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [targetUrl, setTargetUrl] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [signatureHeader, setSignatureHeader] = useState("x-signature");

  const save = useMutation({
    mutationFn: useServerFn(saveIntegrationWebhook),
    onSuccess: () => { toast.success("Вебхук збережено"); setTargetUrl(""); setSecretRef(""); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteIntegrationWebhook),
    onSuccess: () => { toast.success("Видалено"); onChanged(); },
  });

  if (!active) return <div className="panel p-6 text-sm text-muted-foreground">Спершу створіть підключення.</div>;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-4">
      <select value={active.id} onChange={(e) => onSelect(e.target.value)} className="bg-input border border-border rounded px-2 py-1.5 text-sm">
        {list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>

      <div className="panel divide-y divide-border">
        {(active.webhooks ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">Вебхуків ще немає.</div>}
        {(active.webhooks ?? []).map((h: any) => {
          const url = h.direction === "inbound" ? `${origin}/api/public/integrations/webhook/${h.slug}` : h.target_url;
          return (
            <div key={h.id} className="p-3 flex flex-wrap items-center gap-2 justify-between">
              <div className="min-w-0">
                <div className="text-xs font-bold">{DIRECTION_LABEL[h.direction as "inbound" | "outbound"]} · {h.signature_mode}</div>
                <div className="text-xs font-mono text-muted-foreground break-all">{url}</div>
              </div>
              <div className="flex gap-2">
                {url && (
                  <button onClick={() => { navigator.clipboard.writeText(url); toast.success("Скопійовано"); }} className="px-2 py-1 rounded bg-secondary text-xs font-semibold hover:bg-accent flex items-center gap-1">
                    <Copy className="w-3.5 h-3.5" /> Копіювати
                  </button>
                )}
                <button onClick={() => remove.mutate({ id: h.id })} className="px-2 py-1 rounded bg-destructive/10 text-destructive text-xs font-semibold"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel p-4 space-y-2">
        <div className="text-sm font-bold flex items-center gap-2"><Webhook className="w-4 h-4" /> Новий вебхук</div>
        <div className="flex flex-wrap gap-2">
          <select value={direction} onChange={(e) => setDirection(e.target.value as any)} className="bg-input border border-border rounded px-2 py-1.5 text-sm">
            <option value="inbound">Вхідний</option>
            <option value="outbound">Вихідний</option>
          </select>
          {direction === "outbound" && (
            <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" className="bg-input border border-border rounded px-2 py-1.5 text-sm flex-1 min-w-[200px]" />
          )}
          <input value={signatureHeader} onChange={(e) => setSignatureHeader(e.target.value)} placeholder="заголовок підпису" className="bg-input border border-border rounded px-2 py-1.5 text-sm w-44" />
          <input value={secretRef} onChange={(e) => setSecretRef(e.target.value.toUpperCase())} placeholder="ІМ'Я_СЕКРЕТУ_ПІДПИСУ" className="bg-input border border-border rounded px-2 py-1.5 text-sm font-mono w-56" />
          <button
            onClick={() => save.mutate({
              integrationId: active.id, direction,
              targetUrl: direction === "outbound" ? targetUrl : null,
              signatureHeader, secretRef: secretRef || null,
              signatureMode: secretRef ? "hmac_sha256" : "none",
            })}
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold"
          >
            Додати
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Без заданого секрету підпис не перевіряється — використовуйте лише для тестового адаптера.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- Мапінг полів ----------------------------- */

function Mapping({ list, active, onSelect }: { list: any[]; active: any; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const fnList = useServerFn(listIntegrationMappings);
  const [entity, setEntity] = useState(MAPPING_ENTITIES[0].key);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState(MAPPING_ENTITIES[0].fields[0]);

  const rows = useQuery({
    queryKey: ["int-mappings", active?.id],
    queryFn: () => fnList({ data: { integrationId: active.id } }),
    enabled: !!active?.id,
  });
  const save = useMutation({
    mutationFn: useServerFn(saveIntegrationMapping),
    onSuccess: () => { toast.success("Збережено"); setSource(""); qc.invalidateQueries({ queryKey: ["int-mappings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const remove = useMutation({
    mutationFn: useServerFn(deleteIntegrationMapping),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["int-mappings"] }),
  });

  if (!active) return <div className="panel p-6 text-sm text-muted-foreground">Спершу створіть підключення.</div>;
  const fields = MAPPING_ENTITIES.find((e) => e.key === entity)?.fields ?? [];

  return (
    <div className="space-y-4">
      <select value={active.id} onChange={(e) => onSelect(e.target.value)} className="bg-input border border-border rounded px-2 py-1.5 text-sm">
        {list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-xs uppercase">
            <tr><th className="p-2 text-left">Сутність</th><th className="p-2 text-left">Напрям</th><th className="p-2 text-left">Поле сервісу</th><th className="p-2 text-left">Поле ERP</th><th className="p-2" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {((rows.data ?? []) as any[]).map((m) => (
              <tr key={m.id}>
                <td className="p-2">{MAPPING_ENTITIES.find((e) => e.key === m.entity)?.label ?? m.entity}</td>
                <td className="p-2">{DIRECTION_LABEL[m.direction as "inbound" | "outbound"]}</td>
                <td className="p-2 font-mono text-xs">{m.source_field}</td>
                <td className="p-2 font-mono text-xs">{m.target_field}</td>
                <td className="p-2 text-right"><button onClick={() => remove.mutate({ id: m.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
            {((rows.data ?? []) as any[]).length === 0 && <tr><td colSpan={5} className="p-4 text-sm text-muted-foreground">Відповідностей ще немає.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel p-4 flex flex-wrap gap-2 items-center">
        <Link2 className="w-4 h-4 text-primary" />
        <select value={entity} onChange={(e) => { setEntity(e.target.value); setTarget(MAPPING_ENTITIES.find((x) => x.key === e.target.value)!.fields[0]); }} className="bg-input border border-border rounded px-2 py-1.5 text-sm">
          {MAPPING_ENTITIES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="поле сервісу" className="bg-input border border-border rounded px-2 py-1.5 text-sm font-mono w-48" />
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="bg-input border border-border rounded px-2 py-1.5 text-sm">
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button
          disabled={!source}
          onClick={() => save.mutate({ integrationId: active.id, entity, direction: "inbound", sourceField: source, targetField: target })}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          Додати
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- Черга і журнал ------------------------------ */

function Queue({ list, onChanged, logsOnly }: { list: any[]; onChanged: () => void; logsOnly?: boolean }) {
  const qc = useQueryClient();
  const fnEvents = useServerFn(listIntegrationEvents);
  const fnLogs = useServerFn(listIntegrationEventLogs);
  const [status, setStatus] = useState<string>(logsOnly ? "" : "");
  const [integrationId, setIntegrationId] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ["int-events", status, integrationId],
    queryFn: () => fnEvents({ data: { status: (status || null) as any, integrationId: integrationId || null, limit: 100 } }),
  });
  const logs = useQuery({
    queryKey: ["int-logs", openId],
    queryFn: () => fnLogs({ data: { eventId: openId! } }),
    enabled: !!openId,
  });
  const retry = useMutation({
    mutationFn: useServerFn(retryIntegrationEvent),
    onSuccess: (r: any) => { toast[r.status === "done" ? "success" : "error"](`Статус: ${EVENT_STATUS_LABEL[r.status as EventStatus] ?? r.status}`); qc.invalidateQueries({ queryKey: ["int-events"] }); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const cancel = useMutation({
    mutationFn: useServerFn(cancelIntegrationEvent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["int-events"] }); onChanged(); },
  });
  const runNow = useMutation({
    mutationFn: useServerFn(runIntegrationQueue),
    onSuccess: (r: any) => { toast.success(`Оброблено: ${r.processed}, успішно: ${r.done}`); qc.invalidateQueries({ queryKey: ["int-events"] }); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={integrationId} onChange={(e) => setIntegrationId(e.target.value)} className="bg-input border border-border rounded px-2 py-1.5 text-sm">
          <option value="">Усі підключення</option>
          {list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-input border border-border rounded px-2 py-1.5 text-sm">
          <option value="">Усі статуси</option>
          {(Object.keys(EVENT_STATUS_LABEL) as EventStatus[]).map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}
        </select>
        <button onClick={() => runNow.mutate({} as any)} className="px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${runNow.isPending ? "animate-spin" : ""}`} /> Обробити чергу
        </button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary text-xs uppercase">
            <tr>
              <th className="p-2 text-left">Час</th><th className="p-2 text-left">Подія</th><th className="p-2 text-left">Напрям</th>
              <th className="p-2 text-left">Статус</th><th className="p-2 text-left">Спроби</th><th className="p-2 text-left">Помилка</th><th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {((events.data ?? []) as any[]).map((e) => (
              <tr key={e.id} className={openId === e.id ? "bg-accent" : ""}>
                <td className="p-2 whitespace-nowrap text-xs">{fmt(e.created_at)}</td>
                <td className="p-2 font-mono text-xs">{e.event_type}</td>
                <td className="p-2 text-xs">{DIRECTION_LABEL[e.direction as "inbound" | "outbound"]}</td>
                <td className="p-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${EVENT_STATUS_TONE[e.status as EventStatus]}`}>{EVENT_STATUS_LABEL[e.status as EventStatus]}</span></td>
                <td className="p-2 text-xs">{e.attempt}/{e.max_attempts}</td>
                <td className="p-2 text-xs text-destructive max-w-[220px] truncate">{e.last_error ?? ""}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  <button onClick={() => setOpenId(openId === e.id ? null : e.id)} className="px-2 py-1 rounded bg-secondary text-xs font-semibold hover:bg-accent">Журнал</button>
                  {e.status !== "done" && (
                    <>
                      <button onClick={() => retry.mutate({ eventId: e.id })} className="ml-1 px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold">Повторити</button>
                      <button onClick={() => cancel.mutate({ eventId: e.id })} className="ml-1 px-2 py-1 rounded bg-destructive/10 text-destructive text-xs font-semibold">Зупинити</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {((events.data ?? []) as any[]).length === 0 && <tr><td colSpan={7} className="p-4 text-sm text-muted-foreground">Подій немає.</td></tr>}
          </tbody>
        </table>
      </div>

      {openId && (
        <div className="panel p-4 space-y-2">
          <div className="text-sm font-bold">Спроби обробки</div>
          {((logs.data ?? []) as any[]).map((l) => (
            <div key={l.id} className="text-xs bg-secondary rounded p-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">#{l.attempt} · {l.level} · {l.duration_ms ?? 0} мс</span>
                <span className="text-muted-foreground">{fmt(l.created_at)}</span>
              </div>
              <div className="mt-1">{l.message}</div>
            </div>
          ))}
          {((logs.data ?? []) as any[]).length === 0 && <div className="text-xs text-muted-foreground">Записів немає.</div>}
        </div>
      )}
    </div>
  );
}

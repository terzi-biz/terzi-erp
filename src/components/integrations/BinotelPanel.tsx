import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Phone, Trash2 } from "lucide-react";
import { BINOTEL_CAPABILITIES, BINOTEL_MANIFEST_TEMPLATE, BINOTEL_REQUIREMENTS, BINOTEL_STATUS_LABEL } from "@/lib/integrations/binotel-manifest";
import {
  deleteIntegrationLineMap,
  getIntegrationProviderManifest,
  listIntegrationLineMap,
  runIntegrationAdapterTest,
  saveIntegrationLineMap,
  saveIntegrationProviderManifest,
} from "@/lib/integrations.functions";
import { listAccessUsers } from "@/lib/access.functions";

const STEPS = [
  { id: 1, title: "Документація та доступи", hint: "Внесіть отримані від Binotel дані нижче — без них адаптер не виконує запитів." },
  { id: 2, title: "Маніфест провайдера", hint: "Base URL, поля credentials, endpoints, події та правила підпису." },
  { id: 3, title: "Внутрішні лінії", hint: "Звʼязок внутрішніх номерів зі співробітниками ERP." },
  { id: 4, title: "Тестування адаптера", hint: "Нормалізація payload, вхідна обробка, перевірка зʼєднання." },
];

export function BinotelPanel({ list, active, onSelect }: { list: any[]; active: any; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const binotelList = useMemo(() => list.filter((i) => i.provider_key === "binotel"), [list]);
  const current = binotelList.find((i) => i.id === active?.id) ?? binotelList[0] ?? null;
  const [step, setStep] = useState(1);

  const fnManifest = useServerFn(getIntegrationProviderManifest);
  const fnSaveManifest = useServerFn(saveIntegrationProviderManifest);
  const fnLines = useServerFn(listIntegrationLineMap);
  const fnSaveLine = useServerFn(saveIntegrationLineMap);
  const fnDelLine = useServerFn(deleteIntegrationLineMap);
  const fnTest = useServerFn(runIntegrationAdapterTest);
  const fnUsers = useServerFn(listAccessUsers);

  const manifest = useQuery({ queryKey: ["binotel-manifest"], queryFn: () => fnManifest({ data: { providerKey: "binotel" } }) });
  const lines = useQuery({ queryKey: ["binotel-lines", current?.id], queryFn: () => fnLines({ data: { integrationId: current.id } }), enabled: !!current });
  const users = useQuery({ queryKey: ["access-users"], queryFn: () => fnUsers() });

  const stored = ((manifest.data as any)?.manifest ?? {}) as Record<string, unknown>;
  const [text, setText] = useState<string | null>(null);
  const manifestText = text ?? JSON.stringify({ ...BINOTEL_MANIFEST_TEMPLATE, ...stored }, null, 2);

  const saveManifest = useMutation({
    mutationFn: (p: any) => fnSaveManifest({ data: p }),
    onSuccess: () => { toast.success("Маніфест Binotel збережено"); qc.invalidateQueries({ queryKey: ["binotel-manifest"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const saveLine = useMutation({
    mutationFn: (p: any) => fnSaveLine({ data: p }),
    onSuccess: () => { toast.success("Лінію збережено"); qc.invalidateQueries({ queryKey: ["binotel-lines", current?.id] }); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const delLine = useMutation({
    mutationFn: (p: any) => fnDelLine({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["binotel-lines", current?.id] }),
  });
  const test = useMutation({
    mutationFn: (p: any) => fnTest({ data: p }),
    onSuccess: (r: any) => (r.ok ? toast.success(r.message ?? "OK") : toast.warning(r.message ?? "Недоступно")),
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const [ext, setExt] = useState("");
  const [userId, setUserId] = useState("");
  const [payload, setPayload] = useState('{\n  "event": "",\n  "externalNumber": "+380671234567",\n  "internalNumber": "101",\n  "billsec": 0\n}');

  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-2">
        <div className="text-sm font-bold flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> Binotel · {BINOTEL_STATUS_LABEL}</div>
        <p className="text-xs text-muted-foreground">
          Адаптер працює лише за маніфестом. Жоден endpoint, ключ, підпис чи подія не вигадані: поля порожні, доки TERZI не внесе офіційні дані Binotel.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground mb-1">Потрібно отримати від Binotel</div>
            <ul className="space-y-1 text-xs">
              {BINOTEL_REQUIREMENTS.map((r) => (
                <li key={r.key} className="flex items-center gap-2"><CircleDashed className="w-3.5 h-3.5 text-amber-500" /> {r.label}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground mb-1">Готовність адаптера</div>
            <ul className="space-y-1 text-xs">
              {BINOTEL_CAPABILITIES.map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  {c.ready ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <CircleDashed className="w-3.5 h-3.5 text-muted-foreground" />} {c.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {binotelList.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {binotelList.map((i) => (
            <button key={i.id} onClick={() => onSelect(i.id)} className={`px-3 py-1.5 rounded text-sm font-semibold ${current?.id === i.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>{i.name}</button>
          ))}
        </div>
      )}

      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <button key={s.id} onClick={() => setStep(s.id)} className={`px-3 py-1.5 rounded text-sm font-semibold ${step === s.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
              {s.id}. {s.title}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{STEPS.find((s) => s.id === step)?.hint}</p>

        {step === 1 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Перед активацією надайте: REST/Webhook/WebSocket документацію, credentials, приклади payload, перелік подій, правила перевірки вебхука та WS-авторизації, rate limits, метод Click-to-Call, спосіб отримання запису та строк дії посилання, номери компанії, внутрішні лінії й тестові доступи.</p>
            <p>Поки дані відсутні — ядро приймає вебхуки в чергу, нормалізує телефони й повʼязує дзвінки з клієнтами, але не виконує вихідних викликів до Binotel.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <textarea value={manifestText} onChange={(e) => setText(e.target.value)} rows={16} className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono" />
            <button
              onClick={() => {
                try {
                  saveManifest.mutate({ providerKey: "binotel", manifest: JSON.parse(manifestText || "{}") });
                } catch {
                  toast.error("Маніфест має бути коректним JSON");
                }
              }}
              className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold"
            >
              Зберегти маніфест
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            {!current && <div className="text-xs text-muted-foreground">Створіть підключення Binotel у вкладці «Підключення».</div>}
            {current && (
              <>
                <div className="space-y-1">
                  {((lines.data ?? []) as any[]).map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 bg-secondary rounded px-2 py-1.5 text-sm">
                      <span className="font-mono text-xs">{l.extension}</span>
                      <span className="text-xs text-muted-foreground truncate flex-1">{l.display_name ?? ((users.data ?? []) as any[]).find((u) => u.user_id === l.user_id)?.full_name ?? l.user_id ?? "—"}</span>
                      <button onClick={() => delLine.mutate({ id: l.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {((lines.data ?? []) as any[]).length === 0 && <div className="text-xs text-muted-foreground">Ліній ще не додано.</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input value={ext} onChange={(e) => setExt(e.target.value)} placeholder="Внутрішня лінія (101)" className="bg-input border border-border rounded px-2 py-1.5 text-sm w-44" />
                  <select value={userId} onChange={(e) => setUserId(e.target.value)} className="bg-input border border-border rounded px-2 py-1.5 text-sm flex-1 min-w-[200px]">
                    <option value="">Співробітник…</option>
                    {((users.data ?? []) as any[]).map((u: any) => (
                      <option key={u.user_id} value={u.user_id}>{u.full_name ?? u.email ?? u.user_id}</option>
                    ))}
                  </select>
                  <button
                    disabled={!ext.trim()}
                    onClick={() => saveLine.mutate({ integrationId: current.id, extension: ext.trim(), userId: userId || null })}
                    className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                  >
                    Додати
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            {!current && <div className="text-xs text-muted-foreground">Створіть підключення Binotel, щоб протестувати адаптер.</div>}
            {current && (
              <>
                <textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={8} className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs font-mono" />
                <div className="flex flex-wrap gap-2">
                  {[
                    { action: "connection", label: "Перевірити зʼєднання" },
                    { action: "normalize", label: "Нормалізувати payload" },
                    { action: "inbound", label: "Обробити як вхідну подію" },
                    { action: "outbound", label: "Спробувати вихідний виклик" },
                  ].map((b) => (
                    <button
                      key={b.action}
                      onClick={() => {
                        try {
                          test.mutate({ integrationId: current.id, action: b.action, payload: JSON.parse(payload || "{}") });
                        } catch {
                          toast.error("Payload має бути коректним JSON");
                        }
                      }}
                      className="px-3 py-1.5 rounded bg-secondary text-sm font-semibold hover:bg-accent"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                {test.data ? <pre className="bg-secondary rounded p-2 text-xs overflow-x-auto max-h-60">{(test.data as any).data ?? (test.data as any).message}</pre> : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

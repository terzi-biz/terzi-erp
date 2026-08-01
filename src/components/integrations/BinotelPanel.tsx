import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Link2, Phone, Plug, RefreshCw, Trash2, Users } from "lucide-react";
import { BINOTEL_SECRET_LABEL, MAPPING_STATUS_LABEL } from "@/lib/integrations/binotel-constants";
import {
  deleteBinotelPbx,
  ensureBinotelIntegration,
  getBinotelSettings,
  getBinotelStatus,
  getBinotelWebhookUrls,
  listBinotelEmployeeMappings,
  listBinotelPbx,
  saveBinotelPbx,
  saveBinotelSettings,
  setBinotelEmployeeMapping,
  syncBinotelEmployees,
  syncBinotelPbx,
  testBinotelConnection,
} from "@/lib/binotel.functions";
import { listAccessUsers } from "@/lib/access.functions";

const card = "rounded-xl border border-border bg-card p-4 space-y-3";
const inp = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const btn = "rounded-md border border-border px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50";
const btnPrimary = "rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground inline-flex items-center gap-2 disabled:opacity-50";

export function BinotelPanel() {
  const qc = useQueryClient();
  const fnStatus = useServerFn(getBinotelStatus);
  const fnEnsure = useServerFn(ensureBinotelIntegration);
  const fnTest = useServerFn(testBinotelConnection);
  const fnSyncEmp = useServerFn(syncBinotelEmployees);
  const fnEmp = useServerFn(listBinotelEmployeeMappings);
  const fnSetEmp = useServerFn(setBinotelEmployeeMapping);
  const fnPbx = useServerFn(listBinotelPbx);
  const fnSavePbx = useServerFn(saveBinotelPbx);
  const fnDelPbx = useServerFn(deleteBinotelPbx);
  const fnSyncPbx = useServerFn(syncBinotelPbx);
  const fnSettings = useServerFn(getBinotelSettings);
  const fnSaveSettings = useServerFn(saveBinotelSettings);
  const fnHooks = useServerFn(getBinotelWebhookUrls);
  const fnUsers = useServerFn(listAccessUsers);

  const status = useQuery({ queryKey: ["binotel", "status"], queryFn: () => fnStatus() });
  const employees = useQuery({ queryKey: ["binotel", "employees"], queryFn: () => fnEmp() });
  const pbx = useQuery({ queryKey: ["binotel", "pbx"], queryFn: () => fnPbx() });
  const settings = useQuery({ queryKey: ["binotel", "settings"], queryFn: () => fnSettings() });
  const hooks = useQuery({ queryKey: ["binotel", "hooks"], queryFn: () => fnHooks() });
  const users = useQuery({ queryKey: ["access-users"], queryFn: () => fnUsers() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["binotel"] });
  const onErr = (e: any) => toast.error(e?.message ?? "Помилка");

  const ensure = useMutation({ mutationFn: () => fnEnsure(), onSuccess: () => { toast.success("Підключення Binotel готове"); invalidate(); }, onError: onErr });
  const test = useMutation({
    mutationFn: () => fnTest(),
    onSuccess: (r: any) => { r?.ok ? toast.success(r.message) : toast.error(r?.message ?? "Помилка"); invalidate(); },
    onError: onErr,
  });
  const syncEmp = useMutation({
    mutationFn: () => fnSyncEmp(),
    onSuccess: (r: any) => { toast.success(`Співробітників: ${r.total}, нових ${r.created}, автозіставлено ${r.autoMapped}`); invalidate(); },
    onError: onErr,
  });
  const setEmp = useMutation({ mutationFn: (p: any) => fnSetEmp({ data: p }), onSuccess: () => invalidate(), onError: onErr });
  const savePbx = useMutation({ mutationFn: (p: any) => fnSavePbx({ data: p }), onSuccess: () => { toast.success("Збережено"); invalidate(); }, onError: onErr });
  const delPbx = useMutation({ mutationFn: (p: any) => fnDelPbx({ data: p }), onSuccess: () => invalidate(), onError: onErr });
  const syncPbx = useMutation({
    mutationFn: () => fnSyncPbx(),
    onSuccess: (r: any) => { toast.success(`Номерів АТС: ${r.total}, додано ${r.created}`); invalidate(); },
    onError: onErr,
  });
  const saveSettings = useMutation({ mutationFn: (p: any) => fnSaveSettings({ data: p }), onSuccess: () => { toast.success("Налаштування збережено"); invalidate(); }, onError: onErr });

  const s: any = status.data ?? null;
  const userList = useMemo(() => (users.data as any[]) ?? [], [users.data]);
  const [newPbx, setNewPbx] = useState({ pbxNumber: "", pbxNumberName: "" });

  const secretsReady = s?.secrets?.api_key?.is_set && s?.secrets?.api_secret?.is_set;

  return (
    <div className="space-y-4">
      {/* Крок 1 — підключення */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-bold"><Phone className="w-4 h-4" /> Binotel — підключення</div>
          <div className="flex gap-2">
            <button className={btn} disabled={ensure.isPending} onClick={() => ensure.mutate()}>
              <Plug className="w-4 h-4" /> {s?.integration ? "Оновити привʼязки" : "Створити підключення"}
            </button>
            <button className={btnPrimary} disabled={!s?.integration || !secretsReady || test.isPending} onClick={() => test.mutate()}>
              <RefreshCw className={`w-4 h-4 ${test.isPending ? "animate-spin" : ""}`} /> Перевірити зʼєднання
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(["api_key", "api_secret", "company_id", "webhook_token"] as const).map((k) => (
            <div key={k} className="rounded-lg border border-border p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{BINOTEL_SECRET_LABEL[k]}</div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                {s?.secrets?.[k]?.is_set
                  ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Задано</>
                  : <><CircleDashed className="w-4 h-4 text-muted-foreground" /> Не задано</>}
              </div>
            </div>
          ))}
        </div>

        {!secretsReady ? (
          <div className="rounded-lg bg-amber-500/10 text-amber-700 text-xs p-2.5">
            Додайте секрети BINOTEL_API_KEY та BINOTEL_API_SECRET у бекенді — без них жоден запит до Binotel не виконується.
          </div>
        ) : null}

        {s?.integration ? (
          <div className="text-xs text-muted-foreground">
            Статус: <b>{s.integration.status}</b>
            {s.integration.last_test_at ? ` · остання перевірка ${new Date(s.integration.last_test_at).toLocaleString("uk-UA")}` : ""}
            {s.integration.last_error ? ` · помилка: ${s.integration.last_error}` : ""}
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Співробітники" value={String(s?.counters?.employees ?? 0)} />
          <Kpi label="Зіставлено" value={String(s?.counters?.mapped ?? 0)} />
          <Kpi label="Номери АТС" value={String(s?.counters?.pbx ?? 0)} />
          <Kpi label="Дзвінки Binotel" value={String(s?.counters?.calls ?? 0)} />
        </div>
      </div>

      {/* Вебхуки */}
      <div className={card}>
        <div className="flex items-center gap-2 font-bold"><Link2 className="w-4 h-4" /> URL вебхуків для кабінету Binotel</div>
        <Row label="API CALL SETTINGS" value={(hooks.data as any)?.callSettings ?? "—"} />
        <Row label="API CALL COMPLETED" value={(hooks.data as any)?.callCompleted ?? "—"} />
        <div className="text-xs text-muted-foreground">
          Токен передається заголовком <code>x-endpoint-token</code> або параметром <code>?token=</code> і зберігається лише як серверний секрет.
          {(hooks.data as any)?.baseConfigured === false ? " Задайте ERP_PUBLIC_BASE_URL, щоб URL сформувався повністю." : ""}
        </div>
      </div>

      {/* Крок 2 — співробітники */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-bold"><Users className="w-4 h-4" /> Співробітники Binotel → ERP</div>
          <button className={btn} disabled={!secretsReady || syncEmp.isPending} onClick={() => syncEmp.mutate()}>
            <RefreshCw className={`w-4 h-4 ${syncEmp.isPending ? "animate-spin" : ""}`} /> Імпортувати зі списку Binotel
          </button>
        </div>
        <div className="text-xs text-muted-foreground">Автозіставлення лише за email або внутрішнім номером. Зіставлення за іменем заборонено.</div>
        <div className="divide-y divide-border/60">
          {((employees.data as any[]) ?? []).map((e) => (
            <div key={e.id} className="py-2 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{e.binotel_employee_name ?? e.binotel_email ?? e.binotel_employee_id}</div>
                <div className="text-xs text-muted-foreground">
                  вн. {e.binotel_internal_number ?? "—"} · {e.binotel_email ?? "без email"} · {MAPPING_STATUS_LABEL[e.mapping_status] ?? e.mapping_status}
                </div>
              </div>
              <select
                className={`${inp} max-w-[260px]`}
                value={e.local_user_id ?? ""}
                onChange={(ev) => setEmp.mutate({ id: e.id, localUserId: ev.target.value || null })}
              >
                <option value="">— не зіставлено —</option>
                {userList.map((u: any) => (
                  <option key={u.user_id} value={u.user_id}>{u.display_name ?? u.name ?? u.email}</option>
                ))}
              </select>
            </div>
          ))}
          {!((employees.data as any[]) ?? []).length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Список порожній — виконайте імпорт</div>
          ) : null}
        </div>
      </div>

      {/* Номери АТС */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-bold"><Phone className="w-4 h-4" /> Номери АТС → воронка й напрямок</div>
          <button className={btn} disabled={!secretsReady || syncPbx.isPending} onClick={() => syncPbx.mutate()}>
            <RefreshCw className={`w-4 h-4 ${syncPbx.isPending ? "animate-spin" : ""}`} /> Імпортувати номери
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input className={`${inp} max-w-[200px]`} placeholder="Номер, напр. 0442279900" value={newPbx.pbxNumber}
            onChange={(e) => setNewPbx({ ...newPbx, pbxNumber: e.target.value })} />
          <input className={`${inp} max-w-[220px]`} placeholder="Назва лінії" value={newPbx.pbxNumberName}
            onChange={(e) => setNewPbx({ ...newPbx, pbxNumberName: e.target.value })} />
          <button className={btnPrimary} disabled={newPbx.pbxNumber.trim().length < 3 || savePbx.isPending}
            onClick={() => { savePbx.mutate({ ...newPbx, pbxNumberName: newPbx.pbxNumberName || null }); setNewPbx({ pbxNumber: "", pbxNumberName: "" }); }}>
            Додати
          </button>
        </div>

        <div className="divide-y divide-border/60">
          {(((pbx.data as any)?.rows as any[]) ?? []).map((r) => {
            const stages = (((pbx.data as any)?.stages as any[]) ?? []).filter((st) => !r.pipeline_id || st.pipeline_id === r.pipeline_id);
            return (
              <div key={r.id} className="py-2 flex items-center gap-2 flex-wrap">
                <div className="min-w-[160px]">
                  <div className="text-sm font-semibold">{r.pbx_number}</div>
                  <div className="text-xs text-muted-foreground">{r.pbx_number_name ?? "—"}</div>
                </div>
                <select className={`${inp} max-w-[190px]`} value={r.pipeline_id ?? ""}
                  onChange={(e) => savePbx.mutate({ id: r.id, pbxNumber: r.pbx_number, pipelineId: e.target.value || null, stageId: null })}>
                  <option value="">Воронка за замовчуванням</option>
                  {(((pbx.data as any)?.pipelines as any[]) ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className={`${inp} max-w-[190px]`} value={r.stage_id ?? ""}
                  onChange={(e) => savePbx.mutate({ id: r.id, pbxNumber: r.pbx_number, pipelineId: r.pipeline_id, stageId: e.target.value || null })}>
                  <option value="">Перший етап</option>
                  {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
                <input className={`${inp} max-w-[160px]`} defaultValue={r.service_direction ?? ""} placeholder="Напрямок послуги"
                  onBlur={(e) => e.target.value !== (r.service_direction ?? "") && savePbx.mutate({ id: r.id, pbxNumber: r.pbx_number, serviceDirection: e.target.value || null })} />
                <button className={btn} onClick={() => delPbx.mutate({ id: r.id })}><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          {!(((pbx.data as any)?.rows as any[]) ?? []).length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Номери не додані</div>
          ) : null}
        </div>
      </div>

      {/* Налаштування */}
      <div className={card}>
        <div className="font-bold">Правила обробки дзвінків</div>
        {settings.data ? (
          <div className="grid md:grid-cols-2 gap-3">
            <NumField label="SLA пропущеного, хв" value={(settings.data as any).missed_sla_minutes}
              onSave={(v) => saveSettings.mutate({ missedSlaMinutes: v })} />
            <NumField label="Ескалація, хв" value={(settings.data as any).escalation_minutes}
              onSave={(v) => saveSettings.mutate({ escalationMinutes: v })} />
            <NumField label="Вікно звірки, год" value={(settings.data as any).reconcile_window_hours}
              onSave={(v) => saveSettings.mutate({ reconcileWindowHours: v })} />
            <div className="space-y-1.5">
              <Toggle label="Створювати контакт" checked={(settings.data as any).auto_create_contact} onChange={(v) => saveSettings.mutate({ autoCreateContact: v })} />
              <Toggle label="Створювати лід" checked={(settings.data as any).auto_create_lead} onChange={(v) => saveSettings.mutate({ autoCreateLead: v })} />
              <Toggle label="Задача по пропущеному" checked={(settings.data as any).auto_create_missed_task} onChange={(v) => saveSettings.mutate({ autoCreateMissedTask: v })} />
              <Toggle label="Маршрут до закріпленого менеджера" checked={(settings.data as any).route_to_assigned_manager} onChange={(v) => saveSettings.mutate({ routeToAssignedManager: v })} />
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Створіть підключення, щоб зʼявились налаштування.</div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-black">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <span className="text-muted-foreground min-w-[170px]">{label}</span>
      <code className="text-xs break-all bg-secondary px-2 py-1 rounded">{value}</code>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function NumField({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input type="number" min={1} className={inp} defaultValue={value}
        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0 && v !== value) onSave(Math.round(v)); }} />
    </label>
  );
}

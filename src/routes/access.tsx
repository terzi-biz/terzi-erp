import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Users, ShieldCheck, Inbox, ScrollText, Lock, BellRing, Search, Plus, RefreshCw,
  CheckCircle2, XCircle, Clock3, KeyRound, LogOut, ArrowRightLeft, Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  createInvitation, getMyAccess, getSecurityOverview, listAccessRequests, listAccessRoles,
  listAccessUsers, listAuditLogs, listInvitations, listNotificationRules, listUserOverrides,
  removeUserOverride, reviewAccessRequest, revokeInvitation, saveAccessRole, saveNotificationRule,
  setUserOverride, terminateUserSessions, transferWorkload, updateUserAccess,
} from "@/lib/access.functions";
import { ACCESS_ACTIONS, ACCESS_MODULES, SCOPE_LABELS, STATUS_LABELS } from "@/lib/access.server";

export const Route = createFileRoute("/access")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Доступи і ролі — TERZI ERP" },
      { name: "description", content: "Керування співробітниками, ролями, правами, заявками на доступ і журналом дій у TERZI ERP." },
      { property: "og:title", content: "Доступи і ролі — TERZI ERP" },
      { property: "og:description", content: "Ролі, права, заявки, журнал дій та безпека акаунтів TERZI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccessPage,
});

type Tab = "users" | "roles" | "requests" | "logs" | "security" | "notifications";

const fmt = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";

const statusCls: Record<string, string> = {
  active: "bg-success/15 text-success",
  pending: "bg-primary/15 text-primary",
  invited: "bg-primary/15 text-primary",
  suspended: "bg-warning/15 text-warning",
  blocked: "bg-destructive/15 text-destructive",
  dismissed: "bg-destructive/15 text-destructive",
  archived: "bg-muted text-muted-foreground",
};

function AccessPage() {
  const [tab, setTab] = useState<Tab>("users");
  const myAccessFn = useServerFn(getMyAccess);
  const { data: me, isLoading } = useQuery({ queryKey: ["my-access"], queryFn: () => myAccessFn() });

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: "users", label: "Співробітники", icon: Users },
    { id: "roles", label: "Ролі та права", icon: ShieldCheck },
    { id: "requests", label: "Заявки", icon: Inbox },
    { id: "logs", label: "Журнал дій", icon: ScrollText },
    { id: "security", label: "Безпека", icon: Lock },
    { id: "notifications", label: "Сповіщення", icon: BellRing },
  ];

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Завантаження доступів…</div>;
  if (!me?.actor.canManage) {
    return (
      <div className="p-6">
        <div className="panel p-6 max-w-lg">
          <h1 className="text-xl font-black">Доступи і ролі</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Розділ доступний лише власнику системи та операційному адміністратору.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-black tracking-tight">Доступи і ролі</h1>
        <p className="text-sm text-muted-foreground">Хто працює в системі, що бачить і що може змінювати.</p>
      </header>

      <div className="flex gap-1 overflow-x-auto panel p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-xs font-bold transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab isOwner={me.actor.isOwner} />}
      {tab === "roles" && <RolesTab isOwner={me.actor.isOwner} />}
      {tab === "requests" && <RequestsTab />}
      {tab === "logs" && <LogsTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "notifications" && <NotificationsTab />}
    </div>
  );
}

/* ---------------------------- Співробітники ---------------------------- */

function UsersTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const usersFn = useServerFn(listAccessUsers);
  const rolesFn = useServerFn(listAccessRoles);
  const updateFn = useServerFn(updateUserAccess);
  const transferFn = useServerFn(transferWorkload);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users = [], isLoading } = useQuery({ queryKey: ["access-users"], queryFn: () => usersFn() });
  const { data: rolesData } = useQuery({ queryKey: ["access-roles"], queryFn: () => rolesFn() });
  const roles = rolesData?.roles ?? [];

  const update = useMutation({
    mutationFn: (input: any) => updateFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["access-users"] });
      toast.success("Доступ оновлено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти"),
  });

  const transfer = useMutation({
    mutationFn: (input: { fromUserId: string; toUserId: string }) => transferFn({ data: input }),
    onSuccess: (r: any) => toast.success(`Передано: клієнтів ${r.clients}, об'єктів ${r.objects}, кошторисів ${r.estimates}`),
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося передати"),
  });

  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (users as any[]).filter((u) =>
      !nq || [u.display_name, u.email, u.position, u.department, u.role_name].some((v) => (v ?? "").toLowerCase().includes(nq)),
    );
  }, [users, q]);

  const current = (users as any[]).find((u) => u.user_id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за ім'ям, поштою, посадою…"
            className="w-full rounded border border-border bg-input py-2 pl-9 pr-3 text-sm" />
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Запросити співробітника</Button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Співробітник</th>
              <th className="px-4 py-3 text-left">Роль</th>
              <th className="px-4 py-3 text-left">Область даних</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-left">Останній вхід</th>
              <th className="px-4 py-3 text-right">Дії</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-muted-foreground">Завантаження…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-muted-foreground">Нічого не знайдено.</td></tr>}
            {rows.map((u) => (
              <tr key={u.user_id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{u.display_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email ?? "—"}{u.position ? ` · ${u.position}` : ""}</div>
                </td>
                <td className="px-4 py-3">
                  <select value={u.role_key ?? ""} disabled={u.role_key === "owner" && !isOwner}
                    onChange={(e) => update.mutate({ userId: u.user_id, role_key: e.target.value || null })}
                    className="rounded border border-border bg-input px-2 py-1 text-xs">
                    <option value="">— без ролі —</option>
                    {roles.map((r: any) => <option key={r.key} value={r.key} disabled={r.key === "owner" && !isOwner}>{r.name}</option>)}
                  </select>
                  {u.overrides > 0 && <div className="mt-1 text-[10px] text-warning">Індивідуальні винятки: {u.overrides}</div>}
                </td>
                <td className="px-4 py-3">
                  <select value={u.scope} onChange={(e) => update.mutate({ userId: u.user_id, scope: e.target.value })}
                    className="rounded border border-border bg-input px-2 py-1 text-xs">
                    {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select value={u.status} onChange={(e) => update.mutate({ userId: u.user_id, status: e.target.value })}
                    className={`rounded px-2 py-1 text-xs font-semibold ${statusCls[u.status] ?? ""}`}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {u.temporary && u.access_expires_at && (
                    <div className="mt-1 text-[10px] text-warning">до {fmt(u.access_expires_at)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(u.last_sign_in_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setSelected(u.user_id)} className="rounded bg-secondary px-3 py-1.5 text-xs font-bold">Картка</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current && (
        <UserCard user={current} roles={roles} users={users as any[]} isOwner={isOwner}
          onClose={() => setSelected(null)}
          onSave={(patch) => update.mutate({ userId: current.user_id, ...patch })}
          onTransfer={(toUserId) => transfer.mutate({ fromUserId: current.user_id, toUserId })} />
      )}

      {inviteOpen && <InviteDialog roles={roles} users={users as any[]} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function UserCard({ user, roles, users, isOwner, onClose, onSave, onTransfer }: {
  user: any; roles: any[]; users: any[]; isOwner: boolean;
  onClose: () => void; onSave: (patch: any) => void; onTransfer: (toUserId: string) => void;
}) {
  const qc = useQueryClient();
  const overridesFn = useServerFn(listUserOverrides);
  const setOverrideFn = useServerFn(setUserOverride);
  const removeOverrideFn = useServerFn(removeUserOverride);
  const terminateFn = useServerFn(terminateUserSessions);

  const [position, setPosition] = useState(user.position ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [managerId, setManagerId] = useState(user.manager_id ?? "");
  const [note, setNote] = useState(user.admin_note ?? "");
  const [temporary, setTemporary] = useState(Boolean(user.temporary));
  const [expires, setExpires] = useState(user.access_expires_at ? user.access_expires_at.slice(0, 16) : "");
  const [ovModule, setOvModule] = useState(ACCESS_MODULES[0].key);
  const [ovAction, setOvAction] = useState(ACCESS_ACTIONS[0].key);
  const [ovEffect, setOvEffect] = useState<"allow" | "deny">("allow");
  const [ovReason, setOvReason] = useState("");
  const [transferTo, setTransferTo] = useState("");

  const { data: overrides = [] } = useQuery({
    queryKey: ["user-overrides", user.user_id],
    queryFn: () => overridesFn({ data: { userId: user.user_id } }),
  });

  const saveOverride = useMutation({
    mutationFn: () => setOverrideFn({ data: { userId: user.user_id, module: ovModule, action: ovAction, effect: ovEffect, reason: ovReason || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-overrides", user.user_id] });
      qc.invalidateQueries({ queryKey: ["access-users"] });
      setOvReason("");
      toast.success("Індивідуальне право збережено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  const dropOverride = useMutation({
    mutationFn: (id: string) => removeOverrideFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-overrides", user.user_id] });
      qc.invalidateQueries({ queryKey: ["access-users"] });
    },
  });

  const terminate = useMutation({
    mutationFn: () => terminateFn({ data: { userId: user.user_id } }),
    onSuccess: () => toast.success("Усі сесії користувача завершено"),
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 p-0 md:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto bg-background p-5 shadow-xl md:rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{user.display_name ?? "Співробітник"}</h2>
            <p className="text-xs text-muted-foreground">{user.email} · {user.role_name ?? "без ролі"}</p>
          </div>
          <button onClick={onClose} className="rounded bg-secondary px-3 py-1.5 text-xs font-bold">Закрити</button>
        </div>

        <section className="panel mt-4 space-y-3 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary">Дані співробітника</h3>
          <Field label="Посада"><input value={position} onChange={(e) => setPosition(e.target.value)} className="inp" /></Field>
          <Field label="Відділ"><input value={department} onChange={(e) => setDepartment(e.target.value)} className="inp" /></Field>
          <Field label="Керівник">
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="inp">
              <option value="">—</option>
              {users.filter((u) => u.user_id !== user.user_id).map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.display_name ?? u.email}</option>
              ))}
            </select>
          </Field>
          <Field label="Тимчасовий доступ">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} />
              <input type="datetime-local" value={expires} disabled={!temporary}
                onChange={(e) => setExpires(e.target.value)} className="inp disabled:opacity-40" />
            </div>
          </Field>
          <Field label="Нотатка адміністратора">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="inp" />
          </Field>
          <Button className="w-full" onClick={() => onSave({
            position: position || null, department: department || null, manager_id: managerId || null,
            admin_note: note || null, temporary, access_expires_at: temporary && expires ? new Date(expires).toISOString() : null,
          })}>Зберегти зміни</Button>
        </section>

        <section className="panel mt-4 space-y-3 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary">Індивідуальні права</h3>
          <p className="text-xs text-muted-foreground">Винятки поверх ролі. Заборона завжди сильніша за дозвіл.</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={ovModule} onChange={(e) => setOvModule(e.target.value)} className="inp">
              {ACCESS_MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select value={ovAction} onChange={(e) => setOvAction(e.target.value)} className="inp">
              {ACCESS_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <select value={ovEffect} onChange={(e) => setOvEffect(e.target.value as any)} className="inp">
              <option value="allow">Дозволити</option>
              <option value="deny">Заборонити</option>
            </select>
            <input value={ovReason} onChange={(e) => setOvReason(e.target.value)} placeholder="Причина" className="inp" />
          </div>
          <Button variant="outline" className="w-full" onClick={() => saveOverride.mutate()}>Додати виняток</Button>
          <div className="space-y-1">
            {(overrides as any[]).map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded bg-secondary/60 px-3 py-2 text-xs">
                <span>
                  <b>{ACCESS_MODULES.find((m) => m.key === o.module)?.label ?? o.module}</b> ·{" "}
                  {ACCESS_ACTIONS.find((a) => a.key === o.action)?.label ?? o.action} ·{" "}
                  <span className={o.effect === "deny" ? "text-destructive" : "text-success"}>{o.effect === "deny" ? "заборонено" : "дозволено"}</span>
                </span>
                <button onClick={() => dropOverride.mutate(o.id)} className="text-muted-foreground hover:text-destructive">✕</button>
              </div>
            ))}
            {(overrides as any[]).length === 0 && <div className="text-xs text-muted-foreground">Винятків немає.</div>}
          </div>
        </section>

        <section className="panel mt-4 space-y-3 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary">Звільнення і передача роботи</h3>
          <Field label="Передати клієнтів / об'єкти / кошториси">
            <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="inp">
              <option value="">Оберіть співробітника</option>
              {users.filter((u) => u.user_id !== user.user_id).map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.display_name ?? u.email}</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={!transferTo} onClick={() => onTransfer(transferTo)}>
              <ArrowRightLeft className="h-4 w-4" /> Передати
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => terminate.mutate()}>
              <LogOut className="h-4 w-4" /> Завершити всі сесії
            </Button>
            <Button variant="destructive" className="gap-2"
              onClick={() => {
                if (!window.confirm("Заблокувати доступ співробітника?")) return;
                onSave({ status: "blocked", reason: "Блокування з картки співробітника" });
              }}>
              <KeyRound className="h-4 w-4" /> Заблокувати
            </Button>
          </div>
          {!isOwner && <p className="text-[11px] text-muted-foreground">Остаточне видалення даних доступне лише власнику системи.</p>}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-muted-foreground">
      {label}
      <div className="mt-1 [&_.inp]:w-full [&_.inp]:rounded [&_.inp]:border [&_.inp]:border-border [&_.inp]:bg-input [&_.inp]:px-2 [&_.inp]:py-1.5 [&_.inp]:text-sm [&_.inp]:text-foreground">
        {children}
      </div>
    </label>
  );
}

function InviteDialog({ roles, users, onClose }: { roles: any[]; users: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createInvitation);
  const [form, setForm] = useState({
    email: "", last_name: "", first_name: "", middle_name: "", phone: "",
    position: "", department: "", role_key: roles[0]?.key ?? "", manager_id: "",
    scope: "own", temporary: false, access_expires_at: "", admin_note: "",
  });
  const [link, setLink] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        email: form.email.trim(),
        last_name: form.last_name || null, first_name: form.first_name || null, middle_name: form.middle_name || null,
        phone: form.phone || null, position: form.position || null, department: form.department || null,
        role_key: form.role_key, manager_id: form.manager_id || null, scope: form.scope as any,
        temporary: form.temporary,
        access_expires_at: form.temporary && form.access_expires_at ? new Date(form.access_expires_at).toISOString() : null,
        admin_note: form.admin_note || null,
      },
    }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setLink(`${window.location.origin}/invite/${r.token}`);
      toast.success("Запрошення створено");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося створити запрошення"),
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-5">
        <h2 className="text-lg font-black">Запрошення співробітника</h2>
        <p className="mt-1 text-xs text-muted-foreground">Посилання одноразове й діє обмежений час.</p>
        <div className="mt-4 space-y-3">
          <Field label="Електронна пошта *"><input value={form.email} onChange={(e) => set("email", e.target.value)} className="inp" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Прізвище"><input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className="inp" /></Field>
            <Field label="Ім'я"><input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className="inp" /></Field>
            <Field label="По батькові"><input value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} className="inp" /></Field>
            <Field label="Телефон"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="inp" /></Field>
            <Field label="Посада"><input value={form.position} onChange={(e) => set("position", e.target.value)} className="inp" /></Field>
            <Field label="Відділ"><input value={form.department} onChange={(e) => set("department", e.target.value)} className="inp" /></Field>
          </div>
          <Field label="Роль">
            <select value={form.role_key} onChange={(e) => set("role_key", e.target.value)} className="inp">
              {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Область даних">
            <select value={form.scope} onChange={(e) => set("scope", e.target.value)} className="inp">
              {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Керівник">
            <select value={form.manager_id} onChange={(e) => set("manager_id", e.target.value)} className="inp">
              <option value="">—</option>
              {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name ?? u.email}</option>)}
            </select>
          </Field>
          <Field label="Тимчасовий доступ">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.temporary} onChange={(e) => set("temporary", e.target.checked)} />
              <input type="datetime-local" disabled={!form.temporary} value={form.access_expires_at}
                onChange={(e) => set("access_expires_at", e.target.value)} className="inp disabled:opacity-40" />
            </div>
          </Field>
        </div>
        {link && (
          <div className="mt-4 rounded bg-secondary p-3 text-xs">
            <div className="font-bold">Посилання-запрошення</div>
            <div className="mt-1 break-all">{link}</div>
            <Button size="sm" variant="outline" className="mt-2 gap-2"
              onClick={() => { navigator.clipboard.writeText(link); toast.success("Скопійовано"); }}>
              <Copy className="h-3.5 w-3.5" /> Скопіювати
            </Button>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Закрити</Button>
          <Button disabled={!form.email || !form.role_key || create.isPending} onClick={() => create.mutate()}>Створити запрошення</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Ролі ------------------------------ */

function RolesTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const rolesFn = useServerFn(listAccessRoles);
  const saveFn = useServerFn(saveAccessRole);
  const { data, isLoading } = useQuery({ queryKey: ["access-roles"], queryFn: () => rolesFn() });
  const roles = data?.roles ?? [];
  const perms = data?.permissions ?? [];
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const roleKey = active ?? roles[0]?.key ?? null;
  const rolePerms = useMemo(() => {
    const map: Record<string, boolean> = {};
    perms.filter((p: any) => p.role_key === roleKey).forEach((p: any) => { map[`${p.module}:${p.action}`] = p.allowed; });
    return { ...map, ...draft };
  }, [perms, roleKey, draft]);

  const save = useMutation({
    mutationFn: () => {
      const role = roles.find((r: any) => r.key === roleKey);
      const permissions = Object.entries(rolePerms).map(([k, allowed]) => {
        const [module, action] = k.split(":");
        return { module, action, allowed };
      });
      return saveFn({ data: { key: role.key, name: role.name, description: role.description, default_scope: role.default_scope, is_active: role.is_active, permissions } });
    },
    onSuccess: () => { setDraft({}); qc.invalidateQueries({ queryKey: ["access-roles"] }); toast.success("Матрицю прав збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти"),
  });

  if (isLoading) return <div className="panel p-5 text-sm text-muted-foreground">Завантаження ролей…</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="panel divide-y divide-border">
        {roles.map((r: any) => (
          <button key={r.key} onClick={() => { setActive(r.key); setDraft({}); }}
            className={`block w-full px-4 py-3 text-left ${roleKey === r.key ? "bg-secondary" : ""}`}>
            <div className="text-sm font-bold">{r.name}</div>
            <div className="text-[11px] text-muted-foreground">{r.users} користувач(ів) · {SCOPE_LABELS[r.default_scope as keyof typeof SCOPE_LABELS]}</div>
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div>
            <h2 className="text-sm font-black">Матриця прав: {roles.find((r: any) => r.key === roleKey)?.name}</h2>
            <p className="text-xs text-muted-foreground">Критичні дії позначені кольором. Роль «Власник» має повний доступ і не редагується.</p>
          </div>
          <Button size="sm" disabled={!Object.keys(draft).length || roleKey === "owner"} onClick={() => save.mutate()}>Зберегти</Button>
        </div>
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 bg-secondary/90 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Модуль</th>
                {ACCESS_ACTIONS.map((a) => <th key={a.key} className={`px-2 py-2 ${a.critical ? "text-warning" : ""}`}>{a.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ACCESS_MODULES.map((m) => (
                <tr key={m.key} className="border-b border-border/50">
                  <td className="px-3 py-2 font-semibold">{m.label}</td>
                  {ACCESS_ACTIONS.map((a) => {
                    const k = `${m.key}:${a.key}`;
                    const checked = roleKey === "owner" ? true : Boolean(rolePerms[k]);
                    return (
                      <td key={a.key} className="px-2 py-2 text-center">
                        <input type="checkbox" checked={checked} disabled={roleKey === "owner" || (!isOwner && a.critical && false)}
                          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.checked }))} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Заявки ------------------------------ */

function RequestsTab() {
  const qc = useQueryClient();
  const reqFn = useServerFn(listAccessRequests);
  const rolesFn = useServerFn(listAccessRoles);
  const reviewFn = useServerFn(reviewAccessRequest);
  const invFn = useServerFn(listInvitations);
  const revokeFn = useServerFn(revokeInvitation);

  const { data: requests = [], isLoading } = useQuery({ queryKey: ["access-requests"], queryFn: () => reqFn() });
  const { data: rolesData } = useQuery({ queryKey: ["access-roles"], queryFn: () => rolesFn() });
  const { data: invitations = [] } = useQuery({ queryKey: ["invitations"], queryFn: () => invFn() });
  const [roleFor, setRoleFor] = useState<Record<string, string>>({});
  const [scopeFor, setScopeFor] = useState<Record<string, string>>({});

  const review = useMutation({
    mutationFn: (input: any) => reviewFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["access-requests"] });
      qc.invalidateQueries({ queryKey: ["access-users"] });
      qc.invalidateQueries({ queryKey: ["registration-approvals", "nav"] });
      toast.success("Заявку опрацьовано");
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося опрацювати"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invitations"] }); toast.success("Запрошення відкликано"); },
  });

  const kindLabel: Record<string, string> = {
    registration: "Реєстрація", recovery: "Відновлення доступу", elevation: "Розширення прав", temporary: "Тимчасовий доступ",
  };

  return (
    <div className="space-y-4">
      <div className="panel overflow-x-auto">
        <div className="border-b border-border p-4"><h2 className="text-sm font-black">Заявки на доступ</h2></div>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Користувач</th>
              <th className="px-4 py-3 text-left">Тип</th>
              <th className="px-4 py-3 text-left">Роль / область</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-right">Рішення</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Завантаження…</td></tr>}
            {!isLoading && (requests as any[]).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Заявок немає.</td></tr>}
            {(requests as any[]).map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.display_name ?? r.email ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{fmt(r.created_at)}{r.reason ? ` · ${r.reason}` : ""}</div>
                </td>
                <td className="px-4 py-3 text-xs">{kindLabel[r.kind] ?? r.kind}</td>
                <td className="px-4 py-3">
                  {r.status === "pending" && r.kind === "registration" ? (
                    <div className="flex gap-1">
                      <select value={roleFor[r.id] ?? ""} onChange={(e) => setRoleFor((s) => ({ ...s, [r.id]: e.target.value }))}
                        className="rounded border border-border bg-input px-2 py-1 text-xs">
                        <option value="">Роль…</option>
                        {(rolesData?.roles ?? []).map((role: any) => <option key={role.key} value={role.key}>{role.name}</option>)}
                      </select>
                      <select value={scopeFor[r.id] ?? "own"} onChange={(e) => setScopeFor((s) => ({ ...s, [r.id]: e.target.value }))}
                        className="rounded border border-border bg-input px-2 py-1 text-xs">
                        {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {r.requested_role_key ?? r.requested_module ?? "—"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${
                    r.status === "approved" ? "bg-success/15 text-success" : r.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                  }`}>
                    {r.status === "approved" ? <CheckCircle2 className="h-3 w-3" /> : r.status === "rejected" ? <XCircle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                    {r.status === "approved" ? "Підтверджено" : r.status === "rejected" ? "Відхилено" : r.status === "info_requested" ? "Потрібні дані" : "Очікує"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <button className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                        onClick={() => review.mutate({ id: r.id, decision: "approved", role_key: roleFor[r.id] || null, scope: (scopeFor[r.id] ?? "own") as any })}>
                        Підтвердити
                      </button>
                      <button className="rounded bg-secondary px-3 py-1.5 text-xs font-bold"
                        onClick={() => review.mutate({ id: r.id, decision: "rejected" })}>Відхилити</button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{fmt(r.reviewed_at)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel overflow-x-auto">
        <div className="border-b border-border p-4"><h2 className="text-sm font-black">Запрошення</h2></div>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Пошта</th>
              <th className="px-4 py-3 text-left">Роль</th>
              <th className="px-4 py-3 text-left">Діє до</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-right">Дії</th>
            </tr>
          </thead>
          <tbody>
            {(invitations as any[]).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Запрошень немає.</td></tr>}
            {(invitations as any[]).map((i) => (
              <tr key={i.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">{i.email}</td>
                <td className="px-4 py-3 text-xs">{i.role_key}</td>
                <td className="px-4 py-3 text-xs">{fmt(i.expires_at)}</td>
                <td className="px-4 py-3 text-xs">{i.status}</td>
                <td className="px-4 py-3 text-right">
                  {i.status === "sent" && (
                    <button onClick={() => revoke.mutate(i.id)} className="rounded bg-secondary px-3 py-1.5 text-xs font-bold">Відкликати</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Журнал ------------------------------ */

function LogsTab() {
  const logsFn = useServerFn(listAuditLogs);
  const [filters, setFilters] = useState<{ module: string; search: string; criticalOnly: boolean }>({ module: "", search: "", criticalOnly: false });
  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => logsFn({ data: { module: filters.module || null, search: filters.search || null, criticalOnly: filters.criticalOnly, limit: 200 } }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={filters.module} onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value }))}
          className="rounded border border-border bg-input px-2 py-2 text-sm">
          <option value="">Усі модулі</option>
          {ACCESS_MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Пошук за дією, об'єктом, користувачем" className="flex-1 min-w-[200px] rounded border border-border bg-input px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={filters.criticalOnly} onChange={(e) => setFilters((f) => ({ ...f, criticalOnly: e.target.checked }))} />
          Лише критичні
        </label>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Оновити
        </Button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Час</th>
              <th className="px-4 py-3 text-left">Користувач</th>
              <th className="px-4 py-3 text-left">Модуль</th>
              <th className="px-4 py-3 text-left">Дія</th>
              <th className="px-4 py-3 text-left">Об'єкт</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Завантаження…</td></tr>}
            {!isLoading && (data as any[]).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted-foreground">Записів немає.</td></tr>}
            {(data as any[]).map((l) => (
              <tr key={l.id} className={`border-b border-border/60 last:border-0 ${l.is_critical ? "bg-warning/5" : ""}`}>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmt(l.created_at)}</td>
                <td className="px-4 py-2 text-xs">{l.actor_name ?? "—"}<div className="text-[10px] text-muted-foreground">{l.actor_role ?? ""}</div></td>
                <td className="px-4 py-2 text-xs">{ACCESS_MODULES.find((m) => m.key === l.module)?.label ?? l.module}</td>
                <td className="px-4 py-2 text-xs font-semibold">{l.action}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{l.entity_label ?? l.entity_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Безпека ------------------------------ */

function SecurityTab() {
  const overviewFn = useServerFn(getSecurityOverview);
  const terminateFn = useServerFn(terminateUserSessions);
  const { data, isLoading } = useQuery({ queryKey: ["security-overview"], queryFn: () => overviewFn() });
  const terminate = useMutation({
    mutationFn: (userId: string) => terminateFn({ data: { userId } }),
    onSuccess: () => toast.success("Сесії завершено"),
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  if (isLoading) return <div className="panel p-5 text-sm text-muted-foreground">Завантаження…</div>;

  return (
    <div className="space-y-4">
      <div className="panel overflow-x-auto">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-black">Акаунти та входи</h2>
          <p className="text-xs text-muted-foreground">Останній вхід, спосіб входу, стан акаунта.</p>
        </div>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Користувач</th>
              <th className="px-4 py-3 text-left">Спосіб входу</th>
              <th className="px-4 py-3 text-left">Останній вхід</th>
              <th className="px-4 py-3 text-left">Стан</th>
              <th className="px-4 py-3 text-right">Дії</th>
            </tr>
          </thead>
          <tbody>
            {(data?.sessions ?? []).map((s: any) => (
              <tr key={s.user_id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{s.display_name}</div>
                  <div className="text-xs text-muted-foreground">{s.email}</div>
                </td>
                <td className="px-4 py-3 text-xs">{s.provider}</td>
                <td className="px-4 py-3 text-xs">{fmt(s.last_sign_in_at)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-[11px] font-bold ${s.banned ? "bg-destructive/15 text-destructive" : statusCls[s.status] ?? ""}`}>
                    {s.banned ? "Заблоковано" : STATUS_LABELS[s.status as keyof typeof STATUS_LABELS] ?? s.status}
                  </span>
                  {s.temporary && s.access_expires_at && <div className="mt-1 text-[10px] text-warning">до {fmt(s.access_expires_at)}</div>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => terminate.mutate(s.user_id)} className="rounded bg-secondary px-3 py-1.5 text-xs font-bold">Завершити сесії</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel p-4">
        <h2 className="text-sm font-black">Підозріла активність</h2>
        {(data?.failed ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Невдалих входів і нових пристроїв не зафіксовано.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {(data?.failed ?? []).map((f: any) => (
              <li key={f.id} className="rounded bg-secondary/60 px-3 py-2">{fmt(f.created_at)} · {f.actor_name ?? f.entity_label} · {f.action}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- Сповіщення ---------------------------- */

function NotificationsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationRules);
  const saveFn = useServerFn(saveNotificationRule);
  const { data = [], isLoading } = useQuery({ queryKey: ["notification-rules"], queryFn: () => listFn() });
  const save = useMutation({
    mutationFn: (input: any) => saveFn({ data: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notification-rules"] }); toast.success("Збережено"); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  if (isLoading) return <div className="panel p-5 text-sm text-muted-foreground">Завантаження…</div>;

  return (
    <div className="panel divide-y divide-border">
      {(data as any[]).map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-sm font-semibold">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.event_key} · канал: {r.channel}</div>
          </div>
          <div className="flex items-center gap-3">
            <select value={r.digest} onChange={(e) => save.mutate({ id: r.id, digest: e.target.value })}
              className="rounded border border-border bg-input px-2 py-1 text-xs">
              <option value="instant">Миттєво</option>
              <option value="daily">Щоденний дайджест</option>
              <option value="weekly">Щотижневий дайджест</option>
            </select>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={r.enabled} onChange={(e) => save.mutate({ id: r.id, enabled: e.target.checked })} />
              Увімкнено
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

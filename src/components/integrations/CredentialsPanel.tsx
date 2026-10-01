import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
import { CREDENTIAL_GROUPS } from "@/lib/integrations/credential-fields";
import { deleteCredential, listCredentialStatus, saveCredential } from "@/lib/integrations/credentials.functions";

/** Введення ключів інтеграцій. Значення лише записуються — назад у браузер не повертаються. */
export function CredentialsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listCredentialStatus);
  const save = useServerFn(saveCredential);
  const del = useServerFn(deleteCredential);
  const q = useQuery({ queryKey: ["integration-credentials"], queryFn: () => list(), retry: false });
  const [vals, setVals] = useState<Record<string, string>>({});
  const st = new Map(((q.data ?? []) as any[]).map((r) => [r.name, r]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["integration-credentials"] });

  const m = useMutation({
    mutationFn: (name: string) => save({ data: { name, value: vals[name] ?? "" } }),
    onSuccess: (_r, name) => { toast.success("Ключ збережено"); setVals((v) => ({ ...v, [name]: "" })); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });
  const d = useMutation({
    mutationFn: (name: string) => del({ data: { name } }),
    onSuccess: () => { toast.success("Ключ видалено"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Помилка"),
  });

  if (q.isError) return <div className="panel p-4 text-xs text-muted-foreground">{(q.error as any)?.message ?? "Немає доступу до ключів"}</div>;

  return (
    <section className="panel p-4 space-y-4">
      <div>
        <h2 className="text-xs uppercase tracking-widest text-primary font-bold flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Ключі підключень</h2>
        <p className="text-xs text-muted-foreground mt-1">Вставте ключ і натисніть «Зберегти». Ключі шифруються і зберігаються тільки на сервері; після збереження натисніть «Перевірити» у відповідній інтеграції.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {CREDENTIAL_GROUPS.map((g) => (
          <div key={g.provider} className="rounded-lg border border-border p-3 space-y-2">
            <div className="font-bold text-sm">{g.title}</div>
            {g.fields.map((f) => {
              const s: any = st.get(f.name);
              return (
                <div key={f.name} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold">{f.label}</span>
                    <span className={s?.source ? "text-success" : "text-muted-foreground"}>
                      {s?.source === "env" ? "задано в системі" : s?.source === "ui" ? `задано ${s.hint ?? ""}` : "не задано"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <input type={f.secret ? "password" : "text"} autoComplete="off" placeholder={s?.source ? "Новий ключ для заміни" : "Вставте значення"}
                      value={vals[f.name] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs" />
                    <button disabled={!vals[f.name]?.trim() || m.isPending} onClick={() => m.mutate(f.name)}
                      className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">Зберегти</button>
                    {s?.source === "ui" && (
                      <button aria-label="Видалити ключ" onClick={() => d.mutate(f.name)} className="h-8 rounded-md border border-border px-2"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

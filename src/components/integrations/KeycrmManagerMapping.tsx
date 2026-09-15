import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listKeycrmManagers, setKeycrmManagerMapping } from "@/lib/crm/manager-mapping.functions";

/** Зіставлення відповідальних keyCRM з користувачами ERP: вибір один раз, далі — автоматично. */
export function KeycrmManagerMapping() {
  const listFn = useServerFn(listKeycrmManagers);
  const setFn = useServerFn(setKeycrmManagerMapping);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["keycrm", "managers"], queryFn: () => listFn() });
  const save = useMutation({
    mutationFn: (v: { externalId: string; userId: string | null }) => setFn({ data: v }),
    onSuccess: (res: any) => {
      toast.success(
        res.mapped
          ? `Зіставлено. Оновлено лідів: ${res.leads}, замовлень: ${res.orders}`
          : "Зіставлення знято",
      );
      qc.invalidateQueries({ queryKey: ["keycrm", "managers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не вдалося зберегти"),
  });

  const managers = data?.managers ?? [];
  const users = data?.users ?? [];
  const unmapped = managers.filter((m: any) => !m.userId).length;

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-bold">Відповідальні keyCRM → користувачі ERP</div>
          <div className="text-xs text-muted-foreground">
            Автоматично зіставляються лише за e-mail або телефоном. Решту оберіть вручну — ліди й замовлення
            дозаповняться одразу.
          </div>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">Без зіставлення: {unmapped}</span>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Завантаження…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-xs uppercase">
              <tr>
                <th className="p-2 text-left">Відповідальний keyCRM</th>
                <th className="p-2 text-left">E-mail</th>
                <th className="p-2 text-left">Користувач ERP</th>
                <th className="p-2 text-right">Лідів</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {managers.map((m: any) => (
                <tr key={m.externalId}>
                  <td className="p-2 font-semibold">{m.name}</td>
                  <td className="p-2 text-xs text-muted-foreground">{m.email ?? "—"}</td>
                  <td className="p-2">
                    <select
                      value={m.userId ?? ""}
                      disabled={save.isPending}
                      onChange={(e) => save.mutate({ externalId: m.externalId, userId: e.target.value || null })}
                      className="bg-input border border-border rounded px-2 py-1.5 text-sm min-w-[220px]"
                    >
                      <option value="">Потребує перевірки</option>
                      {users.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-right tabular-nums">{m.leads}</td>
                </tr>
              ))}
              {!managers.length && (
                <tr>
                  <td colSpan={4} className="p-4 text-sm text-muted-foreground">
                    Довідник відповідальних keyCRM ще не синхронізовано.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

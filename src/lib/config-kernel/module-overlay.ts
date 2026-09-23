/**
 * Control Plane Wave 2 — застосування опублікованих оверлеїв модулів.
 * Без оверлею — значення з src/lib/modules.ts (поточна поведінка). Маршрути не змінюються.
 */
import { findModule, type ModuleId, type TerziModule } from "@/lib/modules";
import type { ConfigPayload } from "./kinds";

export type ModuleOverlay = ConfigPayload<"module_overlay">;
export interface ModuleView {
  id: ModuleId;
  label: string;
  route: string | null;
  visible: boolean;
  order: number;
}
export interface OverlayCtx {
  roles: readonly string[];
  lang?: "ua" | "ru";
  mobile?: boolean;
}

export function applyModuleOverlay(m: TerziModule, index: number, o: ModuleOverlay | null | undefined, ctx: OverlayCtx): ModuleView {
  const ov = o ?? {};
  const uk = ov.label_uk ?? ov.label ?? m.label;
  const label = ctx.lang === "ru" && ov.label_ru ? ov.label_ru : uk;
  const active = ov.active ?? m.active;
  const roles = ov.roles ?? m.permissions;
  const roleOk = roles.length === 0 || roles.some((r) => ctx.roles.includes(r));
  const deviceOk = ctx.mobile ? ov.mobile !== false : ov.desktop !== false;
  return { id: m.id, label, route: m.route, visible: active && roleOk && deviceOk, order: ov.order ?? index * 10 };
}

export function moduleViews(ids: readonly string[], overlays: Record<string, ModuleOverlay | null | undefined>, ctx: OverlayCtx): ModuleView[] {
  return ids
    .map((id, i) => {
      const m = findModule(id);
      return m ? applyModuleOverlay(m, i, overlays[id], ctx) : null;
    })
    .filter((v): v is ModuleView => !!v)
    .sort((a, b) => a.order - b.order);
}

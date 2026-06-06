import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModuleEnum = z.enum(["screed", "roofing", "insulation", "demolition", "common"]);
const KindEnum = z.enum(["material", "work", "equipment"]);

const itemInput = z.object({
  id: z.string().uuid().optional(),
  module: ModuleEnum,
  kind: KindEnum,
  code: z.string().max(80).optional().nullable(),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(40),
  buy_price: z.number().nonnegative().default(0),
  sell_price: z.number().nonnegative().default(0),
  lifetime_months: z.number().int().nonnegative().optional().nullable(),
  is_custom: z.boolean().default(true),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ module: ModuleEnum, kind: KindEnum }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("catalog_items")
      .select("*")
      .eq("module", data.module)
      .eq("kind", data.kind)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = data.id
      ? await context.supabase.from("catalog_items").update(data).eq("id", data.id).select().single()
      : await context.supabase.from("catalog_items").insert(data).select().single();
    if (error) throw error;
    return out;
  });

export const deleteCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("catalog_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const seedCatalogDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ module: ModuleEnum, kind: KindEnum }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("catalog_items").select("id")
      .eq("module", data.module).eq("kind", data.kind).limit(1);
    if (existing && existing.length > 0) return { seeded: 0 };
    const items = DEFAULT_SEEDS[`${data.module}.${data.kind}`] ?? [];
    if (items.length === 0) return { seeded: 0 };
    const rows = items.map((it, i) => ({ ...it, module: data.module, kind: data.kind, is_custom: false, sort_order: i }));
    const { error } = await context.supabase.from("catalog_items").insert(rows);
    if (error) throw error;
    return { seeded: rows.length };
  });

type SeedItem = { code: string; name: string; unit: string; buy_price: number; sell_price: number; lifetime_months?: number };

const DEFAULT_SEEDS: Record<string, SeedItem[]> = {
  "screed.material": [
    { code: "sand", name: "Пісок", unit: "т", buy_price: 650, sell_price: 700 },
    { code: "cement500", name: "Цемент М500 25 кг", unit: "міш.", buy_price: 160, sell_price: 172 },
    { code: "cement400", name: "Цемент М400 25 кг", unit: "міш.", buy_price: 152, sell_price: 165 },
    { code: "fiber", name: "Фібра Sika 600 г", unit: "уп.", buy_price: 125, sell_price: 230 },
    { code: "plast", name: "Пластифікатор", unit: "л", buy_price: 70, sell_price: 82 },
    { code: "film", name: "Плівка п/е 60 мкм", unit: "м²", buy_price: 5.5, sell_price: 10 },
    { code: "damper", name: "Демпферна стрічка 8 мм", unit: "п.м", buy_price: 6.5, sell_price: 12 },
    { code: "mesh_comp_25", name: "Сітка композитна 100×100, 2.5 мм", unit: "м²", buy_price: 25, sell_price: 50 },
    { code: "mesh_comp_35", name: "Сітка композитна 100×100, 3.5 мм", unit: "м²", buy_price: 35, sell_price: 70 },
    { code: "mesh_met_25", name: "Сітка металева 100×100, 2.5 мм", unit: "м²", buy_price: 40, sell_price: 80 },
    { code: "mesh_met_35", name: "Сітка металева 100×100, 3.5 мм", unit: "м²", buy_price: 55, sell_price: 110 },
  ],
  "screed.work": [
    { code: "screedBase", name: "Стяжка 4–7 см", unit: "м²", buy_price: 80, sell_price: 180 },
    { code: "screedExtraPerCm", name: "+ за кожен см понад 7", unit: "м²/см", buy_price: 4, sell_price: 10 },
    { code: "prep", name: "Підготовка основи", unit: "м²", buy_price: 4, sell_price: 10 },
    { code: "film", name: "Укладка плівки", unit: "м²", buy_price: 6, sell_price: 15 },
    { code: "damper", name: "Укладка демпферу", unit: "п.м", buy_price: 6, sell_price: 15 },
    { code: "cuts", name: "Нарізка деформаційних швів", unit: "м²", buy_price: 6, sell_price: 15 },
    { code: "grind", name: "Шліфовка", unit: "м²", buy_price: 12, sell_price: 30 },
    { code: "mesh", name: "Укладка сітки", unit: "м²", buy_price: 10, sell_price: 30 },
    { code: "slope", name: "Розуклонка", unit: "м²", buy_price: 10, sell_price: 30 },
    { code: "cementUnload", name: "Вивантаження цементу", unit: "міш.", buy_price: 5, sell_price: 10 },
  ],
  "screed.equipment": [
    { code: "station", name: "Стяжкова станція M-tec", unit: "міс.", buy_price: 450000, sell_price: 12000, lifetime_months: 60 },
    { code: "compressor", name: "Компресор", unit: "міс.", buy_price: 80000, sell_price: 2000, lifetime_months: 60 },
    { code: "bus", name: "Мікроавтобус доставки", unit: "міс.", buy_price: 600000, sell_price: 15000, lifetime_months: 84 },
    { code: "tools", name: "Ручний інструмент бригади", unit: "міс.", buy_price: 50000, sell_price: 1500, lifetime_months: 36 },
  ],
  "roofing.material": [
    { code: "pvc_15", name: "ПВХ-мембрана 1.5 мм", unit: "м²", buy_price: 280, sell_price: 420 },
    { code: "geo", name: "Геотекстиль 300 г/м²", unit: "м²", buy_price: 28, sell_price: 55 },
    { code: "xps_50", name: "XPS 50 мм", unit: "м²", buy_price: 220, sell_price: 320 },
    { code: "rubemast", name: "Рубемаст наплавний", unit: "рул.", buy_price: 850, sell_price: 1300 },
    { code: "primer", name: "Бітумний праймер", unit: "л", buy_price: 65, sell_price: 110 },
    { code: "fastener", name: "Кріплення телескоп.", unit: "шт", buy_price: 8, sell_price: 18 },
  ],
  "roofing.work": [
    { code: "membrane", name: "Монтаж ПВХ-мембрани", unit: "м²", buy_price: 120, sell_price: 280 },
    { code: "slope", name: "Розуклонка XPS", unit: "м²", buy_price: 80, sell_price: 220 },
    { code: "primer", name: "Праймування основи", unit: "м²", buy_price: 15, sell_price: 40 },
    { code: "rubemast", name: "Наплавлення рулонної", unit: "м²", buy_price: 90, sell_price: 200 },
    { code: "demount", name: "Демонтаж старого покриття", unit: "м²", buy_price: 60, sell_price: 150 },
  ],
  "roofing.equipment": [
    { code: "gun", name: "Фен Leister", unit: "міс.", buy_price: 75000, sell_price: 2500, lifetime_months: 48 },
    { code: "burner", name: "Газовий пальник", unit: "міс.", buy_price: 25000, sell_price: 800, lifetime_months: 60 },
  ],
  "insulation.material": [
    { code: "eps_50", name: "EPS-35 50 мм", unit: "м²", buy_price: 85, sell_price: 145 },
    { code: "xps_50", name: "XPS Carbon 50 мм", unit: "м²", buy_price: 220, sell_price: 320 },
    { code: "mineral", name: "Мінвата 100 мм", unit: "м²", buy_price: 180, sell_price: 280 },
    { code: "polystyrcrete", name: "Полістиролбетон D300", unit: "м³", buy_price: 1900, sell_price: 2800 },
    { code: "glue", name: "Клей для утеплювача", unit: "міш.", buy_price: 210, sell_price: 320 },
    { code: "dowel", name: "Дюбель-парасолька", unit: "шт", buy_price: 4, sell_price: 9 },
  ],
  "insulation.work": [
    { code: "facade", name: "Монтаж утеплення фасаду", unit: "м²", buy_price: 180, sell_price: 380 },
    { code: "roof", name: "Утеплення покрівлі", unit: "м²", buy_price: 120, sell_price: 280 },
    { code: "floor", name: "Утеплення підлоги", unit: "м²", buy_price: 90, sell_price: 220 },
    { code: "polystyrcrete", name: "Заливка полістиролбетону", unit: "м³", buy_price: 600, sell_price: 1200 },
  ],
  "insulation.equipment": [
    { code: "mixer", name: "Будівельний міксер", unit: "міс.", buy_price: 12000, sell_price: 600, lifetime_months: 36 },
  ],
  "demolition.material": [
    { code: "bags", name: "Будівельні мішки 70 л", unit: "шт", buy_price: 18, sell_price: 35 },
    { code: "blade", name: "Алмазний диск 230 мм", unit: "шт", buy_price: 380, sell_price: 600 },
  ],
  "demolition.work": [
    { code: "screed", name: "Демонтаж стяжки", unit: "м²", buy_price: 120, sell_price: 250 },
    { code: "tile", name: "Демонтаж плитки", unit: "м²", buy_price: 80, sell_price: 180 },
    { code: "roof", name: "Демонтаж покрівлі", unit: "м²", buy_price: 100, sell_price: 220 },
    { code: "walls", name: "Демонтаж перегородок", unit: "м²", buy_price: 150, sell_price: 320 },
    { code: "haul", name: "Винос/вивіз сміття", unit: "м³", buy_price: 400, sell_price: 900 },
  ],
  "demolition.equipment": [
    { code: "hammer", name: "Відбійний молоток Bosch", unit: "міс.", buy_price: 45000, sell_price: 1500, lifetime_months: 48 },
    { code: "grinder", name: "Болгарка 230 мм", unit: "міс.", buy_price: 9000, sell_price: 400, lifetime_months: 36 },
  ],
};

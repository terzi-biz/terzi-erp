import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModuleEnum = z.enum(["screed", "roofing", "insulation", "demolition", "common"]);
const KindEnum = z.enum(["material", "work", "equipment", "logistics"]);

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

async function userIsInternal(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

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
    if (error) { console.error("listCatalog", error); throw new Error("Не вдалося завантажити каталог"); }
    const list = rows ?? [];
    const internal = await userIsInternal(context.supabase, context.userId);
    if (internal) return list;
    return list.map((r: any) => ({ ...r, buy_price: null }));
  });

export const upsertCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = data.id
      ? await context.supabase.from("catalog_items").update(data).eq("id", data.id).select().single()
      : await context.supabase.from("catalog_items").insert(data).select().single();
    if (error) { console.error("upsertCatalogItem", error); throw new Error("Не вдалося зберегти позицію каталогу"); }
    return out;
  });

export const deleteCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("catalog_items").delete().eq("id", data.id);
    if (error) { console.error("deleteCatalogItem", error); throw new Error("Не вдалося видалити позицію каталогу"); }
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
    if (error) { console.error("seedCatalogDefaults", error); throw new Error("Не вдалося ініціалізувати каталог"); }
    return { seeded: rows.length };
  });

type SeedItem = { code: string; name: string; unit: string; buy_price: number; sell_price: number; lifetime_months?: number };

const DEFAULT_SEEDS: Record<string, SeedItem[]> = {
  "screed.material": [
    // Джерело: TERZI_Стяжка_v3_2 (МАТЕРІАЛИ). Продажні = закупка × 1.30 (за замовч.),
    // редагуються далі вручну; кнопка «Пересіяти дефолти» в Settings перерахує.
    { code: "sand", name: "Пісок", unit: "т", buy_price: 650, sell_price: 845 },
    { code: "cement500", name: "Цемент М500 25 кг", unit: "міш.", buy_price: 175, sell_price: 228 },
    { code: "cement400", name: "Цемент М400 25 кг", unit: "міш.", buy_price: 155, sell_price: 202 },
    { code: "fiber", name: "Фібра поліпропіленова 900 г", unit: "уп.", buy_price: 125, sell_price: 230 },
    { code: "plast", name: "Пластифікатор", unit: "л", buy_price: 70, sell_price: 91 },
    { code: "film", name: "Плівка п/е 60 мкм", unit: "м.п.", buy_price: 6, sell_price: 10 },
    { code: "damper", name: "Демпферна стрічка 8 мм", unit: "п.м", buy_price: 7, sell_price: 14 },
    { code: "diesel", name: "Дизель (компресор/доставка)", unit: "л", buy_price: 82, sell_price: 92 },
    { code: "mesh_comp_25", name: "Сітка композитна 100×100, 2.5 мм", unit: "м²", buy_price: 30, sell_price: 70 },
    { code: "mesh_comp_35", name: "Сітка композитна 100×100, 3.5 мм", unit: "м²", buy_price: 55, sell_price: 105 },
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
  "screed.logistics": [
    { code: "station_city", name: "Доставка станції — місто", unit: "шт", buy_price: 1500, sell_price: 2000 },
    { code: "station_km", name: "Доставка за межі міста, км×2", unit: "км", buy_price: 40, sell_price: 60 },
    { code: "cement_own", name: "Цемент — свій бус (до 80 міш.)", unit: "шт", buy_price: 0, sell_price: 1000 },
    { code: "cement_small_manip", name: "Цемент — маленький маніпулятор", unit: "шт", buy_price: 2000, sell_price: 2500 },
    { code: "cement_big_manip", name: "Цемент — великий маніпулятор", unit: "шт", buy_price: 2500, sell_price: 3000 },
    { code: "sand_city", name: "Пісок — місто, 1 ходка (до 15 т)", unit: "ходка", buy_price: 1700, sell_price: 1800 },
    { code: "sand_outskirts", name: "Пісок — околиця", unit: "ходка", buy_price: 1700, sell_price: 2000 },
    { code: "sand_chornomorsk", name: "Пісок — Чорноморськ/Іллічівськ", unit: "ходка", buy_price: 1700, sell_price: 2500 },
    { code: "diesel", name: "Дизель для станції", unit: "л", buy_price: 88, sell_price: 88 },
  ],
  "roofing.material": [
    { code: "rubemast", name: "Рубемаст наплавний (рулон 10 м²)", unit: "рул.", buy_price: 850, sell_price: 1300 },
    { code: "primer", name: "Бітумний праймер", unit: "л", buy_price: 65, sell_price: 110 },
    { code: "gas", name: "Газ пропан (балон 50 л)", unit: "бал.", buy_price: 1200, sell_price: 1600 },
    { code: "pvc_15_sika", name: "ПВХ-мембрана Sika 1.5 мм", unit: "м²", buy_price: 320, sell_price: 480 },
    { code: "pvc_18_sika", name: "ПВХ-мембрана Sika 1.8 мм", unit: "м²", buy_price: 390, sell_price: 580 },
    { code: "geo_300", name: "Геотекстиль 300 г/м²", unit: "м²", buy_price: 28, sell_price: 55 },
    { code: "fastener", name: "Кріплення телескопічне", unit: "шт", buy_price: 8, sell_price: 18 },
    { code: "xps_50", name: "XPS 50 мм (розуклонка)", unit: "м²", buy_price: 220, sell_price: 320 },
    { code: "galtel_mix", name: "Цементно-піщана суміш М150 (галтель)", unit: "кг", buy_price: 8, sell_price: 15 },
    { code: "funnel", name: "Воронка покрівельна", unit: "шт", buy_price: 850, sell_price: 1400 },
    { code: "aerator", name: "Аератор покрівельний", unit: "шт", buy_price: 650, sell_price: 1100 },
    { code: "drip_edge", name: "Капельник металевий", unit: "п.м", buy_price: 110, sell_price: 190 },
    { code: "inner_corner", name: "Внутрішній кут ПВХ Sika", unit: "шт", buy_price: 95, sell_price: 180 },
    { code: "outer_corner", name: "Зовнішній кут ПВХ Sika", unit: "шт", buy_price: 95, sell_price: 180 },
    { code: "opaika_mastic", name: "Мастика бітумна (опайка)", unit: "кг", buy_price: 180, sell_price: 320 },
  ],
  "roofing.work": [
    { code: "rubemast_lay", name: "Наплавлення рубемасту (1 шар)", unit: "м²", buy_price: 90, sell_price: 200 },
    { code: "primer_apply", name: "Праймування основи", unit: "м²", buy_price: 15, sell_price: 40 },
    { code: "pvc_lay", name: "Монтаж ПВХ-мембрани Sika", unit: "м²", buy_price: 120, sell_price: 280 },
    { code: "geo_lay", name: "Укладка геотекстилю", unit: "м²", buy_price: 20, sell_price: 50 },
    { code: "slope", name: "Розуклонка XPS", unit: "м²", buy_price: 80, sell_price: 220 },
    { code: "demount", name: "Демонтаж старого покриття", unit: "м²", buy_price: 60, sell_price: 150 },
    { code: "parapet", name: "Обробка парапету/примикань", unit: "п.м", buy_price: 40, sell_price: 120 },
    { code: "galtel", name: "Влаштування галтелі", unit: "п.м", buy_price: 45, sell_price: 110 },
    { code: "funnel", name: "Монтаж воронок", unit: "шт", buy_price: 250, sell_price: 600 },
    { code: "aerator", name: "Монтаж аераторів", unit: "шт", buy_price: 200, sell_price: 450 },
    { code: "drip_edge", name: "Монтаж капельника", unit: "п.м", buy_price: 30, sell_price: 80 },
    { code: "corner", name: "Монтаж кутів (вн/зовн)", unit: "шт", buy_price: 70, sell_price: 180 },
    { code: "opaika", name: "Точки опайки / локальний ремонт", unit: "шт", buy_price: 60, sell_price: 150 },
  ],

  "roofing.equipment": [
    { code: "burner", name: "Газовий пальник", unit: "міс.", buy_price: 25000, sell_price: 800, lifetime_months: 60 },
    { code: "leister", name: "Фен Leister Triac", unit: "міс.", buy_price: 75000, sell_price: 2500, lifetime_months: 48 },
    { code: "tools", name: "Ручний інструмент бригади", unit: "міс.", buy_price: 30000, sell_price: 1000, lifetime_months: 36 },
  ],
  "roofing.logistics": [
    { code: "delivery_city", name: "Доставка по місту", unit: "шт", buy_price: 800, sell_price: 1200 },
    { code: "delivery_km", name: "За межі міста, км×2", unit: "км", buy_price: 30, sell_price: 50 },
    { code: "lift", name: "Підйом матеріалів на дах", unit: "шт", buy_price: 1500, sell_price: 2500 },
    { code: "haul", name: "Вивіз сміття (контейнер 8 м³)", unit: "шт", buy_price: 3500, sell_price: 5000 },
  ],
  "insulation.material": [
    { code: "eps_50", name: "EPS-35 пінопласт 50 мм", unit: "м²", buy_price: 85, sell_price: 145 },
    { code: "xps_50", name: "XPS Carbon Prof 50 мм", unit: "м²", buy_price: 220, sell_price: 320 },
    { code: "mineral", name: "Мінвата Rockwool 100 мм", unit: "м²", buy_price: 180, sell_price: 280 },
    { code: "polystyrcrete", name: "Полістиролбетон D300", unit: "м³", buy_price: 1900, sell_price: 2800 },
    { code: "glue", name: "Клей для утеплювача Ceresit CT-83", unit: "міш.", buy_price: 210, sell_price: 320 },
    { code: "dowel", name: "Дюбель-парасолька 10×120", unit: "шт", buy_price: 4, sell_price: 9 },
    { code: "mesh", name: "Склосітка фасадна 165 г/м²", unit: "м²", buy_price: 25, sell_price: 55 },
    { code: "primer", name: "Ґрунт кварцовий Ceresit CT-16", unit: "л", buy_price: 60, sell_price: 110 },
    { code: "corner_profile", name: "Кутник перфорований з сіткою", unit: "п.м", buy_price: 35, sell_price: 70 },
    { code: "start_profile", name: "Стартовий профіль 50 мм", unit: "п.м", buy_price: 55, sell_price: 110 },
    { code: "decor", name: "Декоративна штукатурка короїд 25 кг", unit: "міш.", buy_price: 520, sell_price: 780 },
  ],
  "insulation.work": [
    { code: "facade", name: "Утеплення фасаду", unit: "м²", buy_price: 180, sell_price: 380 },
    { code: "roof", name: "Утеплення покрівлі", unit: "м²", buy_price: 120, sell_price: 280 },
    { code: "floor", name: "Утеплення підлоги", unit: "м²", buy_price: 90, sell_price: 220 },
    { code: "polystyrcrete", name: "Заливка полістиролбетону", unit: "м³", buy_price: 600, sell_price: 1200 },
    { code: "mesh_apply", name: "Армування склосіткою", unit: "м²", buy_price: 40, sell_price: 90 },
    { code: "dowel_apply", name: "Установка дюбелів", unit: "шт", buy_price: 4, sell_price: 12 },
    { code: "primer_apply", name: "Ґрунтування основи", unit: "м²", buy_price: 8, sell_price: 25 },
    { code: "decor_apply", name: "Нанесення декоративної штукатурки", unit: "м²", buy_price: 120, sell_price: 280 },
  ],
  "insulation.equipment": [
    { code: "mixer", name: "Будівельний міксер Bosch", unit: "міс.", buy_price: 12000, sell_price: 600, lifetime_months: 36 },
    { code: "scaffold", name: "Будівельні риштування (комплект)", unit: "міс.", buy_price: 80000, sell_price: 2500, lifetime_months: 60 },
    { code: "pump", name: "Насос для полістиролбетону", unit: "міс.", buy_price: 180000, sell_price: 6000, lifetime_months: 60 },
    { code: "tools", name: "Ручний інструмент бригади", unit: "міс.", buy_price: 25000, sell_price: 800, lifetime_months: 36 },
  ],
  "insulation.logistics": [
    { code: "delivery_city", name: "Доставка по місту", unit: "шт", buy_price: 800, sell_price: 1200 },
    { code: "delivery_km", name: "За межі міста, км×2", unit: "км", buy_price: 30, sell_price: 50 },
    { code: "lift", name: "Підйом матеріалів на поверх", unit: "шт", buy_price: 1000, sell_price: 1800 },
    { code: "haul", name: "Вивіз сміття (контейнер 8 м³)", unit: "шт", buy_price: 3500, sell_price: 5000 },
  ],
  "demolition.material": [
    { code: "bags", name: "Будівельні мішки 70 л", unit: "шт", buy_price: 18, sell_price: 35 },
    { code: "blade", name: "Алмазний диск 230 мм", unit: "шт", buy_price: 380, sell_price: 600 },
    { code: "chisel", name: "Долото SDS-max", unit: "шт", buy_price: 450, sell_price: 700 },
    { code: "film", name: "Плівка захисна п/е 100 мкм", unit: "м²", buy_price: 8, sell_price: 18 },
    { code: "tape", name: "Малярна стрічка/скотч", unit: "шт", buy_price: 45, sell_price: 90 },
  ],
  "demolition.work": [
    { code: "screed", name: "Демонтаж стяжки", unit: "м²", buy_price: 120, sell_price: 250 },
    { code: "tile", name: "Демонтаж плитки", unit: "м²", buy_price: 80, sell_price: 180 },
    { code: "roof", name: "Демонтаж покрівлі", unit: "м²", buy_price: 100, sell_price: 220 },
    { code: "walls", name: "Демонтаж перегородок", unit: "м²", buy_price: 150, sell_price: 320 },
    { code: "haul", name: "Винесення сміття до контейнера", unit: "м³", buy_price: 400, sell_price: 900 },
    { code: "protect", name: "Захист поверхонь плівкою", unit: "м²", buy_price: 15, sell_price: 40 },
    { code: "cleanup", name: "Прибирання після демонтажу", unit: "м²", buy_price: 10, sell_price: 25 },
  ],
  "demolition.equipment": [
    { code: "hammer", name: "Відбійний молоток Bosch GSH-16", unit: "міс.", buy_price: 45000, sell_price: 1500, lifetime_months: 48 },
    { code: "perforator", name: "Перфоратор SDS-max", unit: "міс.", buy_price: 22000, sell_price: 900, lifetime_months: 48 },
    { code: "grinder", name: "Болгарка 230 мм", unit: "міс.", buy_price: 9000, sell_price: 400, lifetime_months: 36 },
    { code: "vacuum", name: "Промисловий пилосос Bosch", unit: "міс.", buy_price: 18000, sell_price: 700, lifetime_months: 48 },
    { code: "tools", name: "Ручний інструмент бригади", unit: "міс.", buy_price: 20000, sell_price: 700, lifetime_months: 36 },
  ],
  "demolition.logistics": [
    { code: "container_8", name: "Контейнер 8 м³ (вивіз)", unit: "шт", buy_price: 3500, sell_price: 5000 },
    { code: "container_27", name: "Контейнер 27 м³ (вивіз)", unit: "шт", buy_price: 7000, sell_price: 10000 },
    { code: "delivery_km", name: "За межі міста, км×2", unit: "км", buy_price: 30, sell_price: 50 },
    { code: "lift_down", name: "Спуск сміття з поверху", unit: "шт", buy_price: 800, sell_price: 1500 },
  ],
};

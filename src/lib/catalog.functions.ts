import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROOFING_KB_MATERIALS, ROOFING_KB_WORKS } from "@/lib/roofing-knowledge.generated";

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

/**
 * Пересіяти дефолтні прайси для non-custom позицій каталогу.
 * Якщо позиція існує (по code) — оновлюємо buy_price та (опційно) sell_price.
 * Якщо не існує — вставляємо. Custom позиції (is_custom=true) не чіпаємо.
 * Admin-only.
 */
export const resyncCatalogPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    module: ModuleEnum,
    kind: KindEnum,
    markupPercent: z.number().min(0).max(500).default(30),
    updateSell: z.boolean().default(true),
    forceReplaceSystem: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await userIsInternal(context.supabase, context.userId))) {
      throw new Error("Недостатньо прав");
    }
    const items = getDefaultSeeds(data.module, data.kind);
    if (items.length === 0) return { updated: 0, inserted: 0 };

    const { data: existing } = await context.supabase
      .from("catalog_items").select("id, code, is_custom, sell_price")
      .eq("module", data.module).eq("kind", data.kind);
    const byCode = new Map<string, { id: string; is_custom: boolean; sell_price: number }>();
    for (const r of (existing ?? []) as Array<{ id: string; code: string | null; is_custom: boolean; sell_price: number }>) {
      if (r.code) byCode.set(r.code, { id: r.id, is_custom: !!r.is_custom, sell_price: Number(r.sell_price) || 0 });
    }

    const k = 1 + (data.markupPercent / 100);
    let updated = 0, inserted = 0, deleted = 0;
    if (data.forceReplaceSystem && data.module === "roofing" && (data.kind === "material" || data.kind === "work")) {
      const seedCodes = new Set(items.map((it) => it.code));
      for (const r of (existing ?? []) as Array<{ id: string; code: string | null; is_custom: boolean }>) {
        if (r.is_custom) continue;
        if (r.code && seedCodes.has(r.code)) continue;
        const { error } = await context.supabase.from("catalog_items").delete().eq("id", r.id);
        if (error) { console.error("resyncCatalogPrices forced delete", error); throw new Error("Не вдалося очистити старі позиції покрівлі"); }
        deleted++;
      }
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      // Якщо seed має явну sell_price > 0 — це курований прайс з Excel, використовуємо як є.
      // Інакше рахуємо через націнку від закупки.
      const seedSell = it.sell_price > 0 ? it.sell_price : Math.round(it.buy_price * k);
      const cur = byCode.get(it.code);
      if (cur) {
        if (cur.is_custom) continue;
        const patch: { buy_price: number; name: string; unit: string; sort_order: number; sell_price?: number } =
          { buy_price: it.buy_price, name: it.name, unit: it.unit, sort_order: i };
        if (data.updateSell) patch.sell_price = seedSell;
        const { error } = await context.supabase.from("catalog_items").update(patch).eq("id", cur.id);
        if (error) { console.error("resyncCatalogPrices update", error); throw new Error("Не вдалося оновити позицію"); }
        updated++;
      } else {
        const { error } = await context.supabase.from("catalog_items").insert({
          ...it,
          sell_price: data.updateSell ? seedSell : it.sell_price,
          module: data.module, kind: data.kind, is_custom: false, sort_order: i,
        });
        if (error) { console.error("resyncCatalogPrices insert", error); throw new Error("Не вдалося додати позицію"); }
        inserted++;
      }
    }
    return { updated, inserted, deleted };
  });

type SeedItem = { code: string; name: string; unit: string; buy_price: number; sell_price: number; lifetime_months?: number };

const seedSell = (buy: number, markup = 30) => Math.round(buy * (1 + markup / 100));
const rollBuy = (pricePerM2: number, rollM2 = 1) => Math.round(pricePerM2 * rollM2);

const ROOFING_FILE_MATERIAL_SEEDS: SeedItem[] = ROOFING_KB_MATERIALS.map((m, i) => {
  const isRoll = (m.category === "РУБЕРІТ" || m.category === "АКВАІЗОЛ") && (m.rollM2 ?? 0) > 1;
  const buy = isRoll ? rollBuy(m.price, m.rollM2) : Math.round(m.price);
  return {
    code: `roof_file_mat_${String(i + 1).padStart(2, "0")}`,
    name: isRoll ? `${m.name} — рулон ${m.rollM2} м²` : m.name,
    unit: isRoll ? "рул." : m.unit,
    buy_price: buy,
    sell_price: seedSell(buy),
  };
});

const ROOFING_FILE_WORK_SEEDS: SeedItem[] = ROOFING_KB_WORKS.map((w, i) => ({
  code: `roof_file_work_${String(i + 1).padStart(2, "0")}`,
  name: w.name,
  unit: w.unit.replace("м.п.", "п.м"),
  buy_price: w.basePrice,
  sell_price: Math.round(w.basePrice * 2),
}));

function getDefaultSeeds(module: z.infer<typeof ModuleEnum>, kind: z.infer<typeof KindEnum>): SeedItem[] {
  const key = `${module}.${kind}`;
  if (module === "roofing" && kind === "material") return DEFAULT_SEEDS[key] ?? [];
  if (module === "roofing" && kind === "work") return DEFAULT_SEEDS[key] ?? [];
  return DEFAULT_SEEDS[key] ?? [];
}

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
    // Наплавні рулонні матеріали — прайс Aquaizol від 30.03.2026. Продаж = закупка × 1.30.
    // Рулон = 10 м², тому buy_price за рулон = ціна за м² × 10. Ціна за м² відображена в назві.
    { code: "ruberit_roll", name: "Руберіт ЕКО-СХ-3.5-П — рулон 10 м²", unit: "рул.", buy_price: 1121, sell_price: 1457 },
    { code: "aquaizol_roll", name: "Акваізол ЕКО-ПЕ-3.0 — рулон 15 м²", unit: "рул.", buy_price: 2474, sell_price: 3216 },
    { code: "ruberit_eko_35", name: "Руберіт ЕКО СХ-3.5-П — рулон 10 м²", unit: "рул.", buy_price: 1121, sell_price: 1457 },
    { code: "ruberit_eko_40", name: "Руберіт ЕКО СХ-4.0-П — рулон 10 м²", unit: "рул.", buy_price: 1207, sell_price: 1569 },
    { code: "aquaizol_eko_30", name: "Акваізол ЕКО-ПЕ-3.0 — рулон 10 м²", unit: "рул.", buy_price: 1649, sell_price: 2144 },
    { code: "aquaizol_eko_40", name: "Акваізол ЕКО-ПЕ-4.0 — рулон 10 м²", unit: "рул.", buy_price: 2048, sell_price: 2663 },
    { code: "aquaizol_app_30", name: "Акваізол АПП-ПЕ-3.0 — рулон 10 м²", unit: "рул.", buy_price: 1758, sell_price: 2286 },
    { code: "aquaizol_app_45", name: "Акваізол АПП-ПЕ-4.5-ПС — рулон 10 м²", unit: "рул.", buy_price: 2100, sell_price: 2730 },
    { code: "aquaizol_sbs_40", name: "Акваізол СБС-ПЕ-4.0-ПС — рулон 10 м²", unit: "рул.", buy_price: 1900, sell_price: 2470 },
    // Комплектуючі Aquaizol
    { code: "primer", name: "Праймер бітумний АР-20 Акваізол (17 кг / 20 л)", unit: "відро", buy_price: 1800, sell_price: 2340 },
    { code: "opaika_mastic", name: "Мастика бітумно-каучукова АМ-10 (10 кг)", unit: "відро", buy_price: 1050, sell_price: 1365 },
    { code: "opaika_mastic_3kg", name: "Мастика бітумно-каучукова АМ-10 (3 кг)", unit: "відро", buy_price: 360, sell_price: 468 },
    { code: "funnel", name: "Воронка покрівельна d 100 мм", unit: "шт", buy_price: 162, sell_price: 210 },
    { code: "aerator", name: "Флюгарка/вентилятор d 110 мм", unit: "шт", buy_price: 234, sell_price: 304 },
    { code: "flugarka_75", name: "Флюгарка d 75 мм", unit: "шт", buy_price: 150, sell_price: 195 },
    { code: "gas", name: "Газ пропан (балон 50 л)", unit: "бал.", buy_price: 1200, sell_price: 1560 },
    // ПВХ-мембрана — прайс ТОВ «Лебер» від 04.05.2026. Продаж = закупка × 1.30.
    { code: "pvc_15_sika", name: "ПВХ мембрана Sikaplan SPL G-15 light grey 2,0×20 м", unit: "м²", buy_price: 359, sell_price: 467 },
    { code: "pvc_18_sika", name: "Покрівельна неармована мембрана Sikaplan D-15 1×20 м", unit: "м²", buy_price: 520, sell_price: 676 },
    { code: "pvc_metal", name: "Ламінований ПВХ-метал 1,2 мм RAL 7047 (1×2 м)", unit: "м²", buy_price: 1400, sell_price: 1820 },
    { code: "sika_sealant", name: "Клей-герметик Sikaflex-11FC Purform сірий 600 мл", unit: "шт", buy_price: 397, sell_price: 516 },
    { code: "geo_300", name: "Геотекстиль LB geotex PP200 (200 г/м²)", unit: "м²", buy_price: 44, sell_price: 57 },
    { code: "funnel_scupper_75", name: "Парапетна воронка S-Scupper PVC d 75 мм", unit: "шт", buy_price: 2000, sell_price: 2600 },
    { code: "funnel_scupper_110", name: "Парапетна воронка S-Scupper PVC d 110 мм", unit: "шт", buy_price: 2110, sell_price: 2742 },
    { code: "funnel_gully_160", name: "Покрівельна воронка S-Gully PVC d 160 мм", unit: "шт", buy_price: 2790, sell_price: 3627 },
    { code: "funnel_drain_90", name: "Дренажна воронка S-Drain PVC d 90 мм", unit: "шт", buy_price: 2135, sell_price: 2776 },
    { code: "pvc_flugarka", name: "Флюгарка PVC d 75 мм з ковпачком", unit: "шт", buy_price: 730, sell_price: 949 },
    { code: "fastener", name: "Кріплення телескопічне (комплект дюб+тарілка)", unit: "шт", buy_price: 8, sell_price: 18 },
    { code: "dowel_8x50", name: "Дюбель розпірний 8×50 (100 шт)", unit: "уп.", buy_price: 242, sell_price: 314 },
    { code: "dowel_8x100", name: "Дюбель поліпроп. 8×100 (100 шт)", unit: "уп.", buy_price: 364, sell_price: 473 },
    { code: "screw_5x70", name: "Шуруп гартований 5,0×70 (100 шт)", unit: "уп.", buy_price: 101, sell_price: 131 },
    { code: "washer_50", name: "Тарілка дожимна 50×5×0,75 (100 шт)", unit: "уп.", buy_price: 340, sell_price: 442 },
    { code: "drill_sds_8", name: "Свердло SDS PLUS 8,0×160/100", unit: "шт", buy_price: 50, sell_price: 65 },
    { code: "pvc_clamp", name: "Прижимна планка з листа оцинкованого", unit: "п.м", buy_price: 36, sell_price: 47 },
    // Розуклонка / галтель / примикання
    { code: "xps_50", name: "XPS Carbon Prof 50 мм (розуклонка)", unit: "м²", buy_price: 220, sell_price: 286 },
    { code: "galtel_mix", name: "Цементно-піщана суміш М150 (галтель)", unit: "кг", buy_price: 8, sell_price: 12 },
    { code: "drip_edge", name: "Капельник металевий", unit: "п.м", buy_price: 110, sell_price: 143 },
    { code: "inner_corner", name: "Внутрішній кут ПВХ Sika", unit: "шт", buy_price: 95, sell_price: 124 },
    { code: "outer_corner", name: "Зовнішній кут ПВХ Sika", unit: "шт", buy_price: 95, sell_price: 124 },
    { code: "pvc_angle", name: "ПВХ-уголок (внутрішнє примикання)", unit: "п.м", buy_price: 85, sell_price: 110 },
    ...ROOFING_FILE_MATERIAL_SEEDS,
  ],
  "roofing.work": [
    // Ціни продажу — з "Себистоимость_по_работам_TERZI_ПВХ_Руберойд.xlsx"
    // (тариф 100–500 м²). Собівартість = базова колонка "Цена себестоимости".
    // Калькулятор додатково масштабує собівартість бригади по area-tier.
    { code: "prep",           name: "Підготовка поверхні",                       unit: "м²",  buy_price: 20,  sell_price: 40 },
    { code: "primer_apply",   name: "Нанесення праймера / ґрунту",              unit: "м²",  buy_price: 20,  sell_price: 40 },
    { code: "geo_lay",        name: "Монтаж геотекстилю",                        unit: "м²",  buy_price: 20,  sell_price: 40 },
    { code: "pvc_lay",        name: "Монтаж ПВХ-мембрани Sika",                  unit: "м²",  buy_price: 160, sell_price: 320 },
    { code: "pvc_lay_lin",    name: "Монтаж ПВХ-мембрани (парапет/примикання)", unit: "п.м", buy_price: 100, sell_price: 200 },
    { code: "rubemast_lay",   name: "Монтаж рубероїду 2 шари",                   unit: "м²",  buy_price: 160, sell_price: 320 },
    { code: "rubemast_lay_lin", name: "Монтаж рубероїду (парапет/примикання)", unit: "п.м", buy_price: 100, sell_price: 200 },
    { code: "funnel",         name: "Монтаж і опайка воронки",                   unit: "шт",  buy_price: 750, sell_price: 1500 },
    { code: "aerator",        name: "Монтаж і опайка аератора",                  unit: "шт",  buy_price: 550, sell_price: 1100 },
    { code: "drip_edge",      name: "Монтаж ПВХ-капельника",                     unit: "п.м", buy_price: 100, sell_price: 200 },
    { code: "corner",         name: "Монтаж кутів (внутр./зовн.) ПВХ",           unit: "шт",  buy_price: 70,  sell_price: 180 },
    { code: "opaika",         name: "Точки опайки / локальний ремонт",           unit: "шт",  buy_price: 60,  sell_price: 150 },
    { code: "galtel",         name: "Влаштування галтелі (ц/п)",                 unit: "п.м", buy_price: 45,  sell_price: 110 },
    { code: "parapet",        name: "Обробка парапету / примикань",              unit: "п.м", buy_price: 40,  sell_price: 120 },
    { code: "slope",          name: "Розуклонка XPS",                            unit: "м²",  buy_price: 80,  sell_price: 220 },
    { code: "demount",        name: "Демонтаж старого покриття",                 unit: "м²",  buy_price: 60,  sell_price: 150 },
    { code: "pvc_angle_lay",  name: "Монтаж ПВХ-уголка",                         unit: "п.м", buy_price: 40,  sell_price: 80 },
    { code: "pvc_clamp_lay",  name: "Монтаж прижимної планки з герметиком",      unit: "п.м", buy_price: 45,  sell_price: 90 },
    { code: "gasblock_parapet", name: "Кладка газоблоку на парапет",             unit: "п.м", buy_price: 250, sell_price: 500 },
    { code: "insul_1layer",   name: "Утеплення пінопласт 1 шар (на дах)",        unit: "м²",  buy_price: 25,  sell_price: 50 },
    ...ROOFING_FILE_WORK_SEEDS,
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

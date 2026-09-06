import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { toUah } from "../src/lib/marketing/fx.server";
const db: any = supabaseAdmin;
const { data } = await db.from("marketing_daily_metrics").select("id,date,spend,currency,currency_original").is("currency_original", null);
let n = 0;
for (const r of data ?? []) {
  const cur = String(r.currency ?? "UAH").toUpperCase();
  const m = await toUah(Number(r.spend ?? 0), cur, String(r.date));
  await db.from("marketing_daily_metrics").update({ spend: m.uah, currency: "UAH", spend_original: m.original, currency_original: m.currency, fx_rate: m.rate }).eq("id", r.id);
  n++;
}
console.log("updated", n);
const { data: sum } = await db.from("marketing_daily_metrics").select("spend,spend_original,currency_original");
console.log(sum?.reduce((a: number, r: any) => a + Number(r.spend), 0), sum?.reduce((a: number, r: any) => a + Number(r.spend_original ?? 0), 0), sum?.[0]);

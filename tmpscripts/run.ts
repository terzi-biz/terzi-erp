import { admin } from "../src/lib/access.server";
import { buildContext } from "../src/lib/integrations/core.server";
import { importChunk } from "../src/lib/integrations/keycrm/import.server";

const entity = process.argv[2] ?? "lead_cards";
const maxPages = Number(process.argv[3] ?? 1);
const db = await admin();
const { data: integ } = await db.from("integrations").select("*").eq("provider_key", "keycrm").maybeSingle();
const ctx = await buildContext(integ as any);
for (let i = 0; i < maxPages; i++) {
  const r = await importChunk(ctx, entity, { pageSize: 50 });
  console.log(JSON.stringify(r));
  if (r.done) break;
}

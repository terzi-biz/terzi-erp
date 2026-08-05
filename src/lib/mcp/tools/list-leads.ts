import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "Список лідів",
  description: "Повертає ліди CRM TERZI: назва, напрямок, статус, джерело, бюджет, наступна дія.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Пошук за назвою або адресою ліда."),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("crm_leads")
      .select("id,title,status,direction,source,budget,area,address,district,client_id,order_id,next_action_at,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) {
      const safe = search.replace(/[%,()]/g, " ");
      query = query.or(`title.ilike.%${safe}%,address.ilike.%${safe}%`);
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { leads: data ?? [] },
    };
  },
});

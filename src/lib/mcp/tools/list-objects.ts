import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_objects",
  title: "Список об'єктів",
  description: "Повертає об'єкти TERZI ERP з адресою, статусами та плановими датами.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Пошук за назвою, номером або адресою."),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("objects")
      .select("id,number,name,address,district,object_type,commercial_status,production_status,financial_status,planned_start,planned_end,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) {
      const safe = search.replace(/[%,()]/g, " ");
      query = query.or(`name.ilike.%${safe}%,number.ilike.%${safe}%,address.ilike.%${safe}%`);
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { objects: data ?? [] },
    };
  },
});

import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_clients",
  title: "Список клієнтів",
  description: "Повертає клієнтів TERZI ERP, доступних користувачу. Можна фільтрувати за пошуковим рядком (ім'я, телефон, email).",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Пошук за ім'ям, телефоном або email."),
    limit: z.number().int().min(1).max(100).default(20).describe("Кількість записів."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("clients")
      .select("id,name,phone,email,address,status,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (search) {
      const safe = search.replace(/[%,()]/g, " ");
      query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { clients: data ?? [] },
    };
  },
});

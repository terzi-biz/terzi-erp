import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

const MODULES = ["screed", "roofing", "roofing_pvc", "roofing_rub", "insulation", "demolition"] as const;

export default defineTool({
  name: "list_estimates",
  title: "Список кошторисів",
  description:
    "Повертає кошториси TERZI ERP (номер, напрямок, клієнт, площа, статус, сума для клієнта). Внутрішні фінансові показники не повертаються.",
  inputSchema: {
    module: z.enum(MODULES).optional().describe("Фільтр за напрямком."),
    status: z.string().trim().min(1).optional().describe("Фільтр за статусом кошторису."),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ module, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("estimates")
      .select("id,number,module,client_id,client_name,object_id,address,area,status,total,duration_days,manager,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (module) query = query.eq("module", module);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { estimates: data ?? [] },
    };
  },
});

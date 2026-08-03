import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_lead",
  title: "Створити лід",
  description: "Створює новий лід у CRM TERZI від імені користувача, що увійшов у систему.",
  inputSchema: {
    title: z.string().trim().min(2).describe("Назва ліда, напр. «Стяжка, вул. Дерибасівська 12»."),
    direction: z.string().trim().min(1).optional().describe("Напрямок робіт: стяжка, покрівля, утеплення, демонтаж."),
    source: z.string().trim().min(1).optional().describe("Джерело звернення."),
    address: z.string().trim().min(1).optional(),
    district: z.string().trim().min(1).optional(),
    area: z.number().positive().optional().describe("Площа, м²."),
    budget: z.number().nonnegative().optional().describe("Орієнтовний бюджет, грн."),
    notes: z.string().trim().min(1).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("crm_leads")
      .insert({ ...input, owner_id: ctx.getUserId() })
      .select("id,title,status,direction,source,address,area,budget,created_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { lead: data },
    };
  },
});

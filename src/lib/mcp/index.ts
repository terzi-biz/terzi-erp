import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClients from "./tools/list-clients";
import listOrders from "./tools/list-objects";
import listEstimates from "./tools/list-estimates";
import listLeads from "./tools/list-leads";
import createLead from "./tools/create-lead";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "terzi-erp-system",
  title: "TERZI ERP system",
  version: "0.1.0",
  instructions:
    "Інструменти TERZI ERP: клієнти, замовлення, кошториси та ліди CRM. Кожен виклик виконується від імені користувача, що увійшов у систему, з урахуванням його прав доступу. Внутрішні фінансові дані (собівартість, маржа, прибуток) через MCP не передаються.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClients, listOrders, listEstimates, listLeads, createLead],
});

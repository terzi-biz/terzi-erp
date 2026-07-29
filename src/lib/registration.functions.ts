import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RegistrationApprovalRow = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  note: string | null;
};

export const listRegistrationApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error("Не вдалося перевірити права доступу");
    const canReview = (roles ?? []).some((row) => row.role === "admin" || row.role === "director");
    if (!canReview) throw new Error("Доступ лише для адміністраторів");

    const { data, error } = await context.supabase
      .from("registration_approvals")
      .select("id,user_id,email,display_name,avatar_url,status,requested_at,reviewed_at,reviewed_by,note")
      .order("requested_at", { ascending: false });
    if (error) throw new Error("Не вдалося завантажити заявки на доступ");
    return (data ?? []) as RegistrationApprovalRow[];
  });

export const reviewRegistrationApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected"]),
    note: z.string().max(1000).optional().nullable(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error("Не вдалося перевірити права доступу");
    const canReview = (roles ?? []).some((row) => row.role === "admin" || row.role === "director");
    if (!canReview) throw new Error("Доступ лише для адміністраторів");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: approval, error: readError } = await supabaseAdmin
      .from("registration_approvals")
      .select("id,user_id,status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error("Не вдалося знайти заявку");
    if (!approval) throw new Error("Заявку не знайдено");

    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from("registration_approvals")
      .update({
        status: data.status,
        note: data.note ?? null,
        reviewed_by: context.userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", data.id)
      .select("id,user_id,email,display_name,avatar_url,status,requested_at,reviewed_at,reviewed_by,note")
      .single();
    if (error) throw new Error("Не вдалося оновити заявку");

    if (data.status === "approved") {
      const { data: existingRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", approval.user_id)
        .limit(1);
      if (!existingRoles?.length) {
        const { error: roleInsertError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: approval.user_id, role: "manager" });
        if (roleInsertError) throw new Error("Заявку підтверджено, але роль користувача не створена");
      }
    }

    return updated as RegistrationApprovalRow;
  });
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitation } from "@/lib/access.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      if (typeof window !== "undefined") sessionStorage.setItem("terzi:invite", params.token);
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Запрошення в TERZI ERP" },
      { name: "description", content: "Активація запрошення співробітника в TERZI ERP: підтвердження ролі та доступів." },
      { property: "og:title", content: "Запрошення в TERZI ERP" },
      { property: "og:description", content: "Активуйте свій доступ до TERZI ERP за одноразовим запрошенням." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const nav = useNavigate();
  const acceptFn = useServerFn(acceptInvitation);
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Активуємо ваш доступ…");

  useEffect(() => {
    let active = true;
    acceptFn({ data: { token } })
      .then(() => {
        if (!active) return;
        setState("done");
        setMessage("Доступ активовано. Ласкаво просимо до TERZI ERP.");
      })
      .catch((e: any) => {
        if (!active) return;
        setState("error");
        setMessage(e?.message ?? "Не вдалося активувати запрошення");
      });
    return () => { active = false; };
  }, [token, acceptFn]);

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="panel w-full max-w-md p-6 text-center">
        <h1 className="text-2xl font-black">Запрошення TERZI</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        {state === "done" && <Button className="mt-5" onClick={() => nav({ to: "/" })}>Перейти в систему</Button>}
        {state === "error" && <Button variant="outline" className="mt-5" onClick={() => nav({ to: "/" })}>На головну</Button>}
      </div>
    </div>
  );
}

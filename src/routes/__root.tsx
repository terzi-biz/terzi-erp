import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TERZI Estimate System" },
      { name: "description", content: "Преміальна сметно-управлінська система TERZI" },
      { property: "og:title", content: "TERZI Estimate System" },
      { name: "twitter:title", content: "TERZI Estimate System" },
      { property: "og:description", content: "Преміальна сметно-управлінська система TERZI" },
      { name: "twitter:description", content: "Преміальна сметно-управлінська система TERZI" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/d3907066-dae8-42d5-83cd-1260efc59aaa" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/d3907066-dae8-42d5-83cd-1260efc59aaa" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: ({ children }: { children: React.ReactNode }) => (
    <html lang="uk"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
  ),
  component: RootComponent,
  notFoundComponent: () => <div className="p-10"><h1 className="text-2xl font-bold">404</h1></div>,
  errorComponent: ({ error }: { error: Error }) => {
    if (typeof console !== "undefined") console.error(error);
    return <div className="p-10 text-destructive"><h1 className="text-xl font-bold mb-2">Сталася помилка</h1><p className="text-sm text-muted-foreground">Спробуйте оновити сторінку або зверніться до адміністратора.</p></div>;
  },
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isLogin = loc.pathname === "/login";

  useEffect(() => {
    if (!loading && !user && !isLogin) nav({ to: "/login" });
  }, [loading, user, isLogin, nav]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Завантаження…</div>;
  if (isLogin) return <Outlet />;
  if (!user) return null;
  return <AppShell><Outlet /></AppShell>;
}

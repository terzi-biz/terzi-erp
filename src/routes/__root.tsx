import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthProvider, useAuth } from "@/lib/auth";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TERZI Estimate System" },
      { name: "description", content: "Преміальна сметно-управлінська система TERZI" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: ({ children }: { children: React.ReactNode }) => (
    <html lang="uk"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
  ),
  component: RootComponent,
  notFoundComponent: () => <div className="p-10"><h1 className="text-2xl font-bold">404</h1></div>,
  errorComponent: ({ error }: { error: Error }) => <div className="p-10 text-destructive"><pre>{error.message}</pre></div>,
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

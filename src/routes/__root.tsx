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
      { property: "og:title", content: "TERZI Estimate System" },
      { name: "twitter:title", content: "TERZI Estimate System" },
      { property: "og:description", content: "Преміальна сметно-управлінська система TERZI" },
      { name: "twitter:description", content: "Преміальна сметно-управлінська система TERZI" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6d1bfa0c-cb65-4707-981b-326d8ac3abb9/id-preview-fdd422eb--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app-1779961659701.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6d1bfa0c-cb65-4707-981b-326d8ac3abb9/id-preview-fdd422eb--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app-1779961659701.png" },
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

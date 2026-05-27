import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
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
  component: () => {
    const { queryClient } = Route.useRouteContext();
    return (
      <QueryClientProvider client={queryClient}>
        <AppShell><Outlet /></AppShell>
      </QueryClientProvider>
    );
  },
  notFoundComponent: () => <div className="p-10"><h1 className="text-2xl font-bold">404</h1></div>,
  errorComponent: ({ error }: { error: Error }) => <div className="p-10 text-destructive"><pre>{error.message}</pre></div>,
});

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Повернення на вкладку не має перезавантажувати дані й скидати відкриті форми.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 60_000 },
    },
  });


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

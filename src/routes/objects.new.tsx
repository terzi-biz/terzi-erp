import { createFileRoute, redirect } from "@tanstack/react-router";

/** Старе посилання /objects/new — постійний редирект на /orders/new. */
export const Route = createFileRoute("/objects/new")({
  beforeLoad: () => {
    throw redirect({ to: "/orders/new", replace: true });
  },
});

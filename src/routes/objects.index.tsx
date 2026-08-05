import { createFileRoute, redirect } from "@tanstack/react-router";

/** Старе посилання /objects — постійний редирект на /orders. */
export const Route = createFileRoute("/objects/")({
  beforeLoad: () => {
    throw redirect({ to: "/orders", replace: true });
  },
});

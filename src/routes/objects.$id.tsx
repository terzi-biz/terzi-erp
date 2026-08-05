import { createFileRoute, redirect } from "@tanstack/react-router";

/** Старе посилання /objects/:id — постійний редирект на /orders/:id. */
export const Route = createFileRoute("/objects/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/orders/$id", params: { id: params.id }, replace: true });
  },
});

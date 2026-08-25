import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Застарілий маршрут об'єднаної покрівлі.
 * Модуль розділено на «ПВХ мембрана» (/roofing_pvc) та «Руберойд» (/roofing_rub);
 * старі посилання перенаправляємо на ПВХ, щоб не втратити збережені URL.
 */
export const Route = createFileRoute("/roofing")({
  beforeLoad: () => {
    throw redirect({ to: "/roofing_pvc", search: { estimate: undefined } });
  },
});

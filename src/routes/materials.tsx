import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogPage } from "@/components/CatalogPage";

const search = z.object({
  module: z.enum(["screed", "roofing", "roofing_pvc", "roofing_rub", "insulation", "demolition", "common"]).default("screed"),
});

export const Route = createFileRoute("/materials")({
  head: () => ({ meta: [
    { title: "Матеріали TERZI — каталог" },
    { name: "description", content: "Редагований каталог матеріалів TERZI для всіх напрямків калькулятора." },
    { property: "og:title", content: "Матеріали TERZI — каталог" },
    { property: "og:description", content: "Редагований каталог матеріалів TERZI для всіх напрямків калькулятора." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s) => search.parse(s),
  component: () => {
    const { module } = Route.useSearch();
    return <CatalogPage module={module} kind="material" />;
  },
});

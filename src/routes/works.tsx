import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogPage } from "@/components/CatalogPage";

const search = z.object({
  module: z.enum(["screed", "roofing", "insulation", "demolition", "common"]).default("screed"),
});

export const Route = createFileRoute("/works")({
  head: () => ({ meta: [
    { title: "Роботи TERZI — каталог" },
    { name: "description", content: "Редагований каталог робіт TERZI з цінами продажу і собівартістю для калькуляторів." },
    { property: "og:title", content: "Роботи TERZI — каталог" },
    { property: "og:description", content: "Редагований каталог робіт TERZI з цінами продажу і собівартістю для калькуляторів." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s) => search.parse(s),
  component: () => {
    const { module } = Route.useSearch();
    return <CatalogPage module={module} kind="work" />;
  },
});

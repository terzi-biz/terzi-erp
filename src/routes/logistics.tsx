import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogPage } from "@/components/CatalogPage";

const search = z.object({
  module: z.enum(["screed", "roofing", "roofing_pvc", "roofing_rub", "insulation", "demolition", "common"]).default("screed"),
});

export const Route = createFileRoute("/logistics")({
  validateSearch: (s) => search.parse(s),
  component: () => {
    const { module } = Route.useSearch();
    return <CatalogPage module={module} kind="logistics" />;
  },
});

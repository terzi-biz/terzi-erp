import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/ModuleStub";
export const Route = createFileRoute("/roofing")({ component: () => <ModuleStub title="Покрівля" desc="Плоска покрівля, ремонт, ПВХ-мембрана, рубероїд, утеплення, розуклонка." /> });

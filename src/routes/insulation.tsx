import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/ModuleStub";
export const Route = createFileRoute("/insulation")({ component: () => <ModuleStub title="Утеплення" desc="EPS, XPS, мінеральна вата, полістиролбетон. Окремий модуль + блок всередині стяжки/покрівлі." /> });

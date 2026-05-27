import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/ModuleStub";
export const Route = createFileRoute("/demolition")({ component: () => <ModuleStub title="Демонтаж" desc="Демонтаж стяжки, плитки, утеплювача, покрівлі, винесення сміття." /> });

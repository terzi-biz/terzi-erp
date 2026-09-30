import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Blocks, ListChecks, Workflow, BookOpen, XCircle } from "lucide-react";

export const Route = createFileRoute("/settings/processes")({
  component: ProcessesSettingsPage,
  head: () => ({ meta: [
    { title: "Воронки, задачі й автоматизації — TERZI ERP" },
    { name: "description", content: "Етапи воронок лідів, типи і пріоритети задач, правила автоматичного створення задач TERZI ERP." },
    { property: "og:title", content: "Воронки, задачі й автоматизації — TERZI ERP" },
    { property: "og:description", content: "Бізнес-процеси TERZI налаштовуються в інтерфейсі без змін коду." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

const ITEMS = [
  { to: "/crm/leads", label: "Воронки та етапи", description: "Додавання, перейменування, порядок і колір етапів — прямо в дошці воронки (кнопка налаштування етапів).", icon: Blocks },
  { to: "/settings/control-center", label: "Автоматизації та сповіщення", description: "Правила: подія → умова → дія (створити задачу, сповістити). Журнал виконання.", icon: Workflow },
  { to: "/settings/system", label: "Довідники (типи й пріоритети задач)", description: "Власні списки: типи задач, пріоритети, причини тощо — з версіями та архівом.", icon: BookOpen },
  { to: "/settings/company", label: "Причини закриття", description: "Причини відмови / закриття лідів і замовлень.", icon: XCircle },
  { to: "/crm/tasks", label: "Задачі", description: "Робочий список задач: відповідальний, дедлайн, пріоритет, статус.", icon: ListChecks },
] as const;

function ProcessesSettingsPage() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ITEMS.map((item) => (
        <Link key={item.to} to={item.to} className="panel p-4 flex items-start gap-3 hover:border-primary transition-colors">
          <item.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-bold text-sm flex items-center gap-1">{item.label} <ArrowRight className="w-3.5 h-3.5" /></div>
            <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

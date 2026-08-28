import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { CALC_STEPS } from "@/components/calc/CalcStepRail";
import { MODULE_KEYS, MODULE_LABEL } from "@/components/nav-model";
import { Layers, Home, Snowflake, Hammer, Calculator } from "lucide-react";

export const Route = createFileRoute("/calc/")({
  head: () => ({
    meta: [
      { title: "Розрахунки — TERZI ERP" },
      { name: "description", content: "Єдина оболонка калькулятора TERZI: стяжка, ПВХ мембрана, руберойд, утеплення, демонтаж." },
      { property: "og:title", content: "Розрахунки — TERZI ERP" },
      { property: "og:description", content: "Єдина оболонка калькулятора TERZI: стяжка, ПВХ мембрана, руберойд, утеплення, демонтаж." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalcIndex,
});

const ICON = {
  screed: Layers,
  roofing_pvc: Home,
  roofing_rub: Home,
  insulation: Snowflake,
  demolition: Hammer,
} as const;

const DESC: Record<string, string> = {
  screed: "Напівсуха машинна стяжка, марки М100–М300",
  roofing_pvc: "Sikaplan, армована мембрана 1,5 / 1,8 мм",
  roofing_rub: "Акваізол / Руберіт, 1–3 шари наплавлення",
  insulation: "EPS, XPS, PIR, мінвата, полістиролбетон",
  demolition: "Стяжка, покриття, покрівля, перегородки",
};

function CalcIndex() {
  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto space-y-8">
        <header className="border-b border-border pb-5">
          <div className="hatch-accent h-1 w-16 mb-3 rounded" />
          <h1 className="text-2xl font-black tracking-tight">Розрахунки</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Оберіть напрямок — далі відкривається однакова послідовність кроків із канонічним підсумком.
          </p>
        </header>

        <section>
          <h2 className="sr-only">Напрямки</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULE_KEYS.map((m) => {
              const Icon = ICON[m];
              return (
                <Link key={m} to={`/${m}`}
                  search={{ estimate: undefined }} className="panel p-6 hover:border-primary transition-colors group">
                  <Icon className="w-9 h-9 text-primary mb-3" />
                  <div className="font-black text-lg">{MODULE_LABEL[m]}</div>
                  <div className="text-xs text-muted-foreground mt-1">{DESC[m]}</div>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary">
                    <Calculator className="w-3.5 h-3.5" /> Відкрити
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Кроки розрахунку</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {CALC_STEPS.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className="text-primary font-bold w-5">{i + 1}.</span>
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/integrations")({
  component: IntegrationsSettingsPage,
  head: () => ({ meta: [
    { title: "Центр інтеграцій — налаштування TERZI ERP" },
    { name: "description", content: "Усі джерела лідів і даних TERZI: Binotel, Meta, Google, TikTok, OLX, сайти, месенджери, Finmap." },
    { property: "og:title", content: "Центр інтеграцій — налаштування TERZI ERP" },
    { property: "og:description", content: "Де і як підключається кожне джерело лідів, витрат і оплат TERZI ERP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

type Src = { name: string; what: string; to: "/integrations" | "/marketing/integrations" | "/crm/intake" | "/data-exchange"; where: string };

const GROUPS: { title: string; items: Src[] }[] = [
  { title: "Телефонія", items: [
    { name: "Binotel", what: "Дзвінки, записи розмов, автостворення ліда", to: "/integrations", where: "Інтеграції → Binotel" },
  ] },
  { title: "Рекламні кабінети", items: [
    { name: "Meta Ads (Facebook / Instagram)", what: "Витрати, кампанії, ліди з форм", to: "/marketing/integrations", where: "Маркетинг → Інтеграції" },
    { name: "Google Ads (Search, YouTube, PMax)", what: "Витрати, кліки, офлайн-конверсії", to: "/marketing/integrations", where: "Маркетинг → Інтеграції" },
    { name: "TikTok Ads", what: "Витрати і кампанії", to: "/integrations", where: "Інтеграції → Зовнішні джерела" },
  ] },
  { title: "Аналітика", items: [
    { name: "GA4 / GTM", what: "Трафік сайтів, передача gclid/UTM у форми", to: "/integrations", where: "Інтеграції → Зовнішні джерела" },
  ] },
  { title: "Майданчики", items: [
    { name: "OLX (кілька акаунтів)", what: "Повідомлення і заявки з оголошень", to: "/integrations", where: "Інтеграції → Зовнішні джерела" },
  ] },
  { title: "Месенджери", items: [
    { name: "Telegram / Viber / WhatsApp", what: "Вхідні повідомлення → контакт → лід", to: "/integrations", where: "Інтеграції → Зовнішні джерела" },
  ] },
  { title: "Фінанси та дані", items: [
    { name: "Finmap", what: "Фактичні оплати і витрати", to: "/integrations", where: "Інтеграції → Синхронізація" },
    { name: "Імпорт / експорт", what: "Файли CSV/Excel", to: "/data-exchange", where: "Обмін даними" },
  ] },
];

function IntegrationsSettingsPage() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const endpoint = `${origin}/api/public/leads/intake`;
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Скопійовано"); };

  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="text-xs uppercase tracking-widest text-primary font-bold mb-2">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((s) => (
              <Link key={s.name} to={s.to} className="panel p-4 hover:border-primary transition-colors">
                <div className="font-bold text-sm flex items-center gap-1">{s.name} <ArrowRight className="w-3.5 h-3.5" /></div>
                <p className="text-xs text-muted-foreground mt-1">{s.what}</p>
                <p className="text-[11px] text-muted-foreground mt-2">Налаштування: {s.where}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="panel p-4">
        <h2 className="text-xs uppercase tracking-widest text-primary font-bold mb-1">Сайти та лендінги (WordPress, Tilda, власні)</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Форма сайту надсилає POST на адресу нижче: name, phone, service, area, utm_*, gclid/fbclid/ttclid. Телефон нормалізується, дублі не створюються.
          Запит підписується заголовком x-terzi-signature (секрет видає адміністратор).
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate text-xs bg-muted rounded px-2 py-2">{endpoint}</code>
          <button onClick={() => copy(endpoint)} className="flex items-center gap-1 px-3 py-2 rounded bg-secondary text-xs font-semibold">
            <Copy className="w-3.5 h-3.5" /> Копіювати
          </button>
        </div>
        <Link to="/crm/intake" className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-3">
          Журнал вхідних заявок <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </section>
    </div>
  );
}

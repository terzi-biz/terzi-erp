import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "@/lib/store";
import headerImg from "@/assets/terzi-header.jpg";
import footerImg from "@/assets/terzi-footer.png";

export const Route = createFileRoute("/branding")({ component: BrandingPage });

function BrandingPage() {
  const { branding, updateBranding } = useAppStore();
  const inp = "w-full bg-input border border-border rounded px-3 py-2 text-sm";
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div><div className="hatch-accent h-1 w-16 mb-3 rounded" /><h1 className="text-3xl font-black">Брендинг</h1></div>

      <section className="panel p-5">
        <h2 className="font-bold text-sm uppercase tracking-wider mb-4 text-primary">Банери PDF</h2>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-xs text-muted-foreground mb-2">Хедер</div><img src={headerImg} alt="header" className="w-full rounded border border-border" /></div>
          <div><div className="text-xs text-muted-foreground mb-2">Футер</div><img src={footerImg} alt="footer" className="w-full rounded border border-border" /></div>
        </div>
      </section>

      <section className="panel p-5 space-y-3">
        <h2 className="font-bold text-sm uppercase tracking-wider mb-2 text-primary">Дані компанії</h2>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Компанія</span><input className={inp} value={branding.company} onChange={(e) => updateBranding({ company: e.target.value })} /></label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Слоган</span><input className={inp} value={branding.tagline} onChange={(e) => updateBranding({ tagline: e.target.value })} /></label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Сайт</span><input className={inp} value={branding.website} onChange={(e) => updateBranding({ website: e.target.value })} /></label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Адреса</span><input className={inp} value={branding.address} onChange={(e) => updateBranding({ address: e.target.value })} /></label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Години роботи</span><input className={inp} value={branding.workHours} onChange={(e) => updateBranding({ workHours: e.target.value })} /></label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Умови оплати</span><textarea className={inp} rows={2} value={branding.paymentTerms} onChange={(e) => updateBranding({ paymentTerms: e.target.value })} /></label>
        <label className="block"><span className="text-xs uppercase text-muted-foreground">Гарантія</span><textarea className={inp} rows={2} value={branding.warrantyText} onChange={(e) => updateBranding({ warrantyText: e.target.value })} /></label>
      </section>
    </div>
  );
}

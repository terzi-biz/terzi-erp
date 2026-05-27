import { Construction } from "lucide-react";

export function ModuleStub({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="hatch-accent h-1 w-16 mb-3 rounded" />
      <h1 className="text-3xl font-black tracking-tight mb-2">{title}</h1>
      <p className="text-muted-foreground mb-8">{desc}</p>
      <div className="panel p-10 text-center">
        <Construction className="w-12 h-12 text-primary mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Модуль у розробці</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Архітектура готова: матеріали, роботи, логістика, кошторис, історія, варіанти, PDF, брендинг — за тим самим патерном, що й «Стяжка».
          Розрахункова логіка додається наступною ітерацією.
        </p>
      </div>
    </div>
  );
}

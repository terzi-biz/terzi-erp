import { FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, ExternalLink, Loader2, Send, Sparkles } from "lucide-react";
import { askTerziAssistant } from "@/lib/ai-assistant.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

export function TerziAiAssistant() {
  const ask = useServerFn(askTerziAssistant);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await ask({ data: { question: question.trim(), from, to } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося отримати відповідь");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button
      type="button"
      size="icon"
      variant="gold"
      className="fixed bottom-5 right-4 z-40 h-12 w-12 rounded-full shadow-lg md:bottom-6 md:right-6"
      aria-label="Відкрити TERZI AI"
      title="TERZI AI"
      onClick={() => setOpen(true)}
    >
      <Sparkles className="h-5 w-5" />
    </Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border p-5 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />TERZI AI</SheetTitle>
          <SheetDescription>Звіти, інтеграції та показники з перевірених даних ERP.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">
          {result ? <div className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4 text-sm leading-6 whitespace-pre-wrap">{result.answer}</div>
            <div>
              <p className="mb-2 text-xs font-bold text-muted-foreground">Пов’язані дані</p>
              <div className="flex flex-wrap gap-2">{result.links.map((link: any) => <Button key={link.href} asChild variant="outline" size="sm"><Link to={link.href}><ExternalLink />{link.label}</Link></Button>)}</div>
            </div>
            <p className="text-[11px] text-muted-foreground">Період: {result.period.from} — {result.period.to} · Джерела: {result.sources.join(", ")}</p>
          </div> : <div className="grid min-h-64 place-items-center text-center text-sm text-muted-foreground"><div><Bot className="mx-auto mb-3 h-10 w-10 text-primary" /><p>Поставте запитання про воронку, задачі, дзвінки, маркетинг, операції чи стан інтеграцій.</p></div></div>}
          {error ? <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
        </div>
        <form onSubmit={submit} className="space-y-3 border-t border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">Від<input aria-label="Початок періоду AI" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" /></label>
            <label className="text-xs font-semibold">До<input aria-label="Кінець періоду AI" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2" /></label>
          </div>
          <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} placeholder="Наприклад: де втрачаємо найбільше лідів цього місяця?" className="min-h-24 resize-none" />
          <Button type="submit" className="w-full" disabled={busy || question.trim().length < 3}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Запитати</Button>
        </form>
      </SheetContent>
    </Sheet>
  </>;
}
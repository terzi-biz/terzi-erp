import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ExternalLink, History, Loader2, Plus, Send } from "lucide-react";
import {
  askTerziAssistant, getAiConversation, listAiConversations, type AssistantLink,
} from "@/lib/ai-assistant.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
type Msg = { id: string; role: string; content: string; links: AssistantLink[] };

export function TerziAiAssistant() {
  const ask = useServerFn(askTerziAssistant);
  const listFn = useServerFn(listAiConversations);
  const getFn = useServerFn(getAiConversation);
  const qc = useQueryClient();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [question, setQuestion] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ["ai-conversations"], queryFn: () => listFn(), enabled: open,
  });

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);
  useEffect(() => { if (open && !busy) setTimeout(() => inputRef.current?.focus(), 50); }, [open, busy, conversationId]);

  async function openConversation(id: string) {
    setShowHistory(false);
    setError(null);
    setConversationId(id);
    const rows = await getFn({ data: { id } });
    setMessages(rows.map((r) => ({ id: r.id, role: r.role, content: r.content, links: r.links })));
  }

  function newChat() { setConversationId(null); setMessages([]); setError(null); setShowHistory(false); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setQuestion("");
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: q, links: [] }]);
    try {
      const res = await ask({ data: { question: q, from, to, conversationId, contextPath: loc.pathname } });
      setConversationId(res.conversationId);
      setMessages((m) => [...m, {
        id: `a-${Date.now()}`, role: "assistant",
        content: `${res.answer}\n\nПеріод: ${res.period.from} — ${res.period.to} · Джерела: ${res.sources.join(", ") || "—"}`,
        links: res.links,
      }]);
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не вдалося отримати відповідь");
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button type="button" size="icon" variant="gold"
      className="fixed bottom-5 right-4 z-40 h-12 w-12 rounded-full shadow-lg md:bottom-6 md:right-6"
      aria-label="Відкрити TZI AI" title="TZI AI" onClick={() => setOpen(true)}>
      <Bot className="h-5 w-5" />
    </Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border p-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />TZI AI</SheetTitle>
          <SheetDescription>Відповіді лише з даних ERP, дозволених вашій ролі.</SheetDescription>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={newChat}><Plus />Нова</Button>
            <Button size="sm" variant={showHistory ? "secondary" : "outline"} onClick={() => setShowHistory((v) => !v)}><History />Історія</Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {showHistory ? <div className="space-y-1">
            {conversations.length ? conversations.map((c) => (
              <button key={c.id} onClick={() => openConversation(c.id)}
                className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${c.id === conversationId ? "bg-muted font-semibold" : ""}`}>
                {c.title}
                <span className="block text-[11px] text-muted-foreground">{new Date(c.updated_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })}</span>
              </button>
            )) : <p className="text-sm text-muted-foreground">Ще немає розмов.</p>}
          </div> : messages.length ? <div className="space-y-4">
            {messages.map((m) => m.role === "user"
              ? <div key={m.id} className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">{m.content}</div>
              : <div key={m.id} className="space-y-2">
                  <div className="text-sm leading-6 whitespace-pre-wrap text-foreground">{m.content}</div>
                  {m.links.length ? <div className="flex flex-wrap gap-2">{m.links.map((l) => <Button key={l.href} asChild variant="outline" size="sm"><Link to={l.href}><ExternalLink />{l.label}</Link></Button>)}</div> : null}
                </div>)}
            {busy ? <p className="animate-pulse text-sm text-muted-foreground">Аналізую дані ERP…</p> : null}
            <div ref={endRef} />
          </div> : <div className="grid min-h-64 place-items-center text-center text-sm text-muted-foreground"><div><Bot className="mx-auto mb-3 h-10 w-10 text-primary" /><p>Запитайте про воронку, задачі, дзвінки, маркетинг, операції чи інтеграції.</p></div></div>}
          {error ? <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
        </div>
        <form onSubmit={submit} className="space-y-2 border-t border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">Від<input aria-label="Початок періоду AI" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2" /></label>
            <label className="text-xs font-semibold">До<input aria-label="Кінець періоду AI" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2" /></label>
          </div>
          <div className="flex items-end gap-2">
            <Textarea ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(e); } }}
              maxLength={1200} placeholder="Наприклад: де втрачаємо найбільше лідів цього місяця?" className="min-h-16 resize-none" />
            <Button type="submit" size="icon" aria-label="Запитати" disabled={busy || question.trim().length < 3}>{busy ? <Loader2 className="animate-spin" /> : <Send />}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  </>;
}

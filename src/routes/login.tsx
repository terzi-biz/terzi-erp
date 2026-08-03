import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Eye, EyeOff, FileCheck2, Handshake, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import heroAsset from "@/assets/terzi-hero.jpeg.asset.json";
import { TerziLogo } from "@/components/TerziLogo";

function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s.next) }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Вхід у ERP систему TERZI" },
      { name: "description", content: "Вхід у ERP систему TERZI: кошториси, заміри, об'єкти, бригади та комунікації в єдиній системі." },
      { property: "og:title", content: "Вхід у ERP систему TERZI" },
      { property: "og:description", content: "Один підрядник. Одна відповідальність. Готовий результат." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const BADGES = [
  { icon: FileCheck2, title: "ОФІЦІЙНИЙ ДОГОВІР", text: "Прозорі умови співпраці та фіксовані ціни" },
  { icon: ShieldCheck, title: "ГАРАНТІЯ ДО 10 РОКІВ", text: "На виконані роботи та матеріали" },
  { icon: Building2, title: "4 000+ ОБ'ЄКТІВ", text: "Успішно реалізованих об'єктів" },
];

function LoginPage() {
  const nav = useNavigate();
  const router = useRouter();
  const { user, loading, accessAllowed, approvalStatus, signOut } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { next } = Route.useSearch();

  function goNext() {
    if (next) window.location.href = next;
    else nav({ to: "/" });
  }

  useEffect(() => {
    if (!loading && user && accessAllowed) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, accessAllowed, next]);

  async function withProvider(p: "google" | "apple") {
    setErr(null); setBusy(true);
    const res = await lovable.auth.signInWithOAuth(p, {
      redirect_uri: next ? `${window.location.origin}${next}` : window.location.origin,
      extraParams: p === "google" ? { prompt: "select_account" } : undefined,
    });
    if (res.error) { setErr(res.error.message ?? "Помилка входу"); setBusy(false); return; }
    if (!res.redirected) {
      await router.invalidate();
      goNext();
      setBusy(false);
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const returnTo = next ? `${window.location.origin}${next}` : `${window.location.origin}/login`;
    const { error } = await (mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password: pwd })
      : supabase.auth.signUp({
          email,
          password: pwd,
          options: { emailRedirectTo: returnTo, data: { full_name: name } },
        }));
    setBusy(false);
    if (error) setErr(error.message);
    else {
      await router.invalidate();
      goNext();
    }
  }

  const blocked = user && !loading && !accessAllowed;
  const statusCard = blocked ? (
    <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 text-center shadow-2xl sm:p-8">
      <div className="mb-6 flex justify-center"><TerziLogo size={44} withText /></div>
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
        {approvalStatus === "rejected" ? "Доступ не підтверджено" : "Заявка на підтвердженні"}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {approvalStatus === "rejected"
          ? "Адміністратор відхилив доступ до ERP. Зверніться до керівника TERZI, якщо це помилка."
          : "Акаунт створено успішно. Адміністратор перевірить заявку та відкриє доступ до системи."}
      </p>
      <button onClick={() => signOut()} className="mt-6 w-full rounded-xl border border-border bg-background py-3 text-sm font-semibold transition-colors hover:bg-accent">
        Вийти з акаунта
      </button>
    </div>
  ) : null;

  const card = (
    <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 shadow-2xl sm:p-8">
      <div className="mb-6 flex justify-center">
        <TerziLogo size={44} withText />
      </div>
      <h1 className="mb-6 text-center text-2xl font-black tracking-tight sm:text-3xl">
        {mode === "signin" ? "Вхід у систему" : "Реєстрація"}
      </h1>

      <button
        onClick={() => withProvider("google")}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background py-3 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C40.7 35.5 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
        Увійти з Google акаунтом
      </button>

      <button
        onClick={() => withProvider("apple")}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background py-3 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.49-.12-1.17.461-2.36 1.15-3.12.768-.9 2.063-1.55 3.014-1.45zM21.5 17.04c-.547 1.26-.81 1.82-1.51 2.94-.97 1.55-2.34 3.48-4.03 3.49-1.5.01-1.89-.97-3.93-.96-2.04.01-2.46.97-3.96.96-1.69-.01-2.98-1.76-3.95-3.31C1.43 16.4.74 11.27 2.96 7.96c1.41-2.1 3.64-3.33 5.73-3.33 2.13 0 3.47 1.16 5.23 1.16 1.71 0 2.75-1.16 5.21-1.16 1.86 0 3.83 1.01 5.23 2.76-4.6 2.52-3.86 9.09-2.86 9.65z"/></svg>
        Увійти з Apple акаунтом
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> або email <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={withEmail} className="space-y-3">
        {mode === "signup" && (
          <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input type="text" placeholder="Ім'я та прізвище" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-sm outline-none" required />
          </label>
        )}
        <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent text-sm outline-none" required />
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input type={showPwd ? "text" : "password"} placeholder="Пароль" value={pwd} onChange={(e) => setPwd(e.target.value)}
            className="w-full bg-transparent text-sm outline-none" minLength={6} required />
          <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label="Показати пароль"
            className="text-muted-foreground transition-colors hover:text-foreground">
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </label>

        {err && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}

        <button type="submit" disabled={busy}
          className="w-full rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? "..." : mode === "signin" ? "Увійти" : "Створити акаунт"}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-muted-foreground">
        {mode === "signin" ? "Немає акаунту?" : "Вже є акаунт?"}{" "}
        <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }}
          className="font-semibold text-primary underline underline-offset-4">
          {mode === "signin" ? "Зареєструватись" : "Увійти"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <a href="https://terzi.biz" target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium transition-colors hover:bg-accent">
          <User className="h-4 w-4" /> Для замовника
        </a>
        <a href="https://terzi.biz" target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium transition-colors hover:bg-accent">
          <Handshake className="h-4 w-4" /> Партнерам
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-[1600px] items-center gap-8 px-4 py-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12 lg:px-10 lg:py-12">
        {/* Ліва частина — брендова заставка */}
        <section className="relative overflow-hidden rounded-2xl">
          <img src={heroAsset.url} alt="Житловий комплекс, зведений компанією TERZI"
            className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-background/70" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />

          <div className="relative p-6 sm:p-10">
            <TerziLogo size={48} withText />
            <div className="mt-8 text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
              ERP для будівельних компаній
            </div>
            <h2 className="mt-2 text-3xl font-black leading-tight tracking-tight sm:text-4xl xl:text-5xl">
              ERP система <span className="text-primary">TERZI</span>
            </h2>
            <div className="mt-3 text-xl font-black uppercase leading-snug tracking-tight sm:text-2xl">
              Один підрядник.<br />Одна відповідальність.<br />
              <span className="text-primary">Готовий результат.</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Керуйте кошторисами, замірами, об'єктами, бригадами та комунікаціями в єдиній системі.
              Прозорість процесів, контроль витрат і впевненість у кожному рішенні.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {BADGES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-border/60 bg-card/85 p-4 text-center backdrop-blur">
                  <Icon className="mx-auto h-7 w-7 text-primary" />
                  <div className="mt-2 text-[11px] font-bold tracking-wide">{title}</div>
                  <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{text}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>0 800 207 500</span>
              <span>office.terzi@gmail.com</span>
              <span className="font-semibold text-primary">www.terzi.biz</span>
            </div>
          </div>
        </section>

        {/* Права частина — форма входу */}
        <div className="flex justify-center">{statusCard ?? card}</div>
      </div>
    </div>
  );
}

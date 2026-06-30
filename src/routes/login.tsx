import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import heroAsset from "@/assets/terzi-hero.jpeg.asset.json";
import { TerziLogo } from "@/components/TerziLogo";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) nav({ to: "/" });
  }, [user, loading, nav]);

  async function withGoogle() {
    setErr(null); setBusy(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) { setErr(res.error.message ?? "Помилка входу"); setBusy(false); return; }
    if (!res.redirected) router.invalidate();
  }

  async function withApple() {
    setErr(null); setBusy(true);
    const res = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin });
    if (res.error) { setErr(res.error.message ?? "Помилка входу"); setBusy(false); return; }
    if (!res.redirected) router.invalidate();
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const fn = mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password: pwd })
      : supabase.auth.signUp({ email, password: pwd, options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: name },
        }});
    const { error } = await fn;
    setBusy(false);
    if (error) setErr(error.message);
    else router.invalidate();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      <div className="hidden lg:block relative overflow-hidden">
        <img src={heroAsset.url} alt="TERZI — Будівельна компанія" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-background/80" />
        <div className="absolute bottom-10 left-10 right-10">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3 drop-shadow-lg">TERZI · Будівельна компанія</div>
          <h2 className="text-3xl xl:text-4xl font-black leading-tight text-white drop-shadow-2xl">
            Створюємо простір для вашого життя та бізнесу.
          </h2>
          <div className="mt-6 text-sm text-white/90 space-y-1 drop-shadow-lg">
            <div>0 800 20 75 00 · +38 (063) 858 07 48</div>
            <div className="text-primary font-semibold">terzi.biz</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <TerziLogo size={56} />
            <div>
              <div className="font-black text-xl tracking-tight leading-none">TERZI</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Будівельна компанія</div>
            </div>
          </div>

          <h1 className="text-2xl font-black mb-1">{mode === "signin" ? "Вхід у систему" : "Реєстрація"}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin" ? "Увійдіть, щоб продовжити роботу з кошторисами." : "Створіть акаунт менеджера TERZI."}
          </p>

          <button
            onClick={withGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 bg-card hover:bg-accent border border-border rounded-md py-3 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C40.7 35.5 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
            Продовжити з Google
          </button>

          <button
            onClick={withApple}
            disabled={busy}
            className="w-full mt-3 flex items-center justify-center gap-3 bg-foreground text-background hover:opacity-90 border border-border rounded-md py-3 text-sm font-semibold transition-opacity disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.49-.12-1.17.461-2.36 1.15-3.12.768-.9 2.063-1.55 3.014-1.45zM21.5 17.04c-.547 1.26-.81 1.82-1.51 2.94-.97 1.55-2.34 3.48-4.03 3.49-1.5.01-1.89-.97-3.93-.96-2.04.01-2.46.97-3.96.96-1.69-.01-2.98-1.76-3.95-3.31C1.43 16.4.74 11.27 2.96 7.96c1.41-2.1 3.64-3.33 5.73-3.33 2.13 0 3.47 1.16 5.23 1.16 1.71 0 2.75-1.16 5.21-1.16 1.86 0 3.83 1.01 5.23 2.76-4.6 2.52-3.86 9.09-2.86 9.65z"/></svg>
            Продовжити з Apple
          </button>

          <div className="flex items-center gap-3 my-6 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> або email <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={withEmail} className="space-y-3">
            {mode === "signup" && (
              <input type="text" placeholder="Ім'я та прізвище" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm" required />
            )}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm" required />
            <input type="password" placeholder="Пароль" value={pwd} onChange={(e) => setPwd(e.target.value)}
              className="w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm" minLength={6} required />

            {err && <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">{err}</div>}

            <button type="submit" disabled={busy}
              className="w-full bg-primary text-primary-foreground rounded-md py-3 text-sm font-bold hover:opacity-90 disabled:opacity-50">
              {busy ? "..." : mode === "signin" ? "Увійти" : "Створити акаунт"}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-muted-foreground">
            {mode === "signin" ? "Немає акаунту?" : "Вже є акаунт?"}{" "}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); }} className="text-primary font-semibold hover:underline">
              {mode === "signin" ? "Зареєструватися" : "Увійти"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { BrandVertical } from "@/components/brand/TerziBrand";

function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({ next: safeNext(s.next) || undefined }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Вхід у ERP систему TERZI" },
      { name: "description", content: "Вхід у ERP систему TERZI: кошториси, заміри, замовлення, бригади та комунікації в єдиній системі." },
      { property: "og:title", content: "Вхід у ERP систему TERZI" },
      { property: "og:description", content: "Один підрядник. Одна відповідальність. Готовий результат." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

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
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { next } = Route.useSearch();

  function goNext() {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("terzi:login-next") : null;
    if (typeof window !== "undefined") sessionStorage.removeItem("terzi:login-next");
    if (next || saved) window.location.href = next || saved || "/";
    else nav({ to: "/" });
  }

  useEffect(() => {
    if (!loading && user && accessAllowed) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, accessAllowed, next]);

  async function withGoogle() {
    setErr(null); setBusy(true);
    if (next) sessionStorage.setItem("terzi:login-next", next);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/login`,
      extraParams: { prompt: "select_account" },
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
    const { data, error } = await (mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password: pwd })
      : supabase.auth.signUp({
          email,
          password: pwd,
          options: { emailRedirectTo: returnTo, data: { full_name: name } },
        }));
    setBusy(false);
    if (error) setErr(error.message);
    else if (mode === "signup" && !data.session) {
      setNotice("Перевірте пошту та підтвердьте адресу. Після цього поверніться до входу.");
      setMode("signin");
    } else {
      await router.invalidate();
      goNext();
    }
  }

  const blocked = user && !loading && !accessAllowed;
  const statusCard = blocked ? (
    <div className="w-full rounded-xl border border-border bg-card p-6 text-center shadow-[0_12px_32px_-8px_rgb(11_27_58/0.14)] sm:p-8">
      <h1 className="font-display text-[22px] font-bold tracking-tight text-foreground">
        {approvalStatus === "rejected" ? "Доступ не підтверджено" : "Заявка на підтвердженні"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {approvalStatus === "rejected"
          ? "Адміністратор відхилив доступ до ERP. Зверніться до керівника TERZI, якщо це помилка."
          : "Акаунт створено успішно. Адміністратор перевірить заявку та відкриє доступ до системи."}
      </p>
      <button onClick={() => signOut()} className="mt-6 h-11 w-full rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-muted">
        Вийти з акаунта
      </button>
    </div>
  ) : null;

  const field = "flex h-12 items-center gap-3 rounded-lg border border-border bg-card px-3.5 transition-shadow focus-within:border-[var(--color-gold)] focus-within:shadow-[0_0_0_3px_rgb(212_150_10/0.18)]";

  const card = (
    <div className="w-full sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-8 sm:shadow-[0_12px_32px_-8px_rgb(11_27_58/0.14)]">
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[22px]">
        {mode === "signin" ? "Вхід до TERZI ERP" : "Заявка на доступ"}
      </h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground sm:text-sm">
        {mode === "signin" ? "Увійдіть, щоб продовжити роботу" : "Після реєстрації адміністратор підтвердить доступ"}
      </p>

      <form onSubmit={withEmail} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label htmlFor="login-name" className="mb-1.5 block text-sm font-medium text-foreground">Ім'я та прізвище</label>
            <div className={field}>
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input id="login-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-transparent text-[15px] outline-none" required />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
          <div className={field}>
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input id="login-email" type="email" autoComplete="email" placeholder="name@terzi.ua" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60" required />
          </div>
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-foreground">Пароль</label>
          <div className={field}>
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input id="login-password" type={showPwd ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={pwd} onChange={(e) => setPwd(e.target.value)} className="w-full bg-transparent text-[15px] outline-none" minLength={6} required />
            <button type="button" onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? "Сховати пароль" : "Показати пароль"}
              className="text-muted-foreground transition-colors hover:text-foreground">
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {err && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}
        {notice && <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}

        <button type="submit" disabled={busy} className="tz-btn-gold h-12 w-full text-[15px] sm:h-11">
          {busy ? "…" : mode === "signin" ? "Увійти" : "Надіслати заявку"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> або <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={withGoogle}
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-border bg-card text-[15px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:h-11 sm:text-sm"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C40.7 35.5 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
        Увійти через Google
      </button>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <LoginWaves />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[440px] flex-col px-6 pb-8 pt-10 sm:max-w-[400px] sm:justify-center sm:px-0 sm:py-10">
        <div className="mb-7 flex justify-center sm:mb-6">
          <BrandVertical width={168} className="w-[150px] sm:w-[168px]" />
        </div>
        {statusCard ?? card}
        {!blocked ? (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Немає доступу?" : "Вже маєте акаунт?"}{" "}
            <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); setNotice(null); }}
              className="font-semibold text-foreground underline underline-offset-4">
              {mode === "signin" ? "Подати заявку" : "Увійти"}
            </button>
          </p>
        ) : null}
      </div>
      <div className="absolute bottom-5 left-6 z-10 hidden text-xs text-muted-foreground sm:block">
        © {new Date().getFullYear()} TERZI · Будівельна компанія
      </div>
    </div>
  );
}

/** Декоративні хвилі — лише на екрані входу. */
function LoginWaves() {
  return (
    <>
      <svg className="tz-login-wave -left-24 -top-10 h-[240px] w-[720px] opacity-90 max-sm:h-[140px] max-sm:w-[420px]" viewBox="0 0 720 240" fill="none" aria-hidden>
        <path d="M0 200 C 160 120, 360 40, 720 0 L 720 -10 L 0 -10 Z" fill="#E9ECF3" />
        <path d="M0 214 C 170 130, 380 50, 720 14" stroke="#EAD9B0" strokeWidth="22" strokeLinecap="round" opacity=".8" />
      </svg>
      <svg className="tz-login-wave -bottom-2 -right-2 h-[460px] w-[600px] max-md:h-[200px] max-md:w-[260px]" viewBox="0 0 600 460" fill="none" preserveAspectRatio="xMaxYMax meet" aria-hidden>
        <path d="M600 60 C 470 210, 300 350, 30 460 L 600 460 Z" fill="#0B1B3A" />
        <path d="M600 180 C 480 300, 340 390, 150 460" stroke="#D4960A" strokeWidth="26" />
        <path d="M600 230 C 500 330, 380 405, 240 460 L 600 460 Z" fill="#12306A" />
      </svg>
    </>
  );
}

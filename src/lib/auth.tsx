import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "director" | "manager" | "finance";

interface Profile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, profile: null, roles: [], loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadUserData(s.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadUserData(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Тримаємо сесію живою: після сну пристрою / повернення онлайн оновлюємо токен,
  // щоб користувача не викидало з системи.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let busy = false;
    const revive = async () => {
      if (busy || document.visibilityState === "hidden" || !navigator.onLine) return;
      busy = true;
      try {
        const { data } = await supabase.auth.getSession();
        const exp = data.session?.expires_at ?? 0;
        // оновлюємо завчасно (за 5 хв до закінчення) або якщо вже прострочено
        if (data.session && exp * 1000 - Date.now() < 5 * 60 * 1000) {
          await supabase.auth.refreshSession();
        }
      } catch {
        /* офлайн — залишаємо поточну сесію, вихід не робимо */
      } finally {
        busy = false;
      }
    };
    document.addEventListener("visibilitychange", revive);
    window.addEventListener("online", revive);
    window.addEventListener("focus", revive);
    const t = window.setInterval(revive, 10 * 60 * 1000);
    revive();
    return () => {
      document.removeEventListener("visibilitychange", revive);
      window.removeEventListener("online", revive);
      window.removeEventListener("focus", revive);
      window.clearInterval(t);
    };
  }, []);

  async function loadUserData(uid: string) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("user_id, email, display_name, avatar_url").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(p ?? null);
    setRoles((r ?? []).map((x: { role: AppRole }) => x.role));
  }

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null, session, profile, roles, loading,
      // scope: "local" — виходимо лише на цьому пристрої, інші сесії лишаються активними
      signOut: async () => { await supabase.auth.signOut({ scope: "local" }); },
    }}>
      {children}
    </Ctx.Provider>
  );
}


export const useAuth = () => useContext(Ctx);

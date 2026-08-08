import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "director" | "manager" | "finance";
export type RegistrationStatus = "pending" | "approved" | "rejected";

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
  approvalStatus: RegistrationStatus | null;
  accessAllowed: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, profile: null, roles: [], approvalStatus: null, accessAllowed: false, loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [approvalStatus, setApprovalStatus] = useState<RegistrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedUidRef = useRef<string | null>(null);


  useEffect(() => {
    let active = true;
    const clearUserData = () => {
      setProfile(null);
      setRoles([]);
      setApprovalStatus(null);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return;
      setSession(s);
      if (s?.user) {
        // Повторний вхід того самого користувача (оновлення токена, повернення
        // на вкладку) не має перезавантажувати профіль і показувати «Завантаження…»,
        // інакше сторінка перемонтовується і введені дані губляться.
        if (loadedUidRef.current === s.user.id) return;
        loadedUidRef.current = s.user.id;
        setLoading(true);
        setTimeout(() => {
          if (!active) return;
          loadUserData(s.user.id).finally(() => {
            if (active) setLoading(false);
          });
        }, 0);
      } else {
        loadedUidRef.current = null;
        clearUserData();
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        loadedUidRef.current = data.session.user.id;
        await loadUserData(data.session.user.id);
      } else clearUserData();
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
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
    const [{ data: p }, { data: r }, { data: approval }] = await Promise.all([
      supabase.from("profiles").select("user_id, email, display_name, avatar_url").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("registration_approvals").select("status").eq("user_id", uid).maybeSingle(),
    ]);
    const nextRoles = (r ?? []).map((x: { role: AppRole }) => x.role);
    setProfile(p ?? null);
    setRoles(nextRoles);
    setApprovalStatus((approval?.status as RegistrationStatus | undefined) ?? (nextRoles.length ? "approved" : "pending"));
  }

  const accessAllowed = Boolean(session?.user)
    && approvalStatus !== "rejected"
    && (approvalStatus === "approved" || roles.length > 0);

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null, session, profile, roles, approvalStatus, accessAllowed, loading,
      // scope: "local" — виходимо лише на цьому пристрої, інші сесії лишаються активними
      signOut: async () => { await supabase.auth.signOut({ scope: "local" }); },
    }}>
      {children}
    </Ctx.Provider>
  );
}


export const useAuth = () => useContext(Ctx);

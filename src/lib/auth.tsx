import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "./labels";

type AuthState = {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  physioId: string | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isPhysio: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [physioId, setPhysioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMeta(userId: string | undefined) {
    if (!userId) {
      setRoles([]);
      setPhysioId(null);
      return;
    }
    const [rolesRes, physioRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("physiotherapists").select("id").eq("user_id", userId).maybeSingle(),
    ]);
    setRoles((rolesRes.data ?? []).map((r) => r.role as AppRole));
    setPhysioId(physioRes.data?.id ?? null);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setTimeout(() => {
        void loadMeta(next?.user?.id).finally(() => setLoading(false));
      }, 0);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadMeta(data.session?.user?.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    roles,
    physioId,
    loading,
    isAdmin: roles.includes("ADMIN") || roles.includes("SUPER_ADMIN"),
    isSuperAdmin: roles.includes("SUPER_ADMIN"),
    isPhysio: roles.includes("PHYSIOTHERAPIST"),
    refresh: async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      await loadMeta(data.session?.user?.id);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setRoles([]);
      setPhysioId(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth duhet përdorur brenda AuthProvider");
  return ctx;
}
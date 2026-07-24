import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppRole, User } from "@/lib/domain/types";
import * as session from "@/lib/auth/session";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string, phone: string, documentNumber: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const u = await session.fetchMe();
    setUser(u);
  }, []);

  // Arranque: restaura sesión desde la cookie de refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await session.tryRestore();
      if (cancelled) return;
      setUser(restored);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mantén el usuario fresco: al volver a la pestaña y cada 60s (visible).
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const fresh = await session.fetchMe();
      if (fresh) setUser(fresh);
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") tick();
    };
    timer = setInterval(tick, 60_000);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      hasRole: (role) => !!user?.roles.includes(role),
      async signIn(email, password) {
        setUser(await session.signIn(email, password));
      },
      async signUp(fullName, email, password, phone, documentNumber) {
        setUser(await session.signUp(fullName, email, password, phone, documentNumber));
      },
      async signInWithGoogle() {
        session.signInWithGoogle();
      },
      async signOut() {
        await session.signOut();
        setUser(null);
      },
      refresh,
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Snapshot síncrono para checks fuera de React (redirects). */
export function getAuthSnapshot(): { user: User | null; isAuthenticated: boolean } {
  const user = session.getSessionSnapshot();
  return { user, isAuthenticated: !!user };
}

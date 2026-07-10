import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authService, tryRestoreSession, reloadCurrentUser } from "@/lib/domain/auth";
import { hydrateFromBackend } from "@/lib/api/bootstrap";
import type { AppRole, User } from "@/lib/domain/types";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setUser(reloadCurrentUser());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Si hay refresh-cookie del backend, restaura la sesión en memoria.
      const restored = await tryRestoreSession();
      if (cancelled) return;
      setUser(restored ?? authService.getCurrentUser());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Mantén el cache en memoria fresco contra el backend:
  //  - cuando la pestaña vuelve a estar visible
  //  - cada 60s mientras la pestaña esté visible
  // Así las mutaciones hechas desde otra pestaña / otro usuario / cron
  // se reflejan sin necesidad de re-login.
  useEffect(() => {
    if (!user) return;
    const role = user.roles[0] ?? "student";
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const fresh = await hydrateFromBackend(role);
      if (fresh) setUser(fresh);
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") tick();
    };
    timer = setInterval(tick, 60_000);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [user?.id, user?.roles.join(",")]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      hasRole: (role) => !!user?.roles.includes(role),
      async signIn(email, password) {
        const r = await authService.signIn({ email, password });
        setUser(r.user);
      },
      async signUp(fullName, email, password) {
        const r = await authService.signUp({ fullName, email, password });
        setUser(r.user);
      },
      async signInWithGoogle() {
        const r = await authService.signInWithProvider("google");
        setUser(r.user);
      },
      async signOut() {
        await authService.signOut();
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

/** Snapshot síncrono para `beforeLoad` / SSR-safe checks. */
export function getAuthSnapshot(): { user: User | null; isAuthenticated: boolean } {
  const user = authService.getCurrentUser();
  return { user, isAuthenticated: !!user };
}
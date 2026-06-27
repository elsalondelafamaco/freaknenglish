import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authService } from "@/lib/domain/auth";
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
    setUser(authService.getCurrentUser());
  }, []);

  useEffect(() => {
    refresh();
    setLoading(false);
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith("freakn.")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

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
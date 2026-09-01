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
import { usersApi } from "@/lib/api/endpoints";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  /** true cuando el backend no respondió al restaurar la sesión (caído / sin red). */
  backendDown: boolean;
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
  const [backendDown, setBackendDown] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const u = await session.fetchMe();
      setUser(u);
      setBackendDown(false);
    } catch {
      setBackendDown(true);
    }
  }, []);

  // Captura de zona horaria, una sola vez por cuenta.
  //
  // Es lo que arregla a los alumnos que YA existen: nadie se vuelve a
  // registrar, así que sin esto la funcionalidad solo serviría para los que
  // lleguen a partir de ahora — y los que tienen el problema son los de ahora.
  //
  // Solo cuando está vacía: si se sobreescribiera en cada carga, una alumna de
  // viaje en Miami quedaría anclada a Miami para siempre. A partir de aquí solo
  // se cambia a mano, desde Configuración o desde el panel.
  useEffect(() => {
    if (!user || user.timezone) return;
    let zona: string | undefined;
    try {
      zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zona) return;
    usersApi
      .updateMe({ timezone: zona })
      .then(() => refresh())
      .catch(() => null);
  }, [user, refresh]);
  // Arranque: restaura sesión desde la cookie de refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await session.tryRestore();
        if (cancelled) return;
        setUser(restored);
      } catch {
        // Backend caído: no sabemos si hay sesión. La UI autenticada muestra
        // la pantalla de error en vez de expulsar al usuario a /login.
        if (cancelled) return;
        setBackendDown(true);
      }
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
      try {
        const fresh = await session.fetchMe();
        if (fresh) setUser(fresh);
        setBackendDown(false);
      } catch {
        setBackendDown(true);
      }
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
      backendDown,
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
    [user, loading, backendDown, refresh],
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

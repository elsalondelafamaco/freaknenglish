/**
 * AuthService — ahora conectado al backend NestJS.
 *
 * Mantenemos la misma interfaz pública (`signIn`, `signUp`, `getCurrentUser`,
 * etc.) para no tocar las 20+ rutas que ya la consumen. Internamente:
 *   - Llama al backend (`/auth/*`).
 *   - El access token vive en memoria (`@/lib/api/client`).
 *   - El refresh token es cookie httpOnly seteada por el backend.
 *   - El "current user" se cachea en memoria + `readDb()` para que las
 *     llamadas síncronas (`getCurrentUser`) sigan funcionando.
 *
 * Migración: este archivo desaparece cuando todas las rutas usen `useAuth()`
 * y `useQuery` directo. La implementación anterior (mock localStorage) queda
 * preservada en git.
 */

import type { AuthResult, Provider, Session, User } from "./types";
import { readDb, writeDb } from "./repository";
import { authApi, usersApi } from "@/lib/api/endpoints";
import { setAccessToken, getAccessToken, API_URL } from "@/lib/api/client";
void getAccessToken;
import { hydrateFromBackend, clearLocalState } from "@/lib/api/bootstrap";

const SESSION_KEY = "freakn.session.v1";

export interface AuthService {
  signUp(input: SignUpInput): Promise<AuthResult>;
  signIn(input: SignInInput): Promise<AuthResult>;
  signInWithProvider(provider: Provider): Promise<AuthResult>;
  signOut(): Promise<void>;
  getCurrentSession(): Session | null;
  getCurrentUser(): User | null;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
}
export interface SignInInput {
  email: string;
  password: string;
}
/* ───────── Cache de usuario en memoria (espejo de readDb) ───────── */

const ME_KEY = "freakn.me.v2";
let currentUserId: string | null = null;

function persistMeId(id: string | null) {
  currentUserId = id;
  if (typeof localStorage === "undefined") return;
  if (id) localStorage.setItem(ME_KEY, id);
  else localStorage.removeItem(ME_KEY);
}

function loadMeId(): string | null {
  if (currentUserId) return currentUserId;
  if (typeof localStorage === "undefined") return null;
  currentUserId = localStorage.getItem(ME_KEY);
  return currentUserId;
}

function getUserById(id: string): User | null {
  const db = readDb();
  return ((db.users as Record<string, User>)[id] as User) ?? null;
}

function fakeSession(userId: string): Session {
  return {
    userId,
    token: getAccessToken() ?? "session",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Implementación real conectada al backend NestJS.
 * Mantiene firmas idénticas al mock anterior.
 */
class BackendAuthService implements AuthService {
  async signUp({ fullName, email, password }: SignUpInput) {
    const r = await authApi.signup({ fullName, email, password });
    setAccessToken(r.accessToken);
    return finishLogin();
  }

  async signIn({ email, password }: SignInInput) {
    const r = await authApi.login(email, password);
    setAccessToken(r.accessToken);
    return finishLogin();
  }

  async signInWithProvider(provider: Provider) {
    if (typeof window === "undefined") throw new Error("Window required");
    if (provider !== "google") throw new Error(`Provider ${provider} not supported`);
    // Redirige al backend, que tras la callback de Google nos manda a
    // /auth/callback?accessToken=... en el storefront.
    window.location.href = `${API_URL}/auth/google`;
    // Esta promesa nunca resuelve, la página navega.
    return new Promise<AuthResult>(() => {});
  }

  async signOut() {
    try { await authApi.logout(); } catch { /* ignore */ }
    setAccessToken(null);
    persistMeId(null);
    clearLocalState();
  }

  getCurrentSession(): Session | null {
    const id = loadMeId();
    return id ? fakeSession(id) : null;
  }

  getCurrentUser(): User | null {
    const id = loadMeId();
    return id ? getUserById(id) : null;
  }

  async requestPasswordReset(email: string) {
    await authApi.forgot(email);
  }

  async resetPassword(token: string, newPassword: string) {
    await authApi.reset(token, newPassword);
  }
}

/**
 * Llamado tras login/signup/refresh: pide `/me`, hidrata `readDb` y devuelve
 * el AuthResult compatible con el shape antiguo.
 */
async function finishLogin(): Promise<AuthResult> {
  const me = (await usersApi.me()) as any;
  const role = me?.role ?? "student";
  const user = (await hydrateFromBackend(role)) ?? {
    id: me.id,
    email: me.email,
    fullName: me.fullName,
    avatarUrl: me.avatarUrl ?? undefined,
    roles: [role],
    level: me.englishLevel ?? undefined,
    createdAt: me.createdAt,
  };
  persistMeId(user.id);
  writeDb((db) => {
    (db.users as Record<string, User>)[user.id] = user;
  });
  return { user, session: fakeSession(user.id) };
}

/**
 * Intenta refrescar la sesión usando la cookie httpOnly. Llamado por el
 * AuthProvider al montar.
 */
export async function tryRestoreSession(): Promise<User | null> {
  try {
    const r = await authApi.refresh();
    setAccessToken(r.accessToken);
    const { user } = await finishLogin();
    return user;
  } catch {
    persistMeId(null);
    setAccessToken(null);
    return null;
  }
}

/** Permite a la callback de Google completar el login con un accessToken. */
export async function finishOAuthLogin(accessToken: string): Promise<User> {
  setAccessToken(accessToken);
  const { user } = await finishLogin();
  return user;
}

export const authService: AuthService = new BackendAuthService();
/**
 * Capa de sesión real contra el backend Nest. Reemplaza al wrapper mock
 * `lib/domain/auth`. Sin localStorage ni store espejo: el access token vive
 * en memoria (client.ts) y el refresh token en cookie httpOnly.
 */
import type { AppRole, EnglishLevel, User } from "@/lib/domain/types";
import { authApi, usersApi } from "@/lib/api/endpoints";
import { setAccessToken, API_URL } from "@/lib/api/client";

/** Mapea el usuario del backend (Prisma) al shape del storefront. */
export function mapUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl ?? undefined,
    phone: u.phone ?? undefined,
    documentNumber: u.documentNumber ?? undefined,
    roles: [u.role] as AppRole[],
    level: (u.englishLevel ?? undefined) as EnglishLevel | undefined,
    onboardedAt: u.emailVerifiedAt ?? undefined,
    assignedTeacherId: u.assignedTeacherId ?? undefined,
    schedulePreferences: Array.isArray(u.schedulePreferences) ? u.schedulePreferences : undefined,
    scheduleAssignmentStatus: u.scheduleAssignmentStatus ?? undefined,
  };
}

// Snapshot síncrono para checks fuera de React (redirects post-login).
let snapshot: User | null = null;
export function getSessionSnapshot(): User | null {
  return snapshot;
}

export async function fetchMe(): Promise<User | null> {
  try {
    const me = await usersApi.me();
    snapshot = mapUser(me);
    return snapshot;
  } catch {
    snapshot = null;
    return null;
  }
}

/** Restaura sesión desde la cookie de refresh (arranque de la app). */
export async function tryRestore(): Promise<User | null> {
  try {
    const r = await authApi.refresh();
    setAccessToken(r.accessToken);
  } catch {
    snapshot = null;
    return null;
  }
  return fetchMe();
}

export async function signIn(email: string, password: string): Promise<User> {
  const r = await authApi.login(email, password);
  setAccessToken(r.accessToken);
  const u = await fetchMe();
  if (!u) throw new Error("No se pudo cargar el perfil.");
  return u;
}

export async function signUp(
  fullName: string,
  email: string,
  password: string,
  phone: string,
  documentNumber: string,
): Promise<User> {
  const r = await authApi.signup({ fullName, email, password, phone, documentNumber });
  setAccessToken(r.accessToken);
  const u = await fetchMe();
  if (!u) throw new Error("No se pudo cargar el perfil.");
  return u;
}

export function signInWithGoogle(): void {
  window.location.href = `${API_URL}/auth/google`;
}

/** Completa el login OAuth con el accessToken devuelto por el backend. */
export async function finishOAuthLogin(accessToken: string): Promise<User> {
  setAccessToken(accessToken);
  const u = await fetchMe();
  if (!u) throw new Error("callback_failed");
  return u;
}

export async function signOut(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    /* ignore */
  }
  setAccessToken(null);
  snapshot = null;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authApi.forgot(email);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await authApi.reset(token, password);
}

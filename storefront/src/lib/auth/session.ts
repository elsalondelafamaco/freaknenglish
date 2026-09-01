/**
 * Capa de sesión real contra el backend Nest. Reemplaza al wrapper mock
 * `lib/domain/auth`. Sin localStorage ni store espejo: el access token vive
 * en memoria (client.ts) y el refresh token en cookie httpOnly.
 */
import type { AppRole, EnglishLevel, User } from "@/lib/domain/types";
import { authApi, usersApi } from "@/lib/api/endpoints";
import { ApiError, setAccessToken, API_URL } from "@/lib/api/client";

/** Error de infraestructura (backend caído / sin red / 5xx), NO de sesión. */
export class BackendUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("No pudimos conectar con el servidor. Intenta de nuevo en unos segundos.");
    this.cause = cause;
  }
}

/**
 * ¿El fallo es del servidor/red (y no un simple "no hay sesión")?
 * - `fetch` que no llega al servidor lanza TypeError.
 * - 401 (y 403 de cuenta bloqueada) = la sesión NO sirve. Sólo eso.
 * - Todo lo demás —5xx, 429, timeouts— es infraestructura.
 *
 * La distinción decide entre "muestra el error" y "expulsa al login". Antes la
 * regla era `status >= 500`, así que el 429 del limitador de peticiones caía
 * del lado de "sesión inválida": al arrancar la app `tryRestore` devolvía
 * null, el usuario quedaba en null y el guard mandaba a iniciar sesión otra
 * vez. Un límite de tráfico nunca significa que la sesión se acabó.
 */
export function isBackendUnavailable(e: unknown): boolean {
  if (e instanceof BackendUnavailableError) return true;
  if (e instanceof ApiError) return e.status !== 401 && e.status !== 403;
  return true;
}

/** Mapea el usuario del backend (Prisma) al shape del storefront. */
export function mapUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl ?? undefined,
    phone: u.phone ?? undefined,
    documentNumber: u.documentNumber ?? undefined,
    meetingUrl: u.meetingUrl ?? undefined,
    timezone: u.timezone ?? undefined,
    // Multi-rol: rol principal + extras. Un admin con `extraRoles: ["teacher"]`
    // ve además los módulos de profesor, sin necesidad de una segunda cuenta.
    roles: [...new Set<AppRole>([u.role, ...(u.extraRoles ?? [])])],
    level: (u.englishLevel ?? undefined) as EnglishLevel | undefined,
    onboardedAt: u.emailVerifiedAt ?? undefined,
    assignedTeacherId: u.assignedTeacherId ?? undefined,
    schedulePreferences: Array.isArray(u.schedulePreferences) ? u.schedulePreferences : undefined,
    scheduleAssignmentStatus: u.scheduleAssignmentStatus ?? undefined,
    createdAt: u.createdAt ?? new Date().toISOString(),
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
  } catch (e) {
    snapshot = null;
    // Backend caído ≠ "no hay sesión": deja que el caller muestre la UI de error.
    if (isBackendUnavailable(e)) throw new BackendUnavailableError(e);
    return null;
  }
}

/** Restaura sesión desde la cookie de refresh (arranque de la app). */
export async function tryRestore(): Promise<User | null> {
  try {
    const r = await authApi.refresh();
    setAccessToken(r.accessToken);
  } catch (e) {
    snapshot = null;
    if (isBackendUnavailable(e)) throw new BackendUnavailableError(e);
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

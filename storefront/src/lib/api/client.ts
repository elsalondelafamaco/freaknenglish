/**
 * HTTP client tipado para hablar con el backend NestJS.
 *
 * - Base URL desde `VITE_API_URL` (default: http://localhost:3000/api/v1)
 * - Adjunta `Authorization: Bearer <access>` automáticamente.
 * - El refresh token vive en cookie httpOnly seteada por el backend
 *   (`credentials: "include"`), así que el browser nunca lo manipula.
 * - Al recibir 401, hace un único refresh en cola y reintenta requests.
 *
 * Migración a Next.js: este archivo se copia tal cual; solo cambia el
 * lector de env (`process.env.NEXT_PUBLIC_API_URL`).
 */

const API_URL =
  (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3000/api/v1";

let accessToken: string | null = null;
const listeners = new Set<(t: string | null) => void>();

export function setAccessToken(t: string | null) {
  accessToken = t;
  for (const l of listeners) l(t);
}
export function getAccessToken() {
  return accessToken;
}
export function onAccessTokenChange(cb: (t: string | null) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body?: unknown) {
    super(message);
  }
}

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Set to true to skip the auto-refresh-on-401 dance (e.g. for /auth/* itself). */
  skipRefresh?: boolean;
  raw?: boolean;
}

function buildUrl(path: string, query?: ApiOptions["query"]): string {
  const base = path.startsWith("http") ? path : `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, query, headers, skipRefresh, raw, ...rest } = opts;
  const url = buildUrl(path, query);
  const init: RequestInit = {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  let res = await fetch(url, init);

  if (res.status === 401 && !skipRefresh && !path.includes("/auth/")) {
    const fresh = await doRefresh();
    if (fresh) {
      const retryHeaders = { ...(init.headers as Record<string, string>), Authorization: `Bearer ${fresh}` };
      res = await fetch(url, { ...init, headers: retryHeaders });
    }
  }

  if (!res.ok) {
    let payload: any = null;
    try { payload = await res.json(); } catch { /* ignore */ }
    const message = payload?.message ?? payload?.error ?? res.statusText;
    throw new ApiError(res.status, payload?.code ?? "api_error", String(message), payload);
  }

  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

/** Helpers semánticos. */
export const apiGet = <T>(path: string, query?: ApiOptions["query"]) => api<T>(path, { method: "GET", query });
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });

/** Descarga binaria autenticada (para PDFs, ZIPs, etc.). */
export async function apiGetBlob(path: string): Promise<Blob> {
  const res = (await api<Response>(path, { method: "GET", raw: true })) as Response;
  return await res.blob();
}

export { API_URL };
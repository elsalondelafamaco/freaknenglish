/**
 * Repositorio en memoria + persistencia `localStorage`.
 *
 * **Solo para mock/desarrollo.** En producción cada repo será reemplazado por
 * un repositorio Postgres (Drizzle/Prisma) detrás de la misma interfaz.
 */

const STORAGE_KEY = "freakn.db.v1";

export interface DbShape {
  users: Record<string, unknown>;
  subscriptions: Record<string, unknown>;
  sessions: Record<string, unknown>;
  paymentIntents: Record<string, unknown>;
  meta: { passwordsByEmail: Record<string, string> };
}

const emptyDb = (): DbShape => ({
  users: {},
  subscriptions: {},
  sessions: {},
  paymentIntents: {},
  meta: { passwordsByEmail: {} },
});

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

let cache: DbShape | null = null;

export function readDb(): DbShape {
  if (cache) return cache;
  if (!isBrowser()) {
    cache = emptyDb();
    return cache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...emptyDb(), ...(JSON.parse(raw) as DbShape) } : emptyDb();
  } catch {
    cache = emptyDb();
  }
  // Lazy seed: idempotente, solo en browser, una vez por instalación.
  try {
    // Import dinámico para evitar ciclo con auth.ts
    const { seedDemoData } = require("./seed") as typeof import("./seed");
    seedDemoData(cache);
    if (isBrowser()) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* seed opcional */
  }
  return cache;
}

export function writeDb(update: (db: DbShape) => void): DbShape {
  const db = readDb();
  update(db);
  if (isBrowser()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* ignore */
    }
  }
  return db;
}

export function resetDb() {
  cache = emptyDb();
  if (isBrowser()) localStorage.removeItem(STORAGE_KEY);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
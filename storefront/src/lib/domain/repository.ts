/**
 * Caché en memoria de la sesión actual.
 *
 * La fuente de verdad es el backend NestJS. Este módulo mantiene una copia
 * en memoria (sin `localStorage`, sin persistencia entre sesiones) que se
 * rellena tras el login vía `hydrateFromBackend` y se limpia en logout.
 *
 * Las mutaciones deben hacerse contra `endpoints.ts`; los helpers que
 * escriben aquí sólo mantienen la caché en memoria coherente hasta que la
 * ruta correspondiente invalide/refresque sus queries.
 */

export interface DbShape {
  users: Record<string, unknown>;
  subscriptions: Record<string, unknown>;
  sessions: Record<string, unknown>;
  paymentIntents: Record<string, unknown>;
  classes: Record<string, unknown>;
  lessonProgress: Record<string, unknown>;
  checkpointAttempts: Record<string, unknown>;
  satisfactionSurveys: Record<string, unknown>;
  classNotes: Record<string, unknown>;
  notifications: Record<string, unknown>;
  cmsModules: Record<string, unknown>;
  cmsCheckpoints: Record<string, unknown>;
  appSettings: Record<string, unknown>;
  meta: { passwordsByEmail: Record<string, string> };
}

const emptyDb = (): DbShape => ({
  users: {},
  subscriptions: {},
  sessions: {},
  paymentIntents: {},
  classes: {},
  lessonProgress: {},
  checkpointAttempts: {},
  satisfactionSurveys: {},
  classNotes: {},
  notifications: {},
  cmsModules: {},
  cmsCheckpoints: {},
  appSettings: {},
  meta: { passwordsByEmail: {} },
});

let cache: DbShape = emptyDb();

export function readDb(): DbShape {
  return cache;
}

export function writeDb(update: (db: DbShape) => void): DbShape {
  update(cache);
  return cache;
}

export function resetDb() {
  cache = emptyDb();
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
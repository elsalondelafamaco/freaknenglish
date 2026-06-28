/**
 * Configuración global de la plataforma (mock).
 *
 * Migración: tabla `app_settings (key TEXT PRIMARY KEY, value JSONB)`.
 * En el backend NestJS ya existe el endpoint `GET/PUT /admin/settings/:key`.
 */
import { readDb, writeDb } from "./repository";

export const DEFAULT_HOURLY_RATE_COP = 35000;

export function getSetting<T = unknown>(key: string, fallback: T): T {
  const db = readDb();
  const map = db.appSettings as Record<string, T>;
  const v = map?.[key];
  return v === undefined ? fallback : v;
}

export function setSetting<T = unknown>(key: string, value: T): void {
  writeDb((d) => {
    (d.appSettings as Record<string, unknown>)[key] = value as unknown;
  });
}

export function getHourlyRate(): number {
  const v = getSetting<number>("payroll.hourlyRateCop", DEFAULT_HOURLY_RATE_COP);
  return typeof v === "number" && v > 0 ? v : DEFAULT_HOURLY_RATE_COP;
}

export function setHourlyRate(rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Tarifa inválida");
  setSetting("payroll.hourlyRateCop", Math.round(rate));
}
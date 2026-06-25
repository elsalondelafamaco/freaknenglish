/**
 * Encuesta de satisfacción mensual (NPS).
 *
 * Trigger mock: si el usuario es estudiante y no respondió este mes, mostrar
 * el popup al entrar a `/app`. El plan real usa un cron (ver
 * `docs/backend-jobs.md`) que envía email + flag en sesión.
 */
import type { SatisfactionSurvey } from "./types";
import { readDb, writeDb, uid } from "./repository";

export function currentMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function hasAnsweredThisMonth(userId: string): boolean {
  const month = currentMonthKey();
  const all = Object.values(
    readDb().satisfactionSurveys as Record<string, SatisfactionSurvey>,
  );
  return all.some((s) => s.userId === userId && s.monthKey === month);
}

export function submitSatisfaction(input: {
  userId: string;
  nps: number;
  comment?: string;
}): SatisfactionSurvey {
  const survey: SatisfactionSurvey = {
    id: uid("nps"),
    userId: input.userId,
    nps: input.nps,
    comment: input.comment,
    monthKey: currentMonthKey(),
    submittedAt: new Date().toISOString(),
  };
  writeDb((db) => {
    (db.satisfactionSurveys as Record<string, SatisfactionSurvey>)[survey.id] = survey;
  });
  return survey;
}
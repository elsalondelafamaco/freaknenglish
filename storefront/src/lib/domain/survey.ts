/**
 * Encuesta de satisfacción cada 30 días (NPS + scores).
 *
 * Reglas (alineadas al plan de implementación):
 *  - Sólo aplica a estudiantes activos.
 *  - Obligatoria: bloquea la navegación hasta responder.
 *  - Frecuencia: a partir de la última respuesta, vuelve a aparecer cuando
 *    han pasado >= 30 días.
 *  - Privacidad: el profesor NO ve las respuestas. Sólo administradores.
 *
 * @migration Espejo en Postgres: tabla `satisfaction_surveys`
 *   (score NPS, teacher_score, content_score, platform_score, comment, period).
 */
import type { SatisfactionSurvey } from "./types";
import { readDb, writeDb, uid } from "./repository";

export const SURVEY_INTERVAL_DAYS = 30;

export function currentMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function latestFor(userId: string): SatisfactionSurvey | undefined {
  const all = Object.values(
    readDb().satisfactionSurveys as Record<string, SatisfactionSurvey>,
  ).filter((s) => s.userId === userId);
  if (all.length === 0) return undefined;
  return all.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
}

/**
 * Returns true when the user must respond before continuing.
 * - Never answered → due immediately.
 * - Last answer is older than SURVEY_INTERVAL_DAYS → due.
 */
export function isSurveyDue(userId: string): boolean {
  const last = latestFor(userId);
  if (!last) return true;
  const lastTs = new Date(last.submittedAt).getTime();
  const ageDays = (Date.now() - lastTs) / (1000 * 60 * 60 * 24);
  return ageDays >= SURVEY_INTERVAL_DAYS;
}

export type SurveyAnswers = {
  /** 0..10 — likelihood to recommend (NPS). */
  nps: number;
  /** 1..5 — teacher quality. */
  teacherScore: number;
  /** 1..5 — learning content quality. */
  contentScore: number;
  /** 1..5 — platform / UX quality. */
  platformScore: number;
  /** Free-form comment (optional). Visible only to admins. */
  comment?: string;
};

export function submitSatisfaction(input: {
  userId: string;
  answers: SurveyAnswers;
}): SatisfactionSurvey {
  const survey: SatisfactionSurvey = {
    id: uid("nps"),
    userId: input.userId,
    nps: input.answers.nps,
    teacherScore: input.answers.teacherScore,
    contentScore: input.answers.contentScore,
    platformScore: input.answers.platformScore,
    comment: input.answers.comment,
    monthKey: currentMonthKey(),
    submittedAt: new Date().toISOString(),
  };
  writeDb((db) => {
    (db.satisfactionSurveys as Record<string, SatisfactionSurvey>)[survey.id] = survey;
  });
  return survey;
}

/** Admin-only: list every response, newest first. */
export function listAllSurveys(): SatisfactionSurvey[] {
  return Object.values(
    readDb().satisfactionSurveys as Record<string, SatisfactionSurvey>,
  ).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}
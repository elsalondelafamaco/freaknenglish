/**
 * Tipos del dominio Freakn English.
 *
 * Estos tipos son la fuente de verdad usada por la capa de servicios.
 * Cuando migremos a Postgres, las tablas reflejan estos shapes 1:1
 * (ver `docs/data-model.md`).
 */

export type AppRole = "student" | "teacher" | "admin" | "moderator";

export type EnglishLevel = "beginner" | "intermediate" | "advanced";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "pending";

export type PlanId = "3-dias" | "4-dias" | "5-dias";

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  roles: AppRole[];
  level?: EnglishLevel;
  /** Onboarding completado (nivelación + horario inicial). */
  onboardedAt?: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  startedAt?: string;
  currentPeriodEnd?: string;
  wompiReference?: string;
}

export interface Session {
  userId: string;
  /** Token opaco. En el mock es un UUID; en prod será un JWT. */
  token: string;
  expiresAt: string;
}

export interface AuthResult {
  user: User;
  session: Session;
}

export type Provider = "password" | "google";
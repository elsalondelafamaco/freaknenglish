/**
 * Wrappers HTTP tipados para cada módulo del backend.
 * Tipos minimalistas — el contrato real está en backend/src/modules/* y
 * en `docs/data-model.md`.
 */
import { apiGet, apiPatch, apiPost } from "./client";
import type {
  ClassSession,
  Subscription,
  User,
  EnglishLevel,
  LearningModule,
  Checkpoint,
  CheckpointAttempt,
} from "@/lib/domain/types";

// ─── Auth ──────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiPost<{ accessToken: string; user: { id: string; role: string } }>("/auth/login", { email, password }),
  signup: (input: { email: string; password: string; fullName: string; phone?: string }) =>
    apiPost<{ accessToken: string }>("/auth/signup", input),
  refresh: () => apiPost<{ accessToken: string }>("/auth/refresh"),
  logout: () => apiPost<{ ok: true }>("/auth/logout"),
  forgot: (email: string) => apiPost<{ ok: true }>("/auth/forgot", { email }),
  reset: (token: string, password: string) =>
    apiPost<{ ok: true }>("/auth/reset", { token, password }),
};

// ─── Me / Users ────────────────────────────────────────────────────────
export const usersApi = {
  me: () => apiGet<any>("/me"),
  updateMe: (body: Partial<{ fullName: string; phone: string; avatarUrl: string }>) =>
    apiPatch<any>("/me", body),
};

// ─── Plans + Checkout ──────────────────────────────────────────────────
export const plansApi = {
  list: () => apiGet<Array<{ id: string; name: string; daysPerWeek: number; priceCop: number }>>("/plans"),
};

export const checkoutApi = {
  createIntent: (body: { planId: string; customerEmail: string; customerName: string; customerPhone?: string }) =>
    apiPost<{
      intentId: string;
      reference: string;
      amountInCents: number;
      currency: string;
      signature: string;
      publicKey: string;
      redirectUrl: string;
    }>("/checkout/intents", body),
};

// ─── Subscriptions ─────────────────────────────────────────────────────
export const subscriptionsApi = {
  mine: () => apiGet<Subscription & { plan?: { id: string; name: string; priceCop: number } } | null>("/subscriptions/mine"),
  cancel: () => apiPost<Subscription>("/subscriptions/cancel"),
  resume: () => apiPost<Subscription>("/subscriptions/resume"),
};

// ─── Classes ───────────────────────────────────────────────────────────
export const classesApi = {
  list: () => apiGet<ClassSession[]>("/classes"),
  upcoming: () => apiGet<ClassSession | null>("/classes/upcoming"),
  todayForTeacher: () => apiGet<ClassSession[]>("/classes/today"),
  confirm: (id: string) => apiPost<ClassSession>(`/classes/${id}/confirm`),
  validate: (id: string) => apiPost<ClassSession>(`/classes/${id}/validate`),
  reschedule: (id: string, startsAt: string, endsAt: string) =>
    apiPost<ClassSession>(`/classes/${id}/reschedule`, { startsAt, endsAt }),
  cancel: (id: string, reason?: string) => apiPost<ClassSession>(`/classes/${id}/cancel`, { reason }),
};

// ─── Learning ──────────────────────────────────────────────────────────
export const learningApi = {
  modules: (level?: EnglishLevel) =>
    apiGet<LearningModule[]>("/learning/modules", level ? { level } : undefined),
  module: (id: string) => apiGet<LearningModule>(`/learning/modules/${id}`),
  progress: () => apiGet<{
    lessonsCompleted: number;
    totalSecondsWatched: number;
    checkpointsPassed: string[];
    attempts: CheckpointAttempt[];
  }>("/learning/progress"),
  saveLessonProgress: (lessonId: string, secondsWatched: number, completed: boolean) =>
    apiPost("/learning/progress", { lessonId, secondsWatched, completed }),
  checkpoint: (id: string) => apiGet<Checkpoint>(`/learning/checkpoints/${id}`),
  submitCheckpoint: (id: string, answers: Record<string, number>) =>
    apiPost<CheckpointAttempt>(`/learning/checkpoints/${id}/submit`, { answers }),
};

// ─── Teachers ──────────────────────────────────────────────────────────
export const teachersApi = {
  students: () => apiGet<any[]>("/teacher/students"),
  studentDetail: (id: string) => apiGet<any>(`/teacher/students/${id}`),
  schedule: (status?: "upcoming" | "past" | "pending") =>
    apiGet<ClassSession[]>("/teacher/schedule", status ? { status } : undefined),
  addNote: (classId: string, rating: number, notes: string) =>
    apiPost<any>(`/teacher/classes/${classId}/notes`, { rating, notes }),
};

// ─── Admin ─────────────────────────────────────────────────────────────
export const adminApi = {
  analytics: () => apiGet<{
    mrrCop: number;
    activeSubscriptions: number;
    nps: number;
    surveys: number;
    attendanceRate: number;
    byPlan: Array<{ planId: string; active: number }>;
  }>("/admin/analytics"),
  users: (q?: string) => apiGet<User[]>("/admin/users", q ? { q } : undefined),
  userDetail: (id: string) => apiGet<any>(`/admin/users/${id}`),
  payroll: (period: string) => apiGet<Array<{ teacherId: string; fullName: string; classes: number; rateCop: number; amountCop: number }>>("/admin/payroll", { period }),
  payrollCsv: (period: string) =>
    apiGet<string>(`/admin/payroll/export.csv`, { period }),
  content: () => apiGet<LearningModule[]>("/admin/content"),
  createModule: (body: { id?: string; level: "beginner" | "intermediate" | "advanced"; title: string; summary?: string; position?: number }) =>
    apiPost<any>("/admin/content/modules", body),
  updateModule: (id: string, body: { level?: "beginner" | "intermediate" | "advanced"; title?: string; summary?: string; position?: number }) =>
    apiPatch<any>(`/admin/content/modules/${id}`, body),
  deleteModule: (id: string) => apiPatch<{ ok: true }>(`/admin/content/modules/${id}/delete`, {}),
  createLesson: (body: any) => apiPost<any>("/admin/content/lessons", body),
  updateLesson: (id: string, body: any) => apiPatch<any>(`/admin/content/lessons/${id}`, body),
  deleteLesson: (id: string) => apiPatch<{ ok: true }>(`/admin/content/lessons/${id}/delete`, {}),
  notifications: (status?: "queued" | "sent" | "failed") =>
    apiGet<any[]>("/admin/notifications", status ? { status } : undefined),
  runAutomations: () => apiPost<{ ok: true }>("/admin/notifications/run"),
  createUser: (body: { email: string; fullName: string; role: "student" | "teacher"; level?: "beginner" | "intermediate" | "advanced" }) =>
    apiPost<{ user: User; setPasswordToken: string }>("/admin/users", body),
  updateUser: (id: string, body: Partial<{ fullName: string; phone: string; role: "student" | "teacher" | "admin"; englishLevel: "beginner" | "intermediate" | "advanced" | null }>) =>
    apiPatch<User>(`/admin/users/${id}`, body),
  setUserStatus: (id: string, disabled: boolean) =>
    apiPatch<User>(`/admin/users/${id}/status`, { disabled }),
  softDeleteUser: (id: string) => apiPatch<User>(`/admin/users/${id}/delete`, {}),
  resetPassword: (id: string) => apiPost<{ ok: true; link?: string; expiresAt?: string }>(`/admin/users/${id}/reset-password`),
  resetNps: (id: string) => apiPost<{ ok: true }>(`/admin/users/${id}/surveys/reset`),
  assignTeacher: (studentId: string, teacherId: string | null) =>
    apiPatch<User>(`/admin/users/${studentId}/assign-teacher`, { teacherId }),
  impersonate: (userId: string) =>
    apiPost<{ accessToken: string; target: { id: string; fullName: string; role: string } }>(
      `/admin/users/${userId}/impersonate`,
    ),
};

// ─── Surveys ───────────────────────────────────────────────────────────
export const surveysApi = {
  pending: () => apiGet<{ pending: boolean; period: string }>("/surveys/pending"),
  submit: (body: { score: number; teacherScore?: number; contentScore?: number; platformScore?: number; comment?: string }) =>
    apiPost<any>("/surveys/nps", body),
};

// ─── Boards (realtime) ─────────────────────────────────────────────────
export const boardsApi = {
  list: () => apiGet<any[]>("/boards"),
  create: (name: string) => apiPost<any>("/boards", { name }),
  get: (id: string) => apiGet<any>(`/boards/${id}`),
  opsSince: (id: string, since: number) =>
    apiGet<any[]>(`/boards/${id}/ops`, { since }),
  invite: (id: string, userId: string, role: "editor" | "viewer" = "editor") =>
    apiPost<any>(`/boards/${id}/invite`, { userId, role }),
};
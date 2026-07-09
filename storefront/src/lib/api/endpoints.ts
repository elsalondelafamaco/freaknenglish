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
  updateMe: (body: Partial<{ fullName: string; phone: string; avatarUrl: string; documentNumber: string }>) =>
    apiPatch<any>("/me", body),
  payments: () =>
    apiGet<Array<{
      id: string;
      reference: string;
      planId: string;
      planName?: string;
      amountInCents: number;
      currency: string;
      status: "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";
      approvedAt: string | null;
      createdAt: string;
      wompiId: string | null;
    }>>("/me/payments"),
};

// ─── Scheduling ────────────────────────────────────────────────────────
export const scheduleApi = {
  grid: () => apiGet<{ grid: Record<string, number>; hours: number[] }>("/schedule/availability-grid"),
  mine: () => apiGet<{
    schedulePreferences: Array<{ weekday: number; hour: number }> | null;
    scheduleAssignmentStatus: "auto_assigned" | "manual_pending" | null;
    assignedTeacher: { id: string; fullName: string } | null;
  }>("/schedule/mine"),
  submit: (blocks: Array<{ weekday: number; hour: number }>) =>
    apiPost<{ status: "auto_assigned" | "manual_pending"; teacher: { id: string; fullName: string } | null }>(
      "/schedule/preferences",
      { blocks },
    ),
  adminPending: () => apiGet<any[]>("/admin/schedule/requests"),
  adminAssign: (userId: string, teacherId: string) =>
    apiPost<any>(`/admin/schedule/requests/${userId}/assign`, { teacherId }),
  adminTeacherAvailability: (teacherId: string) =>
    apiGet<Array<{ id: string; weekday: number; startsAt: string; endsAt: string }>>(`/admin/teachers/${teacherId}/availability`),
  adminSetTeacherAvailability: (
    teacherId: string,
    slots: Array<{ weekday: number; startsAt: string; endsAt: string }>,
  ) => apiPost<any>(`/admin/teachers/${teacherId}/availability`, { slots }),
};

// ─── Plans + Checkout ──────────────────────────────────────────────────
export const plansApi = {
  list: () =>
    apiGet<{
      trm: { valueCop: number; validFrom: string; source: string };
      plans: Array<{
        id: string;
        name: string;
        daysPerWeek: number;
        priceCop: number;
        priceUsd: number | null;
        features: string[];
      }>;
    }>("/plans"),
};

export const exchangeApi = {
  trm: () => apiGet<{ valueCop: number; validFrom: string; source: string }>("/public/exchange/trm"),
};

export const checkoutApi = {
  createIntent: (body: { planId: string; customerEmail: string; customerName: string; customerPhone: string; customerDocument: string; userId?: string }) =>
    apiPost<{
      intentId: string;
      reference: string;
      amountInCents: number;
      currency: string;
      signature: string;
      publicKey: string;
      redirectUrl: string;
      checkoutUrl: string;
    }>("/checkout/intents", body),
  status: (reference: string) =>
    apiGet<{
      reference: string;
      status: "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";
      planId: string;
      planName?: string;
      approvedAt: string | null;
      customerEmail: string;
    }>("/checkout/status", { reference }),
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
  myAvailability: () =>
    apiGet<Array<{ id: string; weekday: number; startsAt: string; endsAt: string }>>(
      "/teacher/availability",
    ),
  saveMyAvailability: (slots: Array<{ weekday: number; startsAt: string; endsAt: string }>) =>
    apiPost<{
      availability: Array<{ id: string; weekday: number; startsAt: string; endsAt: string }>;
      reassigned: Array<{ id: string; fullName: string }>;
    }>("/teacher/availability", { slots }),
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
  payroll: (period: string) =>
    apiGet<
      Array<{
        teacherId: string;
        fullName: string;
        classes: number;
        minutes: number;
        hours: number;
        hourlyRateCop: number;
        amountCop: number;
      }>
    >("/admin/payroll", { period }),
  payrollCsv: (period: string) =>
    apiGet<string>(`/admin/payroll/export.csv`, { period }),
  payrollSettings: () => apiGet<{ hourlyRateCop: number }>("/admin/settings/payroll"),
  setPayrollSettings: (hourlyRateCop: number) =>
    apiPatch<{ hourlyRateCop: number }>("/admin/settings/payroll", { hourlyRateCop }),
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
  surveys: (filter?: "all" | "promoters" | "detractors") =>
    apiGet<{
      rows: Array<{
        id: string;
        score: number;
        teacherScore: number | null;
        contentScore: number | null;
        platformScore: number | null;
        comment: string | null;
        createdAt: string;
        user: { id: string; fullName: string; email: string; role: string };
      }>;
      totals: { count: number; promoters: number; detractors: number; nps: number | null };
    }>("/admin/surveys", filter ? { filter } : undefined),
  assignTeacher: (studentId: string, teacherId: string | null) =>
    apiPatch<User>(`/admin/users/${studentId}/assign-teacher`, { teacherId }),
  impersonate: (userId: string) =>
    apiPost<{ accessToken: string; target: { id: string; fullName: string; role: string } }>(
      `/admin/users/${userId}/impersonate`,
    ),
};

// ─── Surveys ───────────────────────────────────────────────────────────
export const surveysApi = {
  pending: () =>
    apiGet<{ pending: boolean; period: string; reason: "last_class" | "period_ended" | null }>(
      "/surveys/pending",
    ),
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
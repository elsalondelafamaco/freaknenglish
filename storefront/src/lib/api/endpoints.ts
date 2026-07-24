/**
 * Wrappers HTTP tipados para cada módulo del backend.
 * Tipos minimalistas — el contrato real está en backend/src/modules/* y
 * en `docs/data-model.md`.
 */
import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
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
  signup: (input: { email: string; password: string; fullName: string; phone: string; documentNumber: string }) =>
    apiPost<{ accessToken: string }>("/auth/signup", input),
  refresh: () => apiPost<{ accessToken: string }>("/auth/refresh"),
  logout: () => apiPost<{ ok: true }>("/auth/logout"),
  forgot: (email: string) => apiPost<{ ok: true }>("/auth/forgot", { email }),
  reset: (token: string, password: string) =>
    apiPost<{ ok: true }>("/auth/reset", { token, password }),
};

// ─── Notifications (in-app inbox) ─────────────────────────────────────
export type InAppNotification = {
  id: string;
  type: "system" | "payment" | "class" | "teacher" | "learning";
  template: string;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  subject: string;
  readAt: string | null;
  createdAt: string;
};

// ─── Admin metrics (D7) ───────────────────────────────────────────────
export type AdminMetrics = {
  range: { from: string; to: string; days: number };
  mrrCop: number;
  arrCop: number;
  activeSubscriptions: number;
  totalStudents: number;
  churnRate: number;
  attendanceRate: number;
  nps: number;
  surveys: number;
  revenueCop: number;
  revenueSeries: Array<{ date: string; cents: number }>;
  classesSeries: Array<{ date: string; count: number }>;
  topTeachers: Array<{ id: string; fullName: string; validatedClasses: number; hours: number }>;
  cohorts: Array<{ cohort: string; size: number; retention: number[] }>;
};

// ─── Payment receipts (D8) ────────────────────────────────────────────
export const receiptsApi = {
  downloadUrl: (intentId: string) => `/me/payments/${intentId}/receipt.pdf`,
};

export const notificationsApi = {
  list: (opts: { unread?: boolean; limit?: number } = {}) =>
    apiGet<InAppNotification[]>("/notifications", {
      ...(opts.unread ? { unread: "1" } : {}),
      ...(opts.limit ? { limit: String(opts.limit) } : {}),
    }),
  unreadCount: () => apiGet<{ count: number }>("/notifications/unread-count"),
  markRead: (id: string) => apiPost<{ ok: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => apiPost<{ ok: true; count: number }>("/notifications/read-all"),
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
export type SlotRef = { weekday: number; hour: number };
export type ScheduleHints = { assignable: boolean; hints: Array<SlotRef & { auto: boolean }> };

export const scheduleApi = {
  grid: () => apiGet<{ grid: Record<string, number>; hours: number[] }>("/schedule/availability-grid"),
  config: () =>
    apiGet<{ days: number[]; startHour: number; endHour: number; maxPerDay: number; durationMin: number }>(
      "/public/schedule/config",
    ),
  availability: (slots: SlotRef[]) =>
    apiPost<ScheduleHints>("/public/schedule/availability", { slots }),
  availabilityMine: (slots: SlotRef[]) =>
    apiPost<ScheduleHints>("/schedule/availability", { slots }),
  mine: () => apiGet<{
    schedulePreferences: Array<{ weekday: number; hour: number }> | null;
    scheduleAssignmentStatus: "auto_assigned" | "manual_pending" | null;
    slots?: Array<{ weekday: number; hour: number; status: string }>;
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

export const settingsApi = {
  contact: () => apiGet<{ whatsappNumber: string; whatsappMessage: string }>("/public/settings"),
  site: () => apiGet<SiteContentOverrides>("/public/settings/site"),
};

// ─── Contenido editable del sitio (home) ───────────────────────────────
export type SiteFaq = { q: string; a: string };
export type SiteContentOverrides = {
  media: Record<string, string>;
  faqs: SiteFaq[] | null;
  legal: Record<string, string>;
  social: Record<string, string>;
};

export const exchangeApi = {
  trm: () => apiGet<{ valueCop: number; validFrom: string; source: string }>("/public/exchange/trm"),
};

export const checkoutApi = {
  createIntent: (body: { planId: string; customerEmail: string; customerName: string; customerPhone: string; customerDocument: string; userId?: string; slots?: SlotRef[]; password?: string }) =>
    apiPost<{
      intentId: string;
      reference: string;
      amountInCents: number;
      currency: string;
      signature: string;
      publicKey: string;
      redirectUrl: string;
      checkoutUrl: string;
      assignmentMode: "auto" | "manual" | null;
    }>("/checkout/intents", body),
  status: (params: { reference?: string; id?: string }) =>
    apiGet<{
      reference: string;
      status: "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";
      planId: string;
      planName?: string;
      approvedAt: string | null;
      customerEmail: string;
    }>("/checkout/status", params),
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
  noShow: (id: string) => apiPost<ClassSession>(`/classes/${id}/no-show`),
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
    completedLessonIds: string[];
    totalSecondsWatched: number;
    checkpointsPassed: string[];
    attempts: CheckpointAttempt[];
  }>("/learning/progress"),
  levelCheckpoint: (level: EnglishLevel) =>
    apiGet<(Checkpoint & { moduleId: string; passingScore: number }) | null>("/learning/level-checkpoint", { level }),
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
  addNote: (classId: string, notes: string) =>
    apiPost<any>(`/teacher/classes/${classId}/notes`, { notes }),
  addStudentNote: (studentId: string, notes: string) =>
    apiPost<any>(`/teacher/students/${studentId}/notes`, { notes }),
  pinNote: (noteId: string, pinned: boolean) =>
    apiPatch<any>(`/teacher/notes/${noteId}/pin`, { pinned }),
  calendar: (from: string, to: string) =>
    apiGet<{
      classes: Array<{
        id: string;
        startsAt: string;
        endsAt: string;
        status: string;
        autoValidated: boolean;
        meetingUrl: string | null;
        student: { id: string; fullName: string; paymentActive: boolean };
      }>;
      absences: Array<{ id: string; startsAt: string; endsAt: string; reason?: string | null }>;
    }>("/teacher/calendar", { from, to }),
  rescheduleClass: (id: string, startsAt: string, scope: "once" | "forever") =>
    apiPost<any>(`/teacher/classes/${id}/reschedule`, { startsAt, scope }),
  myAvailability: () =>
    apiGet<Array<{ id: string; weekday: number; startsAt: string; endsAt: string }>>(
      "/teacher/availability",
    ),
  saveMyAvailability: (slots: Array<{ weekday: number; startsAt: string; endsAt: string }>) =>
    apiPost<{
      availability: Array<{ id: string; weekday: number; startsAt: string; endsAt: string }>;
      reassigned: Array<{ id: string; fullName: string }>;
    }>("/teacher/availability", { slots }),
  absences: () =>
    apiGet<Array<{ id: string; teacherId: string; startsAt: string; endsAt: string; reason?: string }>>(
      "/teacher/absences",
    ),
  createAbsence: (startsAt: string, endsAt: string, reason?: string) =>
    apiPost<{ absence: any; affected: any[] }>("/teacher/absences", { startsAt, endsAt, reason }),
  createAbsencesByClasses: (classIds: string[], reason?: string) =>
    apiPost<{ absences: any[]; cancelled: number }>("/teacher/absences/by-classes", { classIds, reason }),
  deleteAbsence: (id: string) => apiDelete<{ ok: boolean }>(`/teacher/absences/${id}`),
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
  metrics: (rangeDays = 30) => apiGet<AdminMetrics>("/admin/metrics", { range: String(rangeDays) }),
  saveCheckpoint: (body: { id?: string; moduleId: string; fromLevel: string; toLevel: string; passingScore?: number; questions?: unknown }) =>
    apiPost<any>("/admin/content/checkpoints", body),
  updateCheckpoint: (id: string, body: any) => apiPatch<any>(`/admin/content/checkpoints/${id}`, body),
  deleteCheckpoint: (id: string) => apiPatch<any>(`/admin/content/checkpoints/${id}/delete`, {}),
  plans: () => apiGet<any[]>("/admin/plans"),
  calendar: (from: string, to: string) =>
    apiGet<{
      teachers: Array<{ id: string; fullName: string }>;
      classes: Array<{
        id: string;
        startsAt: string;
        endsAt: string;
        status: string;
        teacher: { id: string; fullName: string } | null;
        student: { id: string; fullName: string; paymentActive: boolean };
      }>;
    }>("/admin/calendar", { from, to }),
  scheduleConfig: () =>
    apiGet<{ days: number[]; startHour: number; endHour: number; maxPerDay: number; durationMin: number }>(
      "/admin/settings/schedule",
    ),
  updateScheduleConfig: (body: Partial<{ days: number[]; startHour: number; endHour: number; maxPerDay: number }>) =>
    apiPost<any>("/admin/settings/schedule", body),
  contactSettings: () => apiGet<{ whatsappNumber: string; whatsappMessage: string }>("/admin/settings/contact"),
  siteContent: () => apiGet<SiteContentOverrides>("/admin/settings/site"),
  updateSiteContent: (body: {
    media?: Record<string, string | null>;
    faqs?: SiteFaq[] | null;
    legal?: Record<string, string | null>;
    social?: Record<string, string | null>;
  }) => apiPatch<SiteContentOverrides>("/admin/settings/site", body),
  signSiteUpload: (body: { filename: string; contentType?: string; siteSlot: string }) =>
    apiPost<{ uploadUrl: string; publicUrl: string; storageKey: string }>("/admin/uploads/sign", body),
  updateContact: (body: { whatsappNumber?: string; whatsappMessage?: string }) =>
    apiPatch<{ whatsappNumber: string; whatsappMessage: string }>("/admin/settings/contact", body),
  updatePlan: (id: string, body: Partial<{ name: string; daysPerWeek: number; priceUsd: number; priceCop: number; isActive: boolean; features: unknown }>) =>
    apiPatch<any>(`/admin/plans/${id}`, body),
  atRisk: () =>
    apiGet<
      Array<{
        id: string;
        fullName: string;
        email: string;
        assignedTeacherId: string | null;
        subscriptionStatus: string | null;
        lastClassAt: string | null;
        daysSinceClass: number | null;
        reasons: string[];
        risk: number;
      }>
    >("/admin/at-risk"),
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
  createUser: (body: {
    email: string;
    fullName: string;
    role: "student" | "teacher";
    level?: "beginner" | "intermediate" | "advanced";
    /** Empalme: activa el plan manualmente (pagos por fuera de Wompi). */
    plan?: { planId: string; endDate: string };
  }) => apiPost<{ user: User; link?: string }>("/admin/users", body),
  setSubscription: (
    id: string,
    body: {
      planId: string;
      status?: "pending" | "active" | "past_due" | "canceled" | "expired";
      currentPeriodEnd?: string | null;
      startedAt?: string | null;
    },
  ) => apiPatch<any>(`/admin/users/${id}/subscription`, body),
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
  create: (name: string, studentId: string) => apiPost<any>("/boards", { name, studentId }),
  get: (id: string) => apiGet<any>(`/boards/${id}`),
  opsSince: (id: string, since: number) =>
    apiGet<any[]>(`/boards/${id}/ops`, { since }),
  invite: (id: string, userId: string, role: "editor" | "viewer" = "editor") =>
    apiPost<any>(`/boards/${id}/invite`, { userId, role }),
  inviteByEmail: (id: string, email: string, role: "editor" | "viewer" = "editor") =>
    apiPost<{ ok: boolean; user: { id: string; email: string; fullName: string } }>(
      `/boards/${id}/invite-by-email`,
      { email, role },
    ),
  signUpload: (id: string, body: { filename: string; contentType?: string }) =>
    apiPost<{ uploadUrl: string; publicUrl: string; storageKey: string }>(
      `/boards/${id}/uploads/sign`,
      body,
    ),
  // Pages
  listPages: (boardId: string) =>
    apiGet<Array<{ id: string; title: string; position: number; kind: string; updatedAt: string }>>(
      `/boards/${boardId}/pages`,
    ),
  createPage: (boardId: string, body: { title?: string; kind?: string } = {}) =>
    apiPost<any>(`/boards/${boardId}/pages`, body),
  renamePage: (pageId: string, title: string) =>
    apiPatch<any>(`/boards/pages/${pageId}`, { title }),
  reorderPage: (pageId: string, position: number) =>
    apiPatch<any>(`/boards/pages/${pageId}`, { position }),
  deletePage: (pageId: string) => apiDelete<any>(`/boards/pages/${pageId}`),
  pageState: (pageId: string) =>
    apiGet<{ id: string; title: string; kind: string; snapshot: string | null; lastSeq: number }>(
      `/boards/pages/${pageId}/state`,
    ),
  appendPageOp: (pageId: string, update: string, clientOpId: string) =>
    apiPost<{ ok: boolean; seq: number }>(`/boards/pages/${pageId}/ops`, { update, clientOpId }),
  pageOpsSince: (pageId: string, since: number) =>
    apiGet<Array<{ seq: number; userId: string; clientOpId: string; update: string }>>(
      `/boards/pages/${pageId}/ops`,
      { since },
    ),
  listVersions: (pageId: string) =>
    apiGet<Array<{ id: string; label: string | null; createdBy: string; sizeBytes: number; createdAt: string }>>(
      `/boards/pages/${pageId}/versions`,
    ),
  saveVersion: (pageId: string, label?: string) =>
    apiPost<{ id: string; label: string | null; createdAt: string; sizeBytes: number }>(
      `/boards/pages/${pageId}/versions`,
      { label },
    ),
  restoreVersion: (versionId: string) =>
    apiPost<{ pageId: string; snapshot: string }>(`/boards/versions/${versionId}/restore`, {}),
};
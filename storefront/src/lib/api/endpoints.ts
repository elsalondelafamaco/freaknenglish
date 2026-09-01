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
  /** Termina la suplantación: borra el vale y devuelve al admin a su sesión. */
  stopImpersonation: () => apiPost<{ accessToken: string }>("/auth/stop-impersonation"),
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
  // Trazabilidad global (solo admin)
  adminAll: (filters: {
    q?: string; template?: string; status?: string; channel?: string;
    from?: string; to?: string; page?: number; pageSize?: number;
  } = {}) =>
    apiGet<{
      total: number; page: number; pageSize: number;
      byStatus: Record<string, number>;
      items: Array<{
        id: string; toEmail: string; channel: string; template: string; subject: string;
        status: "pending" | "sent" | "failed"; error: string | null; sentAt: string | null;
        createdAt: string; readAt: string | null; type: string; providerId: string | null;
        user: { id: string; fullName: string; role: string } | null;
      }>;
    }>("/notifications/admin/all", filters as any),
  adminTemplates: () => apiGet<Array<{ template: string; count: number }>>("/notifications/admin/templates"),
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

/** Ventana global de horarios que configura el admin. `endHour` es INCLUSIVO. */
export type ScheduleConfig = {
  days: number[];
  startHour: number;
  endHour: number;
  maxPerDay: number;
  durationMin: number;
};
export type ScheduleHints = { assignable: boolean; hints: Array<SlotRef & { auto: boolean }> };

export const scheduleApi = {
  grid: () => apiGet<{ grid: Record<string, number>; hours: number[] }>("/schedule/availability-grid"),
  config: () => apiGet<ScheduleConfig>("/public/schedule/config"),
  /** `planId`: sin él no se puede saber si un profe cubre el plan completo. */
  availability: (slots: SlotRef[], planId?: string) =>
    apiPost<ScheduleHints>("/public/schedule/availability", { slots, planId }),
  availabilityMine: (slots: SlotRef[], planId?: string) =>
    apiPost<ScheduleHints>("/schedule/availability", { slots, planId }),
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
  /** Disponibilidad de todos los profes, para el calendario global del admin. */
  adminAllAvailability: () =>
    apiGet<Array<{ id: string; teacherId: string; weekday: number; startsAt: string; endsAt: string }>>(
      "/admin/availability",
    ),
  /** Horario semanal vigente de un estudiante (para precargar el editor). */
  adminStudentSchedule: (studentId: string) =>
    apiGet<{
      blocks: SlotRef[];
      durationMin: number;
      teacherId: string | null;
      daysPerWeek: number;
      planName: string | null;
      subscriptionStatus: string | null;
    }>(`/admin/users/${studentId}/schedule`),
  /** Cambia el horario de un estudiante ya creado y rehace sus clases futuras. */
  adminSetStudentSchedule: (studentId: string, blocks: SlotRef[], teacherId?: string | null) =>
    apiPatch<{
      ok: boolean;
      blocks: SlotRef[];
      teacherId: string | null;
      eliminadas: number;
      creadas: number;
    }>(`/admin/users/${studentId}/schedule`, teacherId === undefined ? { blocks } : { blocks, teacherId }),
  /** Horarios asignados que no caben en la disponibilidad de su profesor. */
  adminScheduleAudit: () =>
    apiGet<{
      total: number;
      sinProblemas: number;
      problemas: Array<{
        teacherId: string;
        teacherName: string;
        studentId: string | null;
        studentName: string | null;
        weekday: number;
        dayName: string;
        hour: number;
        durationMin: number;
        horasRequeridas: number[];
      }>;
    }>("/admin/schedule/audit"),
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
export type SiteTestimonial = { name?: string; role?: string };
export type SiteContentOverrides = {
  media: Record<string, string>;
  faqs: SiteFaq[] | null;
  legal: Record<string, string>;
  social: Record<string, string>;
  /** slot de imagen → nombre y rol del testimonio. */
  testimonials?: Record<string, SiteTestimonial>;
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
  // `priceUsd` viaja porque el precio real es `USD × TRM`: `priceCop` es sólo
  // el de respaldo cuando el plan no tiene precio en dólares o no hay TRM.
  // Sin exponerlo, la pantalla de configuración mostraba el COP viejo de la
  // semilla mientras el checkout cobraba otra cosa.
  mine: () =>
    apiGet<Subscription & { plan?: { id: string; name: string; priceCop: number; priceUsd?: number | null } } | null>(
      "/subscriptions/mine",
    ),
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
  /** `permitirCruce`: el profe ya confirmó que quiere dos clases a la misma hora. */
  reschedule: (id: string, startsAt: string, endsAt: string, permitirCruce = false) =>
    apiPost<ClassSession>(`/classes/${id}/reschedule`, { startsAt, endsAt, permitirCruce }),
  /** Congela la clase: no se auto-valida ni entra a nómina hasta tener fecha. */
  freeze: (id: string, reason?: string) =>
    apiPost<ClassSession>(`/classes/${id}/freeze`, { reason }),
  unfreeze: (id: string) => apiPost<ClassSession>(`/classes/${id}/unfreeze`),
  cancel: (id: string, reason?: string) => apiPost<ClassSession>(`/classes/${id}/cancel`, { reason }),
  /** Estudiante reporta un problema con una clase dictada → avisa a admins. */
  report: (id: string, note: string) => apiPost<{ ok: boolean }>(`/classes/${id}/report`, { note }),
  /** Solo admin: fuerza el estado de una clase (ajuste de nómina/métricas). */
  adminSetStatus: (
    id: string,
    status: "validated" | "no_show" | "scheduled" | "cancelled" | "pending_reschedule",
  ) =>
    apiPatch<ClassSession>(`/classes/${id}/status`, { status }),
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
    apiGet<CheckpointV2 | null>("/learning/level-checkpoint", { level }),
  saveLessonProgress: (lessonId: string, secondsWatched: number, completed: boolean) =>
    apiPost("/learning/progress", { lessonId, secondsWatched, completed }),
  // Resultados de actividades interactivas (bridge FreaknActivity)
  saveActivityResult: (lessonId: string, body: ActivityResultInput) =>
    apiPost<ActivityResultRow>(`/learning/lessons/${lessonId}/activity-result`, body),
  myActivityResults: (lessonId?: string) =>
    apiGet<ActivityResultRow[]>("/learning/my/activity-results", lessonId ? { lessonId } : undefined),
  /**
   * Slide donde quedó la clase. Sólo lo usa el visor del profe: el alumno en su
   * portal siempre empieza por el principio.
   */
  lastSlide: (lessonId: string, studentId?: string) =>
    apiGet<{ slide: string | null }>(`/learning/lessons/${lessonId}/slide`, studentId ? { studentId } : undefined),
  saveLastSlide: (lessonId: string, slide: string | number | null, studentId?: string) =>
    apiPost<{ ok: boolean; slide: string | null }>(`/learning/lessons/${lessonId}/slide`, { slide, studentId }),
  /** Material (links y PDFs) que su profesor le dejó a este estudiante. */
  myResources: () => apiGet<StudentResource[]>("/learning/my/resources"),
  /** Reportes publicados. Los borradores del profe no llegan aquí. */
  myReports: () =>
    apiGet<Array<Pick<StudentReport, "id" | "periodLabel" | "level" | "publishedAt"> & { teacher?: { id: string; fullName: string } | null }>>(
      "/learning/my/reports",
    ),
  myReport: (id: string) => apiGet<StudentReport>(`/learning/my/reports/${id}`),
  checkpoint: (id: string) => apiGet<CheckpointV2>(`/learning/checkpoints/${id}`),
  submitCheckpoint: (id: string, answers: Record<string, unknown>) =>
    apiPost<CheckpointSubmitResult>(`/learning/checkpoints/${id}/submit`, { answers }),
};

/** Corrida de nómina de un profesor en un período. */
export type PayrollRun = {
  id: string;
  period: string;
  teacherId: string;
  classes: number;
  rateCop: number;
  /** Calculado: clases × tarifa (sin el ajuste). */
  amountCop: number;
  adjustmentCop: number;
  adjustmentNote: string | null;
  status: "pending" | "paid";
  paidMethod: "wompi" | "manual" | null;
  payoutRef: string | null;
  payoutError: string | null;
  paidAt: string | null;
  teacher: { id: string; fullName: string; email: string } | null;
};

/** Módulo con el estado de cada lección para un estudiante concreto. */
export type StudentLessonPlan = {
  moduleId: string;
  title: string;
  unit: number | null;
  level: string;
  lessons: Array<{
    lessonId: string;
    title: string;
    isCheckpoint: boolean;
    unlocked: boolean;
    unlockedAt: string | null;
    completedAt: string | null;
    /** 0..1 — cuánto se recorrió de la lección con este estudiante. */
    progreso?: number;
  }>;
};

/** Estado de una compuerta de checkpoint para un estudiante. */
export type CheckpointGate = {
  lessonId: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  unit: number | null;
  level: string;
  completedAt: string | null;
  unlocked: boolean;
  unlockedAt: string | null;
  unlockedBy: { id: string; fullName: string; email: string } | null;
  note: string | null;
};

// ─── Checkpoints v2 ────────────────────────────────────────────────────
export type CheckpointSettings = {
  allowRetryAfterPass: boolean;
  maxAttempts: number | null;
  cooldownHours: number | null;
  shuffleQuestions: boolean;
  showAnswers: boolean;
  timeLimitMin: number | null;
};
export type CheckpointAttemptState = {
  attemptCount: number;
  remainingAttempts: number | null;
  passed: boolean;
  lastScore: number | null;
  lastAt: string | null;
  bestScore: number | null;
  canAttempt: boolean;
  blockReason: "already_passed" | "max_attempts" | "cooldown" | null;
  retryAt: string | null;
};
export type CheckpointV2 = {
  id: string;
  moduleId: string;
  fromLevel: EnglishLevel;
  toLevel: EnglishLevel;
  passingScore: number;
  questions: import("@/components/app/checkpoint/QuestionRenderers").PublicQuestion[];
  settings: CheckpointSettings;
  myAttempts: CheckpointAttemptState;
};
export type CheckpointSubmitResult = {
  attemptId: string;
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  passingScore: number;
  feedback: Array<{ id: string; correct: boolean; given: string; expected?: string }>;
  showAnswers: boolean;
  canRetry: boolean;
  blockReason: string | null;
  retryAt: string | null;
  remainingAttempts: number | null;
};

// ─── Teachers ──────────────────────────────────────────────────────────
// ─── Actividades de lecciones (formato estándar FreaknActivity) ────────
export type ActivityAnswer = { id: string; question?: string; answer?: unknown; correct?: boolean; expected?: unknown };
export type ActivityResultInput = {
  activityId: string;
  title?: string;
  score?: number;
  maxScore?: number;
  answers?: ActivityAnswer[];
  /** Alumno dueño del resultado cuando lo reporta el profe dando la clase. */
  studentId?: string;
  /**
   * `true` = la actividad se empezó de cero (se reemplaza y sube el contador de
   * intentos); `false` = se viene retomando y el servidor mezcla con lo ya
   * guardado. Lo sabe el visor, no el contenido de la lección.
   */
  nuevaCorrida?: boolean;
};
export type ActivityResultRow = {
  id: string;
  lessonId: string;
  activityId: string;
  title: string | null;
  score: number | null;
  maxScore: number | null;
  attempts: number;
  updatedAt: string;
  answers?: ActivityAnswer[];
  lesson?: { id: string; title: string; module: { id: string; title: string; level: string } };
};

export const teachersApi = {
  students: () => apiGet<any[]>("/teacher/students"),
  studentDetail: (id: string) => apiGet<any>(`/teacher/students/${id}`),
  schedule: (status?: "upcoming" | "past" | "pending" | "frozen") =>
    apiGet<ClassSession[]>("/teacher/schedule", status ? { status } : undefined),
  addNote: (classId: string, notes: string) =>
    apiPost<any>(`/teacher/classes/${classId}/notes`, { notes }),
  addStudentNote: (studentId: string, notes: string) =>
    apiPost<any>(`/teacher/students/${studentId}/notes`, { notes }),
  setMeetingUrl: (studentId: string, url: string | null) =>
    apiPatch<{ id: string; meetingUrl: string | null }>(`/teacher/students/${studentId}/meeting-url`, { url }),
  studentActivityResults: (studentId: string) =>
    apiGet<ActivityResultRow[]>(`/teacher/students/${studentId}/activity-results`),
  // Plan de contenido: qué lecciones tiene habilitadas el estudiante
  lessonPlan: (studentId: string) =>
    apiGet<StudentLessonPlan[]>(`/teacher/students/${studentId}/lesson-plan`),
  setLessonUnlocks: (studentId: string, lessonIds: string[], unlock: boolean) =>
    apiPost<{ ok: boolean; afectadas: number }>(`/teacher/students/${studentId}/lesson-unlocks`, { lessonIds, unlock }),
  // Compuertas de checkpoint: estado y habilitación por estudiante
  checkpointGates: (studentId: string) =>
    apiGet<CheckpointGate[]>(`/teacher/students/${studentId}/checkpoint-gates`),
  setCheckpointGate: (studentId: string, lessonId: string, unlock: boolean, note?: string) =>
    apiPost<{ id: string }>(`/teacher/students/${studentId}/checkpoint-gates/${lessonId}`, { unlock, note }),
  studentCheckpointAttempts: (studentId: string) =>
    apiGet<Array<{
      id: string; score: number; passed: boolean; createdAt: string;
      answers: { given?: Record<string, unknown>; feedback?: Array<{ id: string; correct: boolean; given: string; expected?: string }> } | Record<string, unknown>;
      checkpoint: { id: string; fromLevel: string; toLevel: string; passingScore: number; module: { id: string; title: string } | null } | null;
    }>>(`/teacher/students/${studentId}/checkpoint-attempts`),
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
  rescheduleClass: (id: string, startsAt: string, scope: "once" | "forever", permitirCruce = false) =>
    apiPost<any>(`/teacher/classes/${id}/reschedule`, { startsAt, scope, permitirCruce }),
  myAvailability: () =>
    apiGet<Array<{ id: string; weekday: number; startsAt: string; endsAt: string }>>(
      "/teacher/availability",
    ),
  /** Franjas que ya tienen estudiante, con las horas que abarca cada clase. */
  myOccupiedSlots: () =>
    apiGet<
      Array<{
        weekday: number;
        hour: number;
        durationMin: number;
        studentId: string | null;
        studentName: string | null;
        hours: number[];
      }>
    >("/teacher/occupied-slots"),
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
  /**
   * Material extra: HTMLs de apoyo que sube el admin. Solo profes y admin.
   * Filtrar por `level` trae también el material sin nivel, que sirve para los
   * tres.
   */
  resources: (level?: EnglishLevel) =>
    apiGet<Array<{ id: string; title: string; description: string | null; objective: string | null; category: string | null; level: EnglishLevel | null; updatedAt: string }>>(
      "/teacher/resources",
      level ? { level } : undefined,
    ),
  resource: (id: string) =>
    apiGet<{ id: string; title: string; description: string | null; objective: string | null; category: string | null; level: EnglishLevel | null; contentHtml: string }>(
      `/teacher/resources/${id}`,
    ),

  // ── Material para un estudiante concreto (links y PDFs) ──────────────────
  signStudentUpload: (studentId: string, filename: string, contentType: string) =>
    apiPost<{ uploadUrl: string; publicUrl: string; storageKey: string; expiresIn: number }>(
      `/teacher/students/${studentId}/uploads/sign`,
      { filename, contentType },
    ),
  studentResources: (studentId: string) =>
    apiGet<StudentResource[]>(`/teacher/students/${studentId}/resources`),
  createStudentResources: (body: {
    studentIds: string[];
    kind: "link" | "file";
    title: string;
    description?: string | null;
    url: string;
    storageKey?: string | null;
    contentType?: string | null;
    sizeBytes?: number | null;
  }) => apiPost<{ ok: boolean; creados: number }>("/teacher/student-resources", body),
  deleteStudentResource: (id: string) =>
    apiDelete<{ ok: boolean }>(`/teacher/student-resources/${id}`),

  // ── Reportes de progreso ────────────────────────────────────────────────
  studentReports: (studentId: string) =>
    apiGet<StudentReport[]>(`/teacher/students/${studentId}/reports`),
  reportDraft: (studentId: string, from: string, to: string) =>
    apiGet<{ level: EnglishLevel | null; classesTaken: number; classesTotal: number }>(
      `/teacher/students/${studentId}/report-draft`,
      { from, to },
    ),
  saveReport: (body: {
    id?: string;
    studentId: string;
    periodLabel: string;
    level?: EnglishLevel | null;
    classesTaken?: number | null;
    classesTotal?: number | null;
    strengths?: string | null;
    improvements?: string | null;
    recommendation?: string | null;
    comment?: string | null;
    publish?: boolean;
  }) => apiPost<StudentReport>("/teacher/reports", body),
};

/** Material que un profesor le deja a un estudiante concreto. */
export type StudentResource = {
  id: string;
  kind: "link" | "file";
  title: string;
  description: string | null;
  url: string;
  storageKey?: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  teacher?: { id: string; fullName: string } | null;
};

/** Reporte de progreso. Sin `publishedAt` es un borrador del profe. */
export type StudentReport = {
  id: string;
  periodLabel: string;
  level: EnglishLevel | null;
  classesTaken: number | null;
  classesTotal: number | null;
  strengths: string | null;
  improvements: string | null;
  recommendation: string | null;
  comment: string | null;
  publishedAt: string | null;
  createdAt: string;
  teacher?: { id: string; fullName: string } | null;
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
  saveCheckpoint: (body: { id?: string; moduleId: string; fromLevel: string; toLevel: string; passingScore?: number; questions?: unknown; settings?: unknown }) =>
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
  abandonedCarts: () =>
    apiGet<{
      carts: Array<{
        intentId: string; email: string; fullName: string; phone: string | null;
        planName: string; amountInCents: number; currency: string; createdAt: string;
        userId: string | null; reminder: { status: string; at: string } | null;
      }>;
      registered: Array<{
        userId: string; email: string; fullName: string; phone: string | null;
        createdAt: string; lastLoginAt: string | null; reminder: { status: string; at: string } | null;
      }>;
    }>("/admin/carts"),
  sendCartReminder: (body: { intentId?: string; userId?: string }) =>
    apiPost<any>("/admin/carts/remind", body),
  scheduleHealth: () =>
    apiGet<{
      revisados: number;
      afectados: Array<{
        id: string;
        fullName: string;
        email: string;
        profesor: string | null;
        vigenteHasta: string | null;
        franjasActivas: number;
        franjasRetenidas: number;
        clasesFuturas: number;
        clasesRecuperables: number;
        reparable: boolean;
        problemas: string[];
      }>;
    }>("/admin/schedule-health"),
  repairSchedules: (ids?: string[]) =>
    apiPost<{
      reparados: number;
      resultados: Array<{ id: string; fullName: string; ok: boolean; detalle: string }>;
    }>("/admin/schedule-health/repair", { ids }),

  cleanupPreview: () => apiGet<Record<string, number>>("/admin/cleanup"),
  cleanup: (targets: string[]) =>
    apiPost<{ ok: boolean; deleted: Record<string, number> }>("/admin/cleanup", { targets }),
  siteContent: () => apiGet<SiteContentOverrides>("/admin/settings/site"),
  updateSiteContent: (body: {
    media?: Record<string, string | null>;
    faqs?: SiteFaq[] | null;
    legal?: Record<string, string | null>;
    social?: Record<string, string | null>;
    testimonials?: Record<string, SiteTestimonial | null>;
  }) => apiPatch<SiteContentOverrides>("/admin/settings/site", body),
  // ─── Explorador de storage (MinIO/S3) ────────────────────────────────
  storageList: (params: { prefix?: string; cursor?: string } = {}) =>
    apiGet<{
      items: Array<{ key: string; size: number; lastModified: string | null; url: string }>;
      nextCursor: string | null;
      folders: string[];
    }>("/admin/storage", params as any),
  storageSign: (body: { filename: string; contentType?: string; folder?: string }) =>
    apiPost<{ uploadUrl: string; publicUrl: string; storageKey: string }>("/admin/storage/sign", body),
  storageRename: (from: string, to: string) =>
    apiPatch<{ key: string; url: string }>("/admin/storage/rename", { from, to }),
  storageDelete: (keys: string[]) =>
    apiPost<{ ok: boolean; eliminados: number }>("/admin/storage/delete", { keys }),
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
  /** `eliminados`: incluye las cuentas ocultas, para poder revisarlas o revertir. */
  users: (q?: string, eliminados = false) =>
    apiGet<User[]>("/admin/users", {
      ...(q ? { q } : {}),
      ...(eliminados ? { eliminados: "1" } : {}),
    }),
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
        /** Pares de clases pagables que se pisan en el tiempo (reposiciones). */
        clasesCruzadas?: number;
      }>
    >("/admin/payroll", { period }),
  payrollCsv: (period: string) =>
    apiGet<string>(`/admin/payroll/export.csv`, { period }),
  // Nómina · corridas persistidas (generar → ajustar → pagar)
  payrollRuns: (period: string) => apiGet<PayrollRun[]>("/admin/payroll/runs", { period }),
  generatePayroll: (period: string) => apiPost<PayrollRun[]>(`/admin/payroll/generate?period=${period}`, {}),
  payPayrollRun: (id: string) =>
    apiPost<PayrollRun & { dispersed: boolean; reference?: string; error?: string }>(
      `/admin/payroll/runs/${id}/pay`, {},
    ),
  adjustPayrollRun: (id: string, adjustmentCop: number, note: string) =>
    apiPatch<PayrollRun>(`/admin/payroll/runs/${id}/adjust`, { adjustmentCop, note }),
  payAllPayroll: (period: string) =>
    apiPost<{ periodo: string; intentados: number; pagados: number; fallidos: number; totalCop: number }>(
      `/admin/payroll/pay-all?period=${period}`, {},
    ),
  setPayoutAccount: (teacherId: string, body: { bankCode?: string; accountType?: string; accountNumber?: string } | null) =>
    apiPatch<{ id: string }>(`/admin/teachers/${teacherId}/payout-account`, body),
  payrollSettings: () => apiGet<{ hourlyRateCop: number }>("/admin/settings/payroll"),
  setPayrollSettings: (hourlyRateCop: number) =>
    apiPatch<{ hourlyRateCop: number }>("/admin/settings/payroll", { hourlyRateCop }),
  content: () => apiGet<LearningModule[]>("/admin/content"),
  createModule: (body: { id?: string; level: "beginner" | "intermediate" | "advanced"; title: string; summary?: string; position?: number; unit?: number | null }) =>
    apiPost<any>("/admin/content/modules", body),
  updateModule: (id: string, body: { level?: "beginner" | "intermediate" | "advanced"; title?: string; summary?: string; position?: number; unit?: number | null }) =>
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
    role: "student" | "teacher" | "admin";
    /** Roles adicionales al principal (p. ej. un admin que también da clases). */
    extraRoles?: Array<"student" | "teacher" | "admin">;
    level?: "beginner" | "intermediate" | "advanced";
    /** Empalme: activa el plan manualmente (pagos por fuera de Wompi). */
    plan?: { planId: string; endDate: string; startDate?: string | null };
    /** Horario semanal del estudiante (mismas reglas que el checkout). */
    schedule?: SlotRef[];
    /** Profesor a asignar de una vez. Requiere `schedule`. */
    teacherId?: string;
    /** Minutos por clase (planes internos tipo 2×75); ausente = 50. */
    classDurationMin?: number;
  }) => apiPost<{ user: User; link?: string }>("/admin/users", body),
  setSubscription: (
    id: string,
    body: {
      planId: string;
      status?: "pending" | "active" | "past_due" | "canceled" | "expired" | "paused";
      currentPeriodEnd?: string | null;
      startedAt?: string | null;
    },
  ) => apiPatch<any>(`/admin/users/${id}/subscription`, body),
  /** Congela el plan: borra clases futuras y libera la franja del profesor. */
  pauseSubscription: (id: string, reason?: string) =>
    apiPatch<{ subscription: any; classesRemoved: number; slotsFreed: number }>(
      `/admin/users/${id}/subscription/pause`,
      { reason },
    ),
  /** Reanuda y devuelve los días pausados para ajustar el vencimiento a mano. */
  resumeSubscription: (id: string) =>
    apiPatch<{ subscription: any; daysPaused: number; slotsRestored: number }>(
      `/admin/users/${id}/subscription/resume`,
      {},
    ),
  resources: () =>
    apiGet<Array<{ id: string; title: string; description: string | null; objective: string | null; category: string | null; level: EnglishLevel | null; position: number; published: boolean; updatedAt: string }>>(
      "/admin/resources",
    ),
  resource: (id: string) =>
    apiGet<{ id: string; title: string; description: string | null; objective: string | null; category: string | null; level: EnglishLevel | null; contentHtml: string; position: number; published: boolean }>(
      `/admin/resources/${id}`,
    ),
  createResource: (body: { title: string; description?: string | null; objective?: string | null; category?: string | null; level?: EnglishLevel | null; contentHtml: string; position?: number; published?: boolean }) =>
    apiPost<any>("/admin/resources", body),
  updateResource: (id: string, body: Partial<{ title: string; description: string | null; objective: string | null; category: string | null; level: EnglishLevel | null; contentHtml: string; position: number; published: boolean }>) =>
    apiPatch<any>(`/admin/resources/${id}`, body),
  deleteResource: (id: string) => apiPatch<{ ok: boolean }>(`/admin/resources/${id}/delete`, {}),
  updateUser: (id: string, body: Partial<{ fullName: string; phone: string; email: string; role: "student" | "teacher" | "admin"; extraRoles: Array<"student" | "teacher" | "admin">; englishLevel: "beginner" | "intermediate" | "advanced" | null; classDurationMin: number | null }>) =>
    apiPatch<User>(`/admin/users/${id}`, body),
  setUserStatus: (id: string, disabled: boolean) =>
    apiPatch<User>(`/admin/users/${id}/status`, { disabled }),
  softDeleteUser: (id: string) => apiPatch<User>(`/admin/users/${id}/delete`, {}),
  resetPassword: (id: string) => apiPost<{ ok: true; link?: string; expiresAt?: string }>(`/admin/users/${id}/reset-password`),
  resetNps: (id: string) => apiPost<{ ok: true }>(`/admin/users/${id}/surveys/reset`),
  requestNps: (id: string) => apiPost<{ ok: true }>(`/admin/users/${id}/nps/request`),
  surveys: (opts: { filter?: "all" | "promoters" | "detractors"; month?: string; orderBy?: "recent" | "oldest" | "score_desc" | "score_asc" } = {}) =>
    apiGet<{
      rows: Array<{
        id: string;
        score: number;
        teacherScore: number | null;
        contentScore: number | null;
        platformScore: number | null;
        comment: string | null;
        createdAt: string;
        period: string;
        user: { id: string; fullName: string; email: string; role: string };
      }>;
      totals: { count: number; promoters: number; detractors: number; nps: number | null };
      periods: string[];
    }>("/admin/surveys", {
      ...(opts.filter ? { filter: opts.filter } : {}),
      ...(opts.month ? { month: opts.month } : {}),
      ...(opts.orderBy ? { orderBy: opts.orderBy } : {}),
    }),
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
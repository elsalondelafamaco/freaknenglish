/**
 * Tipos del dominio FreaknEnglish.
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
  | "pending"
  | "expired"
  /** Congelado por el admin: sin clases generadas y con la franja liberada. */
  | "paused";

export type PlanId = "2-dias" | "3-dias" | "4-dias" | "5-dias";

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  phone?: string;
  documentNumber?: string;
  roles: AppRole[];
  level?: EnglishLevel;
  /** Minutos por clase del estudiante; ausente = estándar (50). */
  classDurationMin?: number;
  /** Onboarding completado (nivelación + horario inicial). */
  onboardedAt?: string;
  /** Profesor asignado (sólo aplica a estudiantes). */
  assignedTeacherId?: string;
  /** Bloques semanales elegidos en onboarding. */
  schedulePreferences?: Array<{ weekday: number; hour: number }>;
  /** Estado del onboarding de horario. */
  scheduleAssignmentStatus?: "auto_assigned" | "manual_pending";
  /** Link de Meet/Zoom para las clases (lo asigna el profesor). */
  meetingUrl?: string;
  /** Si está definido, el usuario está deshabilitado y no puede iniciar sesión. */
  disabledAt?: string;
  /** Soft delete. */
  deletedAt?: string;
  /** Último login exitoso (ISO). */
  lastLoginAt?: string;
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
  /** Momento en que el admin congeló el plan; base para calcular los días. */
  pausedAt?: string | null;
  pauseReason?: string | null;
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

// ============================================================================
// Fase 4 — Portal Estudiante
// ============================================================================

export type ClassStatus = "scheduled" | "completed" | "canceled" | "missed";

export interface ClassSession {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  /** ISO start datetime. */
  startsAt: string;
  /** Duration in minutes. Standard is 50; some students have custom durations. */
  durationMin: number;
  status: ClassStatus;
  /** When the student confirmed attendance. */
  studentConfirmedAt?: string;
  /** When the teacher validated it (cross-check). */
  teacherValidatedAt?: string;
  topic?: string;
  meetingUrl?: string;
}

export type LessonKind = "video" | "pdf" | "slides" | "download" | "html";

export interface Lesson {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  kind: LessonKind;
  /** External URL: YouTube/Vimeo embed, PDF link, slides HTML, or downloadable asset. */
  url?: string;
  estMinutes?: number;
  /** HTML enriquecido renderizable (sanitizado en cliente). */
  contentHtml?: string;
  /** Notas internas del profe / instrucciones para el estudiante. */
  notes?: string;
  /** Archivos adjuntos subidos a MinIO/S3. */
  attachments?: { name: string; url: string; size?: number }[];
  /** Compuerta: bloquea todo lo que va después hasta completarla. */
  isCheckpoint?: boolean;
  /** El backend lo calcula por estudiante; si está bloqueada no llega el HTML. */
  locked?: boolean;
  /** `espera_desbloqueo` (falta que el profe lo habilite) | `checkpoint_pendiente`. */
  lockReason?: "espera_desbloqueo" | "checkpoint_pendiente" | null;
}

export interface LearningModule {
  id: string;
  level: EnglishLevel;
  order: number;
  title: string;
  summary: string;
  coverEmoji: string;
  lessons: Lesson[];
  /** If present, completing all lessons unlocks this checkpoint. */
  checkpointId?: string;
  /** Módulo entero bloqueado por un checkpoint pendiente más arriba. */
  locked?: boolean;
  /** Unidad a la que pertenece dentro del nivel. */
  unit?: number | null;
}

export interface LessonProgress {
  /** Key: `${userId}:${lessonId}`. */
  userId: string;
  lessonId: string;
  completedAt: string;
}

export interface Checkpoint {
  id: string;
  level: EnglishLevel;
  title: string;
  /** Level unlocked after passing. */
  unlocksLevel: EnglishLevel;
  questions: CheckpointQuestion[];
  passScore: number; // 0..questions.length
}

export interface CheckpointQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface CheckpointAttempt {
  id: string;
  userId: string;
  checkpointId: string;
  score: number;
  passed: boolean;
  takenAt: string;
}

export interface SatisfactionSurvey {
  id: string;
  userId: string;
  /** YYYY-MM. */
  monthKey: string;
  nps: number; // 0..10
  /** 1..5 — calidad del profesor. */
  teacherScore?: number;
  /** 1..5 — calidad del contenido. */
  contentScore?: number;
  /** 1..5 — experiencia con la plataforma. */
  platformScore?: number;
  comment?: string;
  submittedAt: string;
}

// ============================================================================
// Fase 5 — Portal Profesor
// ============================================================================

/** Nota privada del profesor sobre una clase / estudiante. */
export interface ClassNote {
  id: string;
  classId?: string;
  studentId: string;
  teacherId: string;
  body: string;
  /** Calidad de la sesión percibida por el profesor (1..5). */
  rating?: number;
  createdAt: string;
}
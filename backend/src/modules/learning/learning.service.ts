import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import {
  CheckpointQuestion,
  gradeQuestion,
  parseSettings,
  sanitizeQuestion,
} from './checkpoint-questions'

@Injectable()
export class LearningService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  listModules(level?: 'beginner' | 'intermediate' | 'advanced') {
    return this.prisma.module.findMany({
      where: level ? { level } : undefined,
      orderBy: [{ level: 'asc' }, { position: 'asc' }],
      include: { lessons: { orderBy: { position: 'asc' } } },
    })
  }

  /**
   * Resuelve el nivel efectivo del usuario si no se pasó filtro explícito.
   * Estudiantes → siempre filtrados por su `englishLevel`; admin/teacher
   * sin nivel asignado → todos los módulos.
   */
  async listModulesForUser(
    userId: string,
    level?: 'beginner' | 'intermediate' | 'advanced',
  ) {
    let effective = level
    if (!effective) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { englishLevel: true, role: true },
      })
      if (u?.role === 'student' && u.englishLevel) {
        effective = u.englishLevel as 'beginner' | 'intermediate' | 'advanced'
      }
    }
    return this.listModules(effective)
  }

  module(id: string) {
    return this.prisma.module.findUnique({
      where: { id },
      include: { lessons: { orderBy: { position: 'asc' } }, checkpoints: true },
    })
  }

  // ─── Resultados de actividades (bridge FreaknActivity) ───────────────

  /**
   * Guarda el resultado de una actividad interactiva. Un registro por
   * (user, lesson, activity); re-intentos actualizan y suman `attempts`.
   */
  async saveActivityResult(
    userId: string,
    lessonId: string,
    body: { activityId: string; title?: string; score?: number; maxScore?: number; answers?: unknown[] },
  ) {
    const activityId = String(body.activityId ?? '').trim()
    if (!activityId) throw new Error('activityId requerido')
    const answers = (Array.isArray(body.answers) ? body.answers : []) as any[]
    const data = {
      title: body.title ?? undefined,
      score: typeof body.score === 'number' ? Math.round(body.score) : null,
      maxScore: typeof body.maxScore === 'number' ? Math.round(body.maxScore) : null,
      answers: answers as any,
    }
    // Las lecciones reportan PROGRESIVAMENTE (cada respuesta re-envía el
    // acumulado). Solo cuenta como intento nuevo cuando el envío trae MENOS
    // respuestas que lo guardado (el estudiante empezó la actividad de cero).
    const key = { userId_lessonId_activityId: { userId, lessonId, activityId } }
    const existing = await this.prisma.activityResult.findUnique({ where: key })
    const prevCount = Array.isArray(existing?.answers) ? (existing!.answers as any[]).length : 0
    const isNewRun = !!existing && answers.length < prevCount
    return this.prisma.activityResult.upsert({
      where: key,
      update: { ...data, ...(isNewRun ? { attempts: { increment: 1 } } : {}) },
      create: { userId, lessonId, activityId, ...data },
    })
  }

  /** Resultados del propio estudiante (para pintar estado en el viewer). */
  myActivityResults(userId: string, lessonId?: string) {
    return this.prisma.activityResult.findMany({
      where: { userId, ...(lessonId ? { lessonId } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, lessonId: true, activityId: true, title: true,
        score: true, maxScore: true, attempts: true, updatedAt: true,
      },
    })
  }

  /**
   * Resultados de un estudiante con contexto (lección + módulo) — lo usan el
   * admin (todos) y el profesor (sus estudiantes; la autorización la valida
   * el caller).
   */
  activityResultsOfStudent(studentId: string) {
    return this.prisma.activityResult.findMany({
      where: { userId: studentId },
      orderBy: { updatedAt: 'desc' },
      include: {
        lesson: { select: { id: true, title: true, module: { select: { id: true, title: true, level: true } } } },
      },
    })
  }

  /**
   * Devuelve el checkpoint SIN correctIndex en las preguntas: exponer la
   * respuesta correcta permitiria hacer trampa. La calificacion es server-side
   * en submitCheckpoint leyendo las respuestas desde la BD.
   */
  /**
   * Estado de intentos del usuario sobre un checkpoint según su settings:
   * cuántos lleva, si aprobó, si puede intentar ahora y por qué no.
   */
  private async attemptState(userId: string, cp: { id: string; settings: unknown }) {
    const s = parseSettings(cp.settings)
    const attempts = await this.prisma.checkpointAttempt.findMany({
      where: { userId, checkpointId: cp.id },
      orderBy: { createdAt: 'desc' },
    })
    const passed = attempts.some((a) => a.passed)
    const last = attempts[0] ?? null
    let canAttempt = true
    let blockReason: string | null = null
    let retryAt: Date | null = null
    if (passed && !s.allowRetryAfterPass) {
      canAttempt = false
      blockReason = 'already_passed'
    } else if (s.maxAttempts != null && attempts.length >= s.maxAttempts) {
      canAttempt = false
      blockReason = 'max_attempts'
    } else if (s.cooldownHours != null && last) {
      const next = new Date(last.createdAt.getTime() + s.cooldownHours * 3600_000)
      if (next.getTime() > Date.now()) {
        canAttempt = false
        blockReason = 'cooldown'
        retryAt = next
      }
    }
    return {
      settings: s,
      attemptCount: attempts.length,
      remainingAttempts: s.maxAttempts != null ? Math.max(0, s.maxAttempts - attempts.length) : null,
      passed,
      lastScore: last?.score ?? null,
      lastAt: last?.createdAt ?? null,
      bestScore: attempts.reduce<number | null>((b, a) => (b == null || a.score > b ? a.score : b), null),
      canAttempt,
      blockReason,
      retryAt,
    }
  }

  /** Checkpoint listo para presentar: preguntas sin respuestas + estado de intentos. */
  async checkpoint(id: string, userId: string) {
    const cp = await this.prisma.checkpoint.findUnique({ where: { id } })
    if (!cp) return null
    const state = await this.attemptState(userId, cp)
    let questions = (Array.isArray(cp.questions) ? (cp.questions as CheckpointQuestion[]) : []).map(sanitizeQuestion)
    if (state.settings.shuffleQuestions) {
      questions = questions
        .map((q) => [Math.random(), q] as const)
        .sort((a, b) => a[0] - b[0])
        .map(([, q]) => q)
    }
    const { settings: _raw, ...rest } = cp as any
    return { ...rest, questions, settings: state.settings, myAttempts: state }
  }

  async userProgress(userId: string) {
    const [progress, attempts] = await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { userId } }),
      this.prisma.checkpointAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ])
    return {
      lessonsCompleted: progress.filter((p) => p.completedAt).length,
      completedLessonIds: progress.filter((p) => p.completedAt).map((p) => p.lessonId),
      totalSecondsWatched: progress.reduce((s, p) => s + (p.secondsWatched ?? 0), 0),
      checkpointsPassed: attempts.filter((a) => a.passed).map((a) => a.checkpointId),
      attempts,
    }
  }

  /** Checkpoint del nivel (por fromLevel), sanitizado + estado de intentos. */
  async levelCheckpoint(level: 'beginner' | 'intermediate' | 'advanced', userId: string) {
    const cp = await this.prisma.checkpoint.findFirst({
      where: { fromLevel: level as any },
      orderBy: { id: 'asc' },
    })
    if (!cp) return null
    return this.checkpoint(cp.id, userId)
  }

  upsertProgress(userId: string, lessonId: string, secondsWatched: number, completed: boolean) {
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { secondsWatched, completedAt: completed ? new Date() : null },
      create: { userId, lessonId, secondsWatched, completedAt: completed ? new Date() : null },
    })
  }

  /**
   * Envío de checkpoint v2: valida gating (reintentos/cooldown), califica por
   * tipo de pregunta server-side y guarda el intento con feedback detallado
   * (visible para profesor/admin siempre; para el estudiante según settings).
   */
  async submitCheckpoint(userId: string, checkpointId: string, answers: Record<string, unknown>) {
    const cp = await this.prisma.checkpoint.findUniqueOrThrow({ where: { id: checkpointId } })
    const state = await this.attemptState(userId, cp)
    if (!state.canAttempt) {
      const msg =
        state.blockReason === 'already_passed'
          ? 'Ya aprobaste este checkpoint.'
          : state.blockReason === 'max_attempts'
            ? 'Alcanzaste el máximo de intentos permitidos.'
            : `Debes esperar para volver a intentarlo (disponible ${state.retryAt?.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}).`
      throw new ForbiddenException({ statusCode: 403, message: msg, code: state.blockReason })
    }
    const questions = (Array.isArray(cp.questions) ? (cp.questions as CheckpointQuestion[]) : [])
    if (questions.length === 0) throw new BadRequestException('Checkpoint sin preguntas')

    const feedback = questions.map((q) => gradeQuestion(q, (answers ?? {})[q.id]))
    const total = questions.length
    const correct = feedback.filter((f) => f.correct).length
    const score = Math.round((correct / total) * 100)
    const passed = score >= cp.passingScore
    const attempt = await this.prisma.checkpointAttempt.create({
      // `answers` guarda lo respondido + la corrección: profesor/admin lo ven completo.
      data: { userId, checkpointId, score, passed, answers: { given: answers, feedback } as any },
    })
    if (passed) {
      await this.prisma.user.update({ where: { id: userId }, data: { englishLevel: cp.toLevel } })
      const levelLabel: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' }
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
      if (u) {
        await this.notifications.enqueue({
          userId,
          toEmail: u.email,
          template: 'level_up',
          subject: '¡Subiste de nivel!',
          dedupeKey: `levelup:${userId}:${cp.toLevel}`,
          vars: { level: levelLabel[cp.toLevel] ?? cp.toLevel },
          type: 'learning',
          title: '¡Subiste de nivel!',
          body: `Avanzaste a ${levelLabel[cp.toLevel] ?? cp.toLevel}.`,
          linkUrl: '/app/learning',
        })
      }
    }
    // Feedback al estudiante: si showAnswers está apagado, sin `expected`.
    const s = state.settings
    const studentFeedback = s.showAnswers
      ? feedback
      : feedback.map(({ expected: _e, ...rest }) => rest)
    const after = await this.attemptState(userId, cp)
    return {
      attemptId: attempt.id,
      score,
      passed,
      correct,
      total,
      passingScore: cp.passingScore,
      feedback: studentFeedback,
      showAnswers: s.showAnswers,
      canRetry: after.canAttempt,
      blockReason: after.blockReason,
      retryAt: after.retryAt,
      remainingAttempts: after.remainingAttempts,
    }
  }
}

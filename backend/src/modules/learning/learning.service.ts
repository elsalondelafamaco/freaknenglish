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
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { englishLevel: true, role: true },
    })
    if (!effective && u?.role === 'student' && u.englishLevel) {
      effective = u.englishLevel as 'beginner' | 'intermediate' | 'advanced'
    }
    const modules = await this.listModules(effective)
    if (u?.role !== 'student') return modules

    // Anota el bloqueo de cada lección y NO manda el HTML de las bloqueadas.
    const { state } = await this.gatingFor(userId, effective)
    return modules.map((m) => {
      const lessons = m.lessons.map((l) => {
        const s = state.get(l.id) ?? { locked: false, reason: null, blockedBy: null }
        return {
          ...l,
          contentHtml: s.locked ? null : l.contentHtml,
          locked: s.locked,
          lockReason: s.reason,
        }
      })
      return { ...m, lessons, locked: lessons.length > 0 && lessons.every((l) => l.locked) }
    })
  }

  module(id: string) {
    return this.prisma.module.findUnique({
      where: { id },
      include: { lessons: { orderBy: { position: 'asc' } }, checkpoints: true },
    })
  }

  // ─── Compuertas por checkpoint ───────────────────────────────────────
  //
  // Regla: el contenido es una secuencia (módulos por posición, lecciones por
  // posición dentro del módulo). Una lección marcada `isCheckpoint` es una
  // compuerta:
  //   · Mientras el estudiante no la complete, TODO lo que va después queda
  //     bloqueado — el resto del módulo y los módulos siguientes.
  //   · El checkpoint en sí no se abre hasta que un profesor lo habilite
  //     (fila en CheckpointUnlock sin revocar), para que nadie se coma el
  //     programa entero de una sentada.

  /** Estado de bloqueo de cada lección para un estudiante. */
  private async gatingFor(userId: string, level?: 'beginner' | 'intermediate' | 'advanced') {
    const [modules, progress, unlocks] = await Promise.all([
      this.prisma.module.findMany({
        where: level ? { level } : undefined,
        orderBy: [{ level: 'asc' }, { position: 'asc' }],
        include: { lessons: { orderBy: { position: 'asc' } } },
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId, completedAt: { not: null } },
        select: { lessonId: true },
      }),
      this.prisma.checkpointUnlock.findMany({
        where: { userId, revokedAt: null },
        select: { lessonId: true },
      }),
    ])
    const completed = new Set(progress.map((p) => p.lessonId))
    const unlocked = new Set(unlocks.map((u) => u.lessonId))

    /** lessonId → { locked, reason, blockingLessonId } */
    const state = new Map<string, { locked: boolean; reason: string | null; blockedBy: string | null }>()
    let gate: { id: string; title: string; moduleTitle: string } | null = null

    for (const m of modules) {
      for (const l of m.lessons) {
        if (gate) {
          // Hay un checkpoint pendiente antes de esta lección.
          state.set(l.id, { locked: true, reason: 'checkpoint_pendiente', blockedBy: gate.id })
          continue
        }
        if (l.isCheckpoint && !completed.has(l.id)) {
          // El checkpoint solo se abre si el profe lo habilitó.
          const abierto = unlocked.has(l.id)
          state.set(l.id, {
            locked: !abierto,
            reason: abierto ? null : 'espera_desbloqueo',
            blockedBy: null,
          })
          gate = { id: l.id, title: l.title, moduleTitle: m.title }
          continue
        }
        state.set(l.id, { locked: false, reason: null, blockedBy: null })
      }
    }
    return { state, gate, completed, unlocked }
  }

  /** ¿Puede el usuario abrir el contenido de esta lección? */
  async assertLessonAccess(userId: string, lessonId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (user?.role !== 'student') return // profes y admin ven todo
    const { state } = await this.gatingFor(userId)
    const s = state.get(lessonId)
    if (s?.locked) {
      throw new ForbiddenException({
        statusCode: 403,
        code: s.reason,
        message:
          s.reason === 'espera_desbloqueo'
            ? 'Este checkpoint todavía no está habilitado. Tu profesor lo abre cuando estés listo.'
            : 'Completa el checkpoint pendiente para desbloquear el resto del contenido.',
      })
    }
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
    await this.assertLessonAccess(userId, lessonId)
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

  /**
   * Checkpoints de un estudiante con su estado, para el panel del profesor:
   * si ya lo completó, si está habilitado y quién lo habilitó.
   */
  async checkpointsForStudent(studentId: string) {
    const [lessons, progress, unlocks] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { isCheckpoint: true },
        orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
        include: { module: { select: { id: true, title: true, unit: true, level: true, position: true } } },
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId: studentId, completedAt: { not: null } },
        select: { lessonId: true, completedAt: true },
      }),
      this.prisma.checkpointUnlock.findMany({
        where: { userId: studentId },
        include: { unlockedBy: { select: { id: true, fullName: true, email: true } } },
      }),
    ])
    const done = new Map(progress.map((p) => [p.lessonId, p.completedAt]))
    const unlockMap = new Map(unlocks.map((u) => [u.lessonId, u]))
    return lessons.map((l) => {
      const u = unlockMap.get(l.id)
      const abierto = !!u && !u.revokedAt
      return {
        lessonId: l.id,
        title: l.title,
        moduleId: l.module.id,
        moduleTitle: l.module.title,
        unit: l.module.unit,
        level: l.module.level,
        completedAt: done.get(l.id) ?? null,
        unlocked: abierto,
        unlockedAt: abierto ? u!.createdAt : null,
        unlockedBy: abierto ? u!.unlockedBy : null,
        note: u?.note ?? null,
      }
    })
  }

  /** Habilita (o revoca) un checkpoint para un estudiante. */
  async setCheckpointUnlock(
    studentId: string,
    lessonId: string,
    grantedById: string,
    unlock: boolean,
    note?: string,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isCheckpoint: true, title: true },
    })
    if (!lesson) throw new BadRequestException('Lección no encontrada')
    if (!lesson.isCheckpoint) throw new BadRequestException('Esa lección no es un checkpoint')

    const row = await this.prisma.checkpointUnlock.upsert({
      where: { userId_lessonId: { userId: studentId, lessonId } },
      update: { revokedAt: unlock ? null : new Date(), unlockedById: grantedById, note: note ?? null },
      create: { userId: studentId, lessonId, unlockedById: grantedById, note: note ?? null },
    })

    if (unlock) {
      const student = await this.prisma.user.findUnique({
        where: { id: studentId },
        select: { email: true, fullName: true },
      })
      if (student) {
        await this.notifications.enqueue({
          userId: studentId,
          toEmail: student.email,
          template: 'checkpoint_unlocked',
          subject: '¡Tu checkpoint ya está habilitado!',
          dedupeKey: `cp-unlock:${studentId}:${lessonId}:${row.createdAt.toISOString()}`,
          vars: { fullName: student.fullName, checkpoint: lesson.title },
          type: 'learning',
          title: 'Checkpoint habilitado',
          body: `Ya puedes presentar: ${lesson.title}.`,
          linkUrl: '/app/learning',
        })
      }
    }
    return row
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

  async upsertProgress(userId: string, lessonId: string, secondsWatched: number, completed: boolean) {
    // No se puede marcar progreso sobre contenido bloqueado.
    await this.assertLessonAccess(userId, lessonId)
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

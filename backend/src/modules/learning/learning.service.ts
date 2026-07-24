import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

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

  /**
   * Devuelve el checkpoint SIN correctIndex en las preguntas: exponer la
   * respuesta correcta permitiria hacer trampa. La calificacion es server-side
   * en submitCheckpoint leyendo las respuestas desde la BD.
   */
  async checkpoint(id: string) {
    const cp = await this.prisma.checkpoint.findUnique({ where: { id } })
    if (!cp) return null
    const questions = Array.isArray(cp.questions)
      ? (cp.questions as any[]).map(({ correctIndex, ...rest }) => rest)
      : cp.questions
    return { ...cp, questions }
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

  /** Checkpoint del nivel (por fromLevel), sin correctIndex. */
  async levelCheckpoint(level: 'beginner' | 'intermediate' | 'advanced') {
    const cp = await this.prisma.checkpoint.findFirst({
      where: { fromLevel: level as any },
      orderBy: { id: 'asc' },
    })
    if (!cp) return null
    const questions = Array.isArray(cp.questions)
      ? (cp.questions as any[]).map(({ correctIndex, ...rest }) => rest)
      : cp.questions
    return { ...cp, questions }
  }

  upsertProgress(userId: string, lessonId: string, secondsWatched: number, completed: boolean) {
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { secondsWatched, completedAt: completed ? new Date() : null },
      create: { userId, lessonId, secondsWatched, completedAt: completed ? new Date() : null },
    })
  }

  async submitCheckpoint(userId: string, checkpointId: string, answers: Record<string, number>) {
    const cp = await this.prisma.checkpoint.findUniqueOrThrow({ where: { id: checkpointId } })
    const questions = cp.questions as Array<{ id: string; correctIndex: number }>
    const total = questions.length
    const correct = questions.filter((q) => answers[q.id] === q.correctIndex).length
    const score = Math.round((correct / total) * 100)
    const passed = score >= cp.passingScore
    const attempt = await this.prisma.checkpointAttempt.create({
      data: { userId, checkpointId, score, passed, answers },
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
    return attempt
  }
}

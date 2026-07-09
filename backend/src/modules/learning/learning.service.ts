import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class LearningService {
  constructor(private prisma: PrismaService) {}

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

  checkpoint(id: string) {
    return this.prisma.checkpoint.findUnique({ where: { id } })
  }

  async userProgress(userId: string) {
    const [progress, attempts] = await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { userId } }),
      this.prisma.checkpointAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ])
    return {
      lessonsCompleted: progress.filter((p) => p.completedAt).length,
      totalSecondsWatched: progress.reduce((s, p) => s + (p.secondsWatched ?? 0), 0),
      checkpointsPassed: attempts.filter((a) => a.passed).map((a) => a.checkpointId),
      attempts,
    }
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
    }
    return attempt
  }
}

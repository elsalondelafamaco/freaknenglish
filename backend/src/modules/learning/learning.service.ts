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

  module(id: string) {
    return this.prisma.module.findUnique({
      where: { id },
      include: { lessons: { orderBy: { position: 'asc' } }, checkpoints: true },
    })
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

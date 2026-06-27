import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class BoardService {
  constructor(private prisma: PrismaService) {}

  async ensureMember(boardId: string, userId: string) {
    const m = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    })
    if (!m) throw new ForbiddenException('Not a member of this board')
    return m
  }

  async create(ownerId: string, name: string) {
    return this.prisma.board.create({
      data: {
        name,
        ownerId,
        members: { create: { userId: ownerId, role: 'owner' } },
      },
      include: { members: true },
    })
  }

  async list(userId: string) {
    return this.prisma.board.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async get(boardId: string, userId: string) {
    await this.ensureMember(boardId, userId)
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
        ops: { orderBy: { seq: 'asc' } },
      },
    })
    if (!board) throw new NotFoundException()
    return board
  }

  /**
   * Append a CRDT/op-log entry. seq is monotonic per board (assigned by DB).
   * Returns the persisted op so the gateway can broadcast it.
   */
  async appendOp(input: { boardId: string; userId: string; op: unknown; clientOpId: string }) {
    await this.ensureMember(input.boardId, input.userId)
    // Idempotency: ignore if clientOpId already present
    const existing = await this.prisma.boardOp.findUnique({
      where: { boardId_clientOpId: { boardId: input.boardId, clientOpId: input.clientOpId } },
    })
    if (existing) return existing
    const last = await this.prisma.boardOp.findFirst({
      where: { boardId: input.boardId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    })
    const seq = (last?.seq ?? 0) + 1
    const op = await this.prisma.boardOp.create({
      data: {
        boardId: input.boardId,
        userId: input.userId,
        clientOpId: input.clientOpId,
        seq,
        op: input.op as any,
      },
    })
    await this.prisma.board.update({ where: { id: input.boardId }, data: { updatedAt: new Date() } })
    return op
  }

  async opsSince(boardId: string, userId: string, sinceSeq: number) {
    await this.ensureMember(boardId, userId)
    return this.prisma.boardOp.findMany({
      where: { boardId, seq: { gt: sinceSeq } },
      orderBy: { seq: 'asc' },
    })
  }

  async invite(boardId: string, ownerId: string, userId: string, role: 'editor' | 'viewer' = 'editor') {
    const m = await this.ensureMember(boardId, ownerId)
    if (m.role !== 'owner') throw new ForbiddenException('Only owner can invite')
    return this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId } },
      update: { role },
      create: { boardId, userId, role },
    })
  }
}

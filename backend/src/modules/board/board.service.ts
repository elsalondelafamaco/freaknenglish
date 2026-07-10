import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import * as Y from 'yjs'

@Injectable()
export class BoardService {
  private readonly SNAPSHOT_EVERY = 50
  constructor(private prisma: PrismaService, private storage: StorageService) {}

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

  async inviteByEmail(boardId: string, ownerId: string, email: string, role: 'editor' | 'viewer' = 'editor') {
    const u = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, select: { id: true, email: true, fullName: true } })
    if (!u) throw new NotFoundException('Usuario no encontrado. Debe registrarse primero.')
    await this.invite(boardId, ownerId, u.id, role)
    return { ok: true, user: u }
  }

  async signBoardUpload(
    boardId: string,
    userId: string,
    body: { filename: string; contentType?: string },
  ) {
    await this.ensureMember(boardId, userId)
    return this.storage.signUpload({
      filename: body.filename,
      contentType: body.contentType,
      prefix: `boards/${boardId}`,
    })
  }

  // ─── Pages ────────────────────────────────────────────────────────
  async listPages(boardId: string, userId: string) {
    await this.ensureMember(boardId, userId)
    const pages = await this.prisma.boardPage.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      select: { id: true, title: true, position: true, kind: true, updatedAt: true },
    })
    return pages
  }

  async createPage(boardId: string, userId: string, input: { title?: string; kind?: string }) {
    await this.ensureMember(boardId, userId)
    const last = await this.prisma.boardPage.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    return this.prisma.boardPage.create({
      data: {
        boardId,
        title: input.title ?? 'Página nueva',
        kind: input.kind ?? 'doc',
        position: (last?.position ?? 0) + 1,
      },
    })
  }

  async renamePage(pageId: string, userId: string, title: string) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    return this.prisma.boardPage.update({ where: { id: pageId }, data: { title } })
  }

  async reorderPage(pageId: string, userId: string, position: number) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    return this.prisma.boardPage.update({ where: { id: pageId }, data: { position } })
  }

  async deletePage(pageId: string, userId: string) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    await this.prisma.boardPage.delete({ where: { id: pageId } })
    return { ok: true }
  }

  /**
   * Devuelve el snapshot Yjs (base64) y la última seq para reconexión.
   */
  async getPageState(pageId: string, userId: string) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    const last = await this.prisma.boardPageOp.findFirst({
      where: { pageId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    })
    return {
      id: page.id,
      title: page.title,
      kind: page.kind,
      snapshot: page.yjsState ? Buffer.from(page.yjsState).toString('base64') : null,
      lastSeq: last?.seq ?? 0,
    }
  }

  /**
   * Persiste un update Yjs (Uint8Array) para una página.
   * Idempotente por clientOpId. Retorna la op con seq monótono.
   */
  async appendPageOp(input: {
    pageId: string
    userId: string
    update: Buffer
    clientOpId: string
  }) {
    const page = await this.prisma.boardPage.findUnique({
      where: { id: input.pageId },
      select: { boardId: true },
    })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, input.userId)
    const existing = await this.prisma.boardPageOp.findUnique({
      where: { pageId_clientOpId: { pageId: input.pageId, clientOpId: input.clientOpId } },
    })
    if (existing) return existing
    const last = await this.prisma.boardPageOp.findFirst({
      where: { pageId: input.pageId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    })
    const seq = (last?.seq ?? 0) + 1
    const op = await this.prisma.boardPageOp.create({
      data: {
        pageId: input.pageId,
        userId: input.userId,
        clientOpId: input.clientOpId,
        seq,
        update: input.update,
      },
    })
    await this.prisma.boardPage.update({
      where: { id: input.pageId },
      data: { updatedAt: new Date() },
    })
    // Periodic snapshot: every N ops, collapse into yjsState
    if (seq % this.SNAPSHOT_EVERY === 0) {
      this.snapshotPage(input.pageId).catch(() => undefined)
    }
    return op
  }

  async pageOpsSince(pageId: string, userId: string, sinceSeq: number) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    const ops = await this.prisma.boardPageOp.findMany({
      where: { pageId, seq: { gt: sinceSeq } },
      orderBy: { seq: 'asc' },
    })
    return ops.map((o) => ({
      seq: o.seq,
      userId: o.userId,
      clientOpId: o.clientOpId,
      update: Buffer.from(o.update).toString('base64'),
      createdAt: o.createdAt,
    }))
  }

  /**
   * Colapsa snapshot + ops en un único Y.Doc → guarda estado y purga ops
   * anteriores para que la próxima carga sea O(1).
   */
  async snapshotPage(pageId: string) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) return
    const doc = new Y.Doc()
    if (page.yjsState) Y.applyUpdate(doc, new Uint8Array(page.yjsState))
    const ops = await this.prisma.boardPageOp.findMany({
      where: { pageId },
      orderBy: { seq: 'asc' },
      select: { seq: true, update: true },
    })
    let maxSeq = 0
    for (const o of ops) {
      Y.applyUpdate(doc, new Uint8Array(o.update))
      if (o.seq > maxSeq) maxSeq = o.seq
    }
    const merged = Buffer.from(Y.encodeStateAsUpdate(doc))
    await this.prisma.$transaction([
      this.prisma.boardPage.update({
        where: { id: pageId },
        data: { yjsState: merged },
      }),
      this.prisma.boardPageOp.deleteMany({ where: { pageId, seq: { lte: maxSeq } } }),
    ])
  }
}

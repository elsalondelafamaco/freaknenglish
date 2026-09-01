import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import * as Y from 'yjs'

/**
 * Tope de un update Yjs suelto. Estaba en 256 KB y era la causa de que los
 * tableros "no guardaran": pegar un documento de clase genera UN solo update
 * grande (≈1,3× el HTML pegado), el socket lo rechazaba, el respaldo REST
 * devolvía 400 y el cliente lo tiraba a la basura sin decir nada. El profe
 * seguía viendo el texto en pantalla —vive en la memoria del navegador— y lo
 * perdía al cambiar de página.
 *
 * 2 MB cubre un documento pegado de ~1,5 MB de HTML. Por encima de eso el
 * cliente ahora avisa en pantalla en vez de perderlo en silencio.
 *
 * Al subirlo hay que mantener alineados: `maxHttpBufferSize` del socket
 * (redis-io.adapter.ts) y el límite de `express.json` (main.ts), porque el
 * update viaja en base64 y ocupa 4/3 de esto.
 */
export const MAX_UPDATE_BYTES = 2 * 1024 * 1024

@Injectable()
export class BoardService {
  private readonly SNAPSHOT_EVERY = 50
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  async ensureMember(boardId: string, userId: string) {
    const m = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    })
    if (m) return m
    // El admin puede acceder a cualquier board (supervisión).
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (u?.role === 'admin') return { boardId, userId, role: 'owner' } as any
    throw new ForbiddenException('Not a member of this board')
  }

  /**
   * Crea un board. Reglas: los estudiantes NO pueden crear; profesor/admin sí y
   * DEBEN asociar un estudiante (dueño = profe/admin, estudiante = editor).
   */
  async create(userId: string, role: string, name: string, studentId?: string) {
    if (role === 'student') throw new ForbiddenException('Los estudiantes no pueden crear boards')
    if (!studentId) throw new BadRequestException('Debes asociar un estudiante al board')
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true, fullName: true },
    })
    if (!student || student.role !== 'student') throw new BadRequestException('Estudiante inválido')

    // Sin esta comprobación, darle a "+ Crear" para un estudiante que ya tiene
    // aula creaba otra con el mismo nombre por defecto — la otra mitad de las
    // tarjetas duplicadas que se veían en el listado. Se reutiliza la suya y,
    // si le pusieron nombre, se le hace caso.
    const suya = await this.ensureClassroom(userId, studentId)
    if (name?.trim() && name.trim() !== suya.name) {
      await this.prisma.board.update({ where: { id: suya.id }, data: { name: name.trim() } })
    }
    return this.prisma.board.findUniqueOrThrow({
      where: { id: suya.id },
      include: { members: { include: { user: { select: { id: true, fullName: true, role: true } } } } },
    })
  }

  /**
   * Aula persistente del estudiante (una sola, a lo largo de todos sus profes).
   *
   * Antes buscaba por `ownerId + miembro`, así que al cambiar de profesor creaba
   * una SEGUNDA aula y la anterior quedaba para siempre en la lista del profe
   * viejo: el listado se resuelve solo por `BoardMember` y en todo el backend no
   * había un solo borrado de esa tabla. Ahora el aula es del estudiante y
   * cambia de dueño con él.
   */
  async ensureClassroom(teacherId: string, studentId: string) {
    const suya = await this.aulaDelEstudiante(studentId)
    if (suya) return suya.ownerId === teacherId ? suya : this.moverAula(suya, teacherId, studentId)

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { fullName: true },
    })
    return this.prisma.board.create({
      data: {
        name: `Aula · ${student?.fullName ?? 'Estudiante'}`,
        ownerId: teacherId,
        studentId,
        members: {
          create: [
            { userId: teacherId, role: 'owner' },
            { userId: studentId, role: 'editor' },
          ],
        },
        pages: { create: { title: 'Clase 1', position: 1 } },
      },
    })
  }

  /**
   * El aula del estudiante, mirando primero la columna y cayendo al vínculo por
   * miembro para las que son anteriores a que existiera `studentId`.
   *
   * Si hay varias (duplicados que ya están en producción) las fusiona: gana la
   * de actividad más reciente y las páginas de las otras se le cuelgan. Fusionar
   * y no borrar porque las dos tienen contenido de clases reales.
   */
  private async aulaDelEstudiante(studentId: string) {
    const candidatas = await this.prisma.board.findMany({
      where: { OR: [{ studentId }, { members: { some: { userId: studentId } } }] },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { pages: true } } },
    })
    // Un estudiante puede ser miembro de un aula ajena por invitación; la suya
    // es aquella cuyo dueño no es él.
    const propias = candidatas.filter((b) => b.ownerId !== studentId)
    if (propias.length === 0) return null

    const principal = propias[0]
    for (const sobrante of propias.slice(1)) await this.fusionarAulas(principal.id, sobrante.id)
    if (!principal.studentId) {
      await this.prisma.board.update({ where: { id: principal.id }, data: { studentId } })
    }
    return this.prisma.board.findUniqueOrThrow({ where: { id: principal.id } })
  }

  /** Cuelga las páginas del aula sobrante en la principal y la deja vacía. */
  private async fusionarAulas(principalId: string, sobranteId: string) {
    const ultima = await this.prisma.boardPage.findFirst({
      where: { boardId: principalId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const paginas = await this.prisma.boardPage.findMany({
      where: { boardId: sobranteId },
      orderBy: { position: 'asc' },
      select: { id: true },
    })
    let pos = (ultima?.position ?? 0) + 1
    for (const p of paginas) {
      await this.prisma.boardPage.update({
        where: { id: p.id },
        data: { boardId: principalId, position: pos++ },
      })
    }
    // Solo se borra una vez vacía: si algo falló arriba, el contenido sigue en
    // pie y la fusión se reintenta sola en la siguiente pasada.
    const quedan = await this.prisma.boardPage.count({ where: { boardId: sobranteId } })
    if (quedan === 0) await this.prisma.board.delete({ where: { id: sobranteId } }).catch(() => null)
  }

  /** Pasa el aula al profesor nuevo: dueño, membresías y nombre. */
  private async moverAula(aula: { id: string; ownerId: string }, nuevoProfeId: string, studentId: string) {
    await this.prisma.boardMember.deleteMany({
      where: { boardId: aula.id, userId: aula.ownerId, NOT: { userId: studentId } },
    })
    await this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: aula.id, userId: nuevoProfeId } },
      update: { role: 'owner' },
      create: { boardId: aula.id, userId: nuevoProfeId, role: 'owner' },
    })
    return this.prisma.board.update({
      where: { id: aula.id },
      data: { ownerId: nuevoProfeId, studentId },
    })
  }

  async list(userId: string, role?: string) {
    const include = {
      members: { include: { user: { select: { id: true, fullName: true, role: true } } } },
    }
    if (role === 'admin') {
      return this.prisma.board.findMany({ orderBy: { updatedAt: 'desc' }, include })
    }
    return this.prisma.board.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      include,
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
    // Periodic snapshot: every N ops, collapse into yjsState.
    // Un update grande (un documento pegado) no espera turno: si se quedara
    // suelto en la lista de ops, cada carga de la página se lo bajaría entero
    // junto a los demás. Colapsarlo ya deja la próxima carga en un snapshot.
    if (seq % this.SNAPSHOT_EVERY === 0 || input.update.length > 256 * 1024) {
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

  // ─── Versions ─────────────────────────────────────────────────────
  async listVersions(pageId: string, userId: string) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    return this.prisma.boardPageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, createdBy: true, sizeBytes: true, createdAt: true },
      take: 100,
    })
  }

  async saveVersion(pageId: string, userId: string, label?: string) {
    const page = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    await this.snapshotPage(pageId)
    const fresh = await this.prisma.boardPage.findUnique({ where: { id: pageId } })
    const state = fresh?.yjsState ?? Buffer.alloc(0)
    return this.prisma.boardPageVersion.create({
      data: {
        pageId,
        createdBy: userId,
        label: label?.slice(0, 120) ?? null,
        state: Buffer.from(state),
        sizeBytes: state.length,
      },
      select: { id: true, label: true, createdAt: true, sizeBytes: true },
    })
  }

  async restoreVersion(versionId: string, userId: string) {
    const v = await this.prisma.boardPageVersion.findUnique({ where: { id: versionId } })
    if (!v) throw new NotFoundException()
    const page = await this.prisma.boardPage.findUnique({ where: { id: v.pageId } })
    if (!page) throw new NotFoundException()
    await this.ensureMember(page.boardId, userId)
    // Replace page state with version bytes and clear ops → next join
    // returns this exact snapshot for every client.
    await this.prisma.$transaction([
      this.prisma.boardPage.update({
        where: { id: v.pageId },
        data: { yjsState: v.state },
      }),
      this.prisma.boardPageOp.deleteMany({ where: { pageId: v.pageId } }),
    ])
    return { pageId: v.pageId, snapshot: Buffer.from(v.state).toString('base64') }
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

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import {
  CheckpointQuestion,
  gradeQuestion,
  parseSettings,
  sanitizeQuestion,
} from './checkpoint-questions'

/** Orden de los niveles. Se usa para saber cuáles ya quedaron atrás. */
const NIVEL_ORDEN: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 }

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
        // Default BLOQUEADO, igual que en el detalle: si una lección no quedó
        // en el mapa de compuertas, el listado la daba por abierta mientras el
        // detalle la daba por cerrada — justo la incoherencia que veía el
        // estudiante. La regla es "todo nace bloqueado".
        const s = state.get(l.id) ?? { locked: true, reason: 'espera_desbloqueo', blockedBy: null }
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

  /**
   * Detalle de un módulo. Aplica las MISMAS compuertas que el catálogo: sin
   * esto, el listado mostraba los candados pero al abrir el módulo llegaba
   * todo desbloqueado y con el HTML completo — el estudiante veía contenido
   * que su profe no le había habilitado.
   */
  async module(id: string, userId?: string) {
    const mod = await this.prisma.module.findUnique({
      where: { id },
      include: { lessons: { orderBy: { position: 'asc' } }, checkpoints: true },
    })
    if (!mod || !userId) return mod
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (user?.role !== 'student') return mod // profes y admin ven todo

    const { state } = await this.gatingFor(userId)
    const lessons = mod.lessons.map((l) => {
      const s = state.get(l.id) ?? { locked: true, reason: 'espera_desbloqueo', blockedBy: null }
      return {
        ...l,
        contentHtml: s.locked ? null : l.contentHtml,
        locked: s.locked,
        lockReason: s.reason,
      }
    })
    return { ...mod, lessons, locked: lessons.length > 0 && lessons.every((l) => l.locked) }
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
    const [usuario, modules, progress, unlocks] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { englishLevel: true } }),
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

    // Niveles ANTERIORES al del estudiante: van abiertos de entrada. Si a
    // alguien se le pone intermediate o advanced es porque ya pasó lo previo;
    // obligar al profe a habilitar módulo por módulo todo beginner solo para
    // que pueda consultarlo era trabajo manual sin ningún valor.
    const nivelDelAlumno = NIVEL_ORDEN[usuario?.englishLevel ?? 'beginner'] ?? 0
    const esNivelYaSuperado = (nivel: string) => (NIVEL_ORDEN[nivel] ?? 0) < nivelDelAlumno

    /** lessonId → { locked, reason, blockingLessonId } */
    const state = new Map<string, { locked: boolean; reason: string | null; blockedBy: string | null }>()
    let gate: { id: string; title: string; moduleTitle: string } | null = null
    let nivelDeLaCompuerta: string | null = null

    for (const m of modules) {
      // Regla 3 — un checkpoint sólo tapa DENTRO de su propio nivel. Sin esto,
      // al recorrer todos los niveles seguidos (beginner → intermediate →
      // advanced) el primer checkpoint sin completar de Beginner bloqueaba
      // también todo Intermediate, aunque el profe ya lo hubiera habilitado:
      // un estudiante que entra directo a Intermediate nunca hizo — ni tiene
      // por qué hacer — los checkpoints del nivel anterior. Pasar de un nivel
      // al siguiente es cosa del examen de nivel, no de esta compuerta.
      if (m.level !== nivelDeLaCompuerta) {
        nivelDeLaCompuerta = m.level
        gate = null
      }
      // Un nivel ya superado no lleva compuertas de ningún tipo.
      const yaSuperado = esNivelYaSuperado(m.level)
      if (yaSuperado) gate = null

      for (const l of m.lessons) {
        // Regla 1 — TODO nace bloqueado. El estudiante solo ve lo que su
        // profesor le fue habilitando (o lo que ya completó antes), salvo los
        // niveles anteriores al suyo, que van abiertos.
        const habilitada = yaSuperado || unlocked.has(l.id) || completed.has(l.id)

        // Regla 2 — un checkpoint sin superar tapa todo lo que viene después,
        // aunque el profe lo hubiera habilitado: no se saltan bases.
        if (gate) {
          state.set(l.id, { locked: true, reason: 'checkpoint_pendiente', blockedBy: gate.id })
          if (l.isCheckpoint && !completed.has(l.id)) continue
          continue
        }

        state.set(l.id, {
          locked: !habilitada,
          reason: habilitada ? null : 'espera_desbloqueo',
          blockedBy: null,
        })

        if (!yaSuperado && l.isCheckpoint && !completed.has(l.id)) {
          gate = { id: l.id, title: l.title, moduleTitle: m.title }
        }
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
      // Mensaje genérico: el motivo interno (checkpoint pendiente vs. lección
      // sin habilitar) va en `code` para nosotros, pero al estudiante se le
      // dice siempre lo mismo — la acción a tomar es idéntica.
      throw new ForbiddenException({
        statusCode: 403,
        code: s.reason,
        message: 'Tu profe habilita el contenido a medida que avanzas. Coméntale que quieres seguir.',
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
    roles: string[],
    lessonId: string,
    body: {
      activityId: string
      title?: string
      score?: number
      maxScore?: number
      answers?: unknown[]
      /** Alumno dueño del resultado cuando reporta el profe dando la clase. */
      studentId?: string
      /**
       * `true` = el alumno empezó la actividad de cero (entró sin posición
       * guardada, o el profe pulsó "Volver a empezar"): se reemplaza y sube el
       * contador de intentos. `false` = viene retomando: se MEZCLA con lo ya
       * guardado. Lo decide el visor, que es el único que lo sabe; antes se
       * adivinaba comparando cuántas respuestas llegaban, y retomar rompía esa
       * heurística por definición.
       */
      nuevaCorrida?: boolean
    },
  ) {
    const activityId = String(body.activityId ?? '').trim()
    if (!activityId) throw new Error('activityId requerido')
    // El resultado es del ESTUDIANTE. En clase la lección la tiene abierta el
    // profe, compartiendo pantalla: sin esto, lo que respondía el alumno no
    // quedaba registrado en ningún lado.
    const objetivo = await this.resolverEstudiante(userId, roles, body.studentId)
    // El gating es de quien cursa. Si reporta el profe por su alumno, la
    // autorización ya la dio `resolverEstudiante` con la relación entre ambos:
    // puede estar dando una lección que aún no le abrió.
    if (objetivo === userId) await this.assertLessonAccess(userId, lessonId)
    const entrantes = (Array.isArray(body.answers) ? body.answers : []) as any[]
    const key = { userId_lessonId_activityId: { userId: objetivo, lessonId, activityId } }
    const existing = await this.prisma.activityResult.findUnique({ where: key })
    const previas = Array.isArray(existing?.answers) ? (existing!.answers as any[]) : []

    // Una lección puede darse en dos o tres clases, y la lección guarda sus
    // respuestas en memoria: nunca las recarga del servidor. Así que al retomar
    // sólo llegan las nuevas, y reemplazar borraba lo de la clase anterior.
    // Por eso se MEZCLA salvo que el visor avise que es corrida nueva.
    const nuevaCorrida = body.nuevaCorrida ?? true
    const finales = nuevaCorrida ? entrantes : fusionarRespuestas(previas, entrantes)

    // El puntaje se recalcula aquí y no se confía el que llega: el cliente lo
    // computa sobre su arreglo en memoria, que al retomar está incompleto.
    const aciertos = finales.filter((a) => a?.correct === true || a?.isCorrect === true).length
    // `maxScore` no es homogéneo en el contenido: unas lecciones mandan el
    // total de preguntas y otras cuántas van respondidas. Se toma el mayor para
    // que una corrida parcial no encoja el denominador de una completa.
    const maxScore = Math.max(
      typeof body.maxScore === 'number' ? Math.round(body.maxScore) : 0,
      nuevaCorrida ? 0 : (existing?.maxScore ?? 0),
      finales.length,
    )

    const data = {
      title: body.title ?? undefined,
      score: aciertos,
      maxScore: maxScore || null,
      answers: finales as any,
    }
    return this.prisma.activityResult.upsert({
      where: key,
      update: {
        ...data,
        // Sólo la PRIMERA entrega de una corrida nueva cuenta como intento; las
        // siguientes de esa misma corrida llegan con `nuevaCorrida: false`.
        ...(existing && nuevaCorrida ? { attempts: { increment: 1 } } : {}),
      },
      create: { userId: objetivo, lessonId, activityId, ...data },
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

  /**
   * Plan de contenido de un estudiante: todos los módulos con sus lecciones y
   * el estado de cada una (habilitada, completada, es checkpoint). Es lo que
   * el profesor usa para ir abriendo el programa a su ritmo.
   */
  async lessonPlanForStudent(studentId: string) {
    const [modules, progress, unlocks] = await Promise.all([
      this.prisma.module.findMany({
        orderBy: [{ level: 'asc' }, { position: 'asc' }],
        include: { lessons: { orderBy: { position: 'asc' } } },
      }),
      // SIN filtrar por `completedAt`: una lección empezada y no terminada no
      // aparecía en absoluto, y es justo la que hay que poder mostrar a medias
      // en la barra de progreso del profe.
      this.prisma.lessonProgress.findMany({
        where: { userId: studentId },
        select: { lessonId: true, completedAt: true, lastSlideRef: true },
      }),
      this.prisma.checkpointUnlock.findMany({
        where: { userId: studentId, revokedAt: null },
        select: { lessonId: true, createdAt: true },
      }),
    ])
    const avance = new Map(progress.map((p) => [p.lessonId, p]))
    const open = new Map(unlocks.map((u) => [u.lessonId, u.createdAt]))
    return modules.map((m) => ({
      moduleId: m.id,
      title: m.title,
      unit: m.unit,
      level: m.level,
      lessons: m.lessons.map((l) => {
        const p = avance.get(l.id)
        return {
          lessonId: l.id,
          title: l.title,
          isCheckpoint: l.isCheckpoint,
          unlocked: open.has(l.id),
          unlockedAt: open.get(l.id) ?? null,
          completedAt: p?.completedAt ?? null,
          /** 0..1 — cuánto de la lección se recorrió con este estudiante. */
          progreso: porcentajeDeAvance(p?.lastSlideRef ?? null, l.slideCount, l.slideRefs as any),
        }
      }),
    }))
  }

  /** Habilita (o revoca) VARIAS lecciones de un tirón (p. ej. un módulo entero). */
  async setLessonUnlocks(
    studentId: string,
    lessonIds: string[],
    grantedById: string,
    unlock: boolean,
  ) {
    const validas = await this.prisma.lesson.findMany({
      where: { id: { in: lessonIds } },
      select: { id: true },
    })
    for (const l of validas) {
      await this.prisma.checkpointUnlock.upsert({
        where: { userId_lessonId: { userId: studentId, lessonId: l.id } },
        update: { revokedAt: unlock ? null : new Date(), unlockedById: grantedById },
        create: { userId: studentId, lessonId: l.id, unlockedById: grantedById },
      })
    }
    return { ok: true, afectadas: validas.length }
  }

  /**
   * Habilita (o revoca) una lección para un estudiante. Sirve para cualquier
   * lección; en los checkpoints además dispara el correo de aviso, porque para
   * el estudiante es el hito que estaba esperando.
   */
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

    const row = await this.prisma.checkpointUnlock.upsert({
      where: { userId_lessonId: { userId: studentId, lessonId } },
      update: { revokedAt: unlock ? null : new Date(), unlockedById: grantedById, note: note ?? null },
      create: { userId: studentId, lessonId, unlockedById: grantedById, note: note ?? null },
    })

    // Solo se avisa por correo en los checkpoints: habilitar lecciones
    // sueltas es rutina de clase y llenaría la bandeja del estudiante.
    if (unlock && lesson.isCheckpoint) {
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

  /** Material (links y PDFs) que su profesor le dejó a este estudiante. */
  myStudentResources(userId: string) {
    return this.prisma.studentResource.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, kind: true, title: true, description: true, url: true,
        contentType: true, sizeBytes: true, createdAt: true,
        teacher: { select: { id: true, fullName: true } },
      },
    })
  }

  /**
   * Reportes del estudiante. Sólo los publicados: sin `publishedAt` el reporte
   * es un borrador del profe y no tiene por qué verse todavía.
   */
  myReports(userId: string) {
    return this.prisma.studentReport.findMany({
      where: { studentId: userId, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true, periodLabel: true, level: true, publishedAt: true,
        teacher: { select: { id: true, fullName: true } },
      },
    })
  }

  async myReport(userId: string, id: string) {
    const r = await this.prisma.studentReport.findFirst({
      where: { id, studentId: userId, publishedAt: { not: null } },
      include: { teacher: { select: { id: true, fullName: true } } },
    })
    if (!r) throw new NotFoundException('Reporte no encontrado')
    return r
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

  // ─── Slide donde quedó la clase ───────────────────────────────────
  //
  // Una lección interactiva puede tomar dos o tres clases. El avance se guarda
  // contra el ESTUDIANTE, nunca contra quien tiene la pantalla abierta: en
  // clase normalmente es el profe quien comparte pantalla, y sin esa
  // distinción todos sus alumnos compartirían el mismo slide.

  /** ¿Puede `userId` tocar el avance de `studentId`? Devuelve a quién escribir. */
  private async resolverEstudiante(
    userId: string,
    roles: string[],
    studentId?: string,
  ): Promise<string> {
    if (!studentId || studentId === userId) return userId
    if (roles.includes('admin')) return studentId
    if (roles.includes('teacher')) {
      const suyo = await this.prisma.user.findFirst({
        where: {
          id: studentId,
          OR: [{ assignedTeacherId: userId }, { classesAsStudent: { some: { teacherId: userId } } }],
        },
        select: { id: true },
      })
      if (suyo) return suyo.id
    }
    throw new ForbiddenException('No puedes ver el avance de ese estudiante')
  }

  async getLastSlide(userId: string, roles: string[], lessonId: string, studentId?: string) {
    const objetivo = await this.resolverEstudiante(userId, roles, studentId)
    const p = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: objetivo, lessonId } },
      select: { lastSlideRef: true },
    })
    return { slide: p?.lastSlideRef ?? null }
  }

  /**
   * La posición llega tal cual la reporta la lección y se guarda sin
   * interpretarla: unas navegan por índice ("8") y otras por id de slide
   * ("slide-game"). Sólo se acota el largo, para que un HTML mal hecho no
   * pueda escribir cualquier cosa en la base.
   *
   * `slide: null` la borra — es lo que manda el visor al "Volver a empezar",
   * porque si no la lección volvería a retomar en cuanto se reabriera.
   */
  async setLastSlide(
    userId: string,
    roles: string[],
    lessonId: string,
    slide: unknown,
    studentId?: string,
  ) {
    const objetivo = await this.resolverEstudiante(userId, roles, studentId)
    const ref =
      slide === null || slide === undefined || slide === ''
        ? null
        : String(slide).slice(0, 120)
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: objetivo, lessonId } },
      update: { lastSlideRef: ref },
      create: { userId: objetivo, lessonId, lastSlideRef: ref, secondsWatched: 0 },
    })
    return { ok: true, slide: ref }
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

/**
 * Une las respuestas guardadas con las que llegan, para que una lección dictada
 * en dos clases sume en vez de pisarse.
 *
 * La clave es el `id` de la respuesta, que trae casi todo el contenido y con el
 * que la propia lección ya deduplica. Hay material sin `id` (las más viejas
 * mandan sólo `{ question, answer, isCorrect }`): ahí sirve el texto de la
 * pregunta, que es estable porque sale del mismo slide. Si no hay ninguno de
 * los dos, la respuesta se conserva sin deduplicar — es preferible una repetida
 * a perderla.
 *
 * Ante la misma clave gana la entrante: si el alumno rehace esa pregunta, vale
 * el último intento.
 */
function fusionarRespuestas(previas: any[], entrantes: any[]): any[] {
  const claveDe = (a: any): string | null => {
    if (a?.id !== undefined && a?.id !== null && a.id !== '') return `id:${String(a.id)}`
    if (typeof a?.question === 'string' && a.question.trim()) return `q:${a.question.trim()}`
    return null
  }
  const fusionadas: any[] = []
  const porClave = new Map<string, number>()
  for (const a of [...previas, ...entrantes]) {
    const k = claveDe(a)
    if (k === null) {
      fusionadas.push(a)
      continue
    }
    const yaEsta = porClave.get(k)
    if (yaEsta === undefined) {
      porClave.set(k, fusionadas.length)
      fusionadas.push(a)
    } else {
      fusionadas[yaEsta] = a
    }
  }
  return fusionadas
}

/**
 * Cuánto se recorrió de una lección, de 0 a 1, a partir de la última posición
 * guardada.
 *
 * La posición es opaca a propósito: unas lecciones reportan un índice ("8") y
 * otras el id del slide ("slide-game"). Por eso la sincronización de contenido
 * guarda `slideRefs` en orden — con esa lista, un id se traduce a su posición.
 * Sin lista y sin número, no hay porcentaje posible y se devuelve 0.
 */
function porcentajeDeAvance(
  ref: string | null,
  total: number | null,
  refs: string[] | null,
): number {
  if (!ref || !total || total <= 0) return 0
  // Las lecciones con juego reportan "juego:2"; cuenta como llegar al final.
  if (ref.startsWith('juego:')) return 1
  const enLista = Array.isArray(refs) ? refs.indexOf(ref) : -1
  const indice = enLista >= 0 ? enLista : Number(ref)
  if (!Number.isFinite(indice) || indice < 0) return 0
  // +1 porque estar EN el slide 0 ya es haber visto el primero.
  return Math.min(1, (indice + 1) / total)
}

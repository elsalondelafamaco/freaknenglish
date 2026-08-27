import { BadRequestException } from '@nestjs/common'
import type { PrismaService } from '../../prisma/prisma.service'

/**
 * Cruce de horario del profesor al mover una clase.
 *
 * Compartir una hora entre dos alumnos es LEGÍTIMO: si uno no entró, el profe
 * quiere usar esa hora de reposición con otro. Antes se rechazaba de plano y no
 * había forma de hacerlo, salvo marcar antes la clase como "no tomada" —que sí
 * dejaba de estorbar, pero nadie tenía por qué saberlo.
 *
 * Así que esto ya no bloquea: avisa. Sin `permitirCruce` devuelve un error
 * ESTRUCTURADO (`code: 'clash'`) con el nombre del otro alumno, para que la
 * pantalla pueda preguntar "ya tienes a Camila a esa hora, ¿pones las dos?" y
 * reintentar con el permiso. Así el cruce siempre es una decisión consciente y
 * nunca el resultado de soltar mal el ratón.
 */
export async function assertSinCruce(
  prisma: PrismaService,
  input: {
    teacherId: string
    classId: string
    startsAt: Date
    endsAt: Date
    permitirCruce?: boolean
  },
): Promise<void> {
  if (input.permitirCruce) return
  const cruce = await prisma.class.findFirst({
    where: {
      teacherId: input.teacherId,
      id: { not: input.classId },
      status: { in: ['scheduled', 'rescheduled'] },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
    select: { id: true, startsAt: true, student: { select: { fullName: true } } },
  })
  if (!cruce) return

  const hora = new Date(cruce.startsAt.getTime() - 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(11, 16)
  const alumno = cruce.student?.fullName ?? 'otro estudiante'
  throw new BadRequestException({
    code: 'clash',
    message: `Ya tienes clase con ${alumno} a las ${hora}. ¿Quieres poner las dos a la misma hora?`,
    conflicto: { classId: cruce.id, alumno, hora },
  })
}

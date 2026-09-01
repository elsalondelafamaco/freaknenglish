import { useQuery } from "@tanstack/react-query";
import { scheduleApi, type SlotRef } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * ¿Este checkout es una renovación?
 *
 * Renovar no debe volver a preguntar el horario. Una estudiante en San
 * Francisco pasó por el selector, eligió las 9:00 pensando en SU hora —el
 * sistema las leyó como 9:00 de Colombia, tenía disponibilidad y las aceptó— y
 * acabó con otra profesora. El horario de quien renueva ya existe: no hay nada
 * que preguntar.
 *
 * Las dos condiciones importan: sin profesor asignado (pago manual pendiente)
 * sí hace falta elegir, y sin franjas (se le liberaron al vencer) también.
 *
 * `cargando` es parte del contrato, no un extra: el checkout redirige al
 * selector cuando no le llega horario, y si esa redirección corre antes de que
 * responda esta consulta devuelve al estudiante al selector y deshace el
 * arreglo entero — con caché frío, que es como llega quien viene del correo.
 *
 * El servidor vuelve a decidirlo por su cuenta en `createIntent`: esto es solo
 * para no enseñar una pantalla que no toca.
 */
export function useRenovacion(): {
  cargando: boolean;
  esRenovacion: boolean;
  profesor: { id: string; fullName: string } | null;
  slots: SlotRef[];
} {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["schedule", "mine"],
    queryFn: () => scheduleApi.mine(),
    enabled: !!user,
  });

  if (!user) return { cargando: false, esRenovacion: false, profesor: null, slots: [] };
  if (q.isPending) return { cargando: true, esRenovacion: false, profesor: null, slots: [] };

  const data = q.data as any;
  const slots: SlotRef[] = Array.isArray(data?.slots)
    ? data.slots.map((s: any) => ({ weekday: s.weekday, hour: s.hour }))
    : [];
  const profesor = data?.assignedTeacher ?? null;

  return {
    cargando: false,
    esRenovacion: !!profesor?.id && slots.length > 0,
    profesor,
    slots,
  };
}

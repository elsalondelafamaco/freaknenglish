/**
 * Progreso del estudiante: cuenta SOLO las "Actividad extra".
 *
 * Cada módulo trae Lección interactiva, Actividad extra y Guía de estudio. La
 * lección interactiva la da el profe en clase y la guía es material de apoyo;
 * lo único que el alumno hace desde su perfil es la actividad extra. Dividir
 * entre las tres dejaba el módulo clavado en 33 % aunque ya hubiera terminado
 * lo suyo, y nadie sabía si le faltaba algo.
 */

type LeccionMinima = { id: string; title?: string | null };

/** Actividad extra por id del manifiesto (`…-extra`) o por título si la crearon a mano en el CMS. */
export const esActividadExtra = (l: LeccionMinima) =>
  l.id.endsWith("-extra") || /actividad extra/i.test(l.title ?? "");

/**
 * Lecciones que pesan en el progreso del alumno. Si el módulo no tiene
 * actividad extra (hay unos pocos así), cuentan todas para no dejarlo en 0/0.
 */
export function leccionesQueCuentan<L extends LeccionMinima>(lessons: L[]): L[] {
  const extras = lessons.filter(esActividadExtra);
  return extras.length > 0 ? extras : lessons;
}

export function progresoDelModulo(lessons: LeccionMinima[], doneIds: Set<string>) {
  const cuentan = leccionesQueCuentan(lessons);
  const done = cuentan.filter((l) => doneIds.has(l.id)).length;
  const total = cuentan.length;
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    complete: total > 0 && done === total,
  };
}

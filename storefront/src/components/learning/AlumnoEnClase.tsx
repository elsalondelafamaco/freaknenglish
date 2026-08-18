import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Users, X } from "lucide-react";
import { classesApi, teachersApi } from "@/lib/api/endpoints";

/**
 * "¿Con qué alumno estás?" para el visor de contenido del profesor.
 *
 * El avance de slide se guarda contra el ESTUDIANTE. Antes, la única forma de
 * que el visor supiera de quién era la clase era entrar por Students → el
 * alumno → Ver contenido; entrar por Content (que es el camino corto y el que
 * todo el mundo usa) no guardaba nada y parecía que la función estaba rota.
 * Ahora se pregunta aquí, una vez, y la elección viaja con el profe.
 *
 * Se recuerda en el navegador —no en el servidor— a propósito: es el contexto
 * de "en qué clase estoy ahora", no un dato del profesor.
 */
const CLAVE = "freakn.alumnoEnClase";

function leerRecordado(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CLAVE) ?? "";
  } catch {
    return "";
  }
}

/**
 * Estado compartido del alumno en clase, con memoria entre pantallas.
 *
 * `listo` es false hasta que se leyó lo recordado. La lectura va en un efecto
 * y no en el estado inicial porque la app se renderiza también en el servidor,
 * donde no hay localStorage: leerlo en el render daría una marca distinta en
 * servidor y cliente. Quien muestre la lección debe esperar a `listo`, o el
 * iframe se montaría sin alumno y se recargaría un instante después, perdiendo
 * el slide.
 */
export function useAlumnoEnClase(desdeUrl?: string) {
  const [recordado, setRecordado] = useState("");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setRecordado(leerRecordado());
    setListo(true);
  }, []);

  const elegir = useCallback((id: string) => {
    setRecordado(id);
    try {
      if (id) window.localStorage.setItem(CLAVE, id);
      else window.localStorage.removeItem(CLAVE);
    } catch {
      /* modo incógnito o storage lleno: se pierde al recargar y ya */
    }
  }, []);

  // La URL se adopta cuando CAMBIA, no mientras difiera. La condición anterior
  // era `desdeUrl !== recordado`, que se cumple para siempre en cuanto el profe
  // elige a otro alumno: el efecto lo devolvía al de la URL en el mismo
  // instante y el selector quedaba muerto. A partir de aquí manda `recordado`,
  // que es lo que el profe eligió de último.
  const urlAplicada = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (desdeUrl && desdeUrl !== urlAplicada.current) {
      urlAplicada.current = desdeUrl;
      elegir(desdeUrl);
    }
  }, [desdeUrl, elegir]);

  return { alumnoId: recordado, elegir, listo };
}

export function BarraAlumnoEnClase({
  alumnoId,
  onElegir,
}: {
  alumnoId: string;
  onElegir: (id: string) => void;
}) {
  const alumnosQ = useQuery({ queryKey: ["teacher", "students"], queryFn: () => teachersApi.students() });
  // Clases de hoy: si hay una a esta hora, se propone ese alumno. Es casi
  // siempre el correcto y ahorra el desplegable.
  const hoyQ = useQuery({ queryKey: ["classes", "today"], queryFn: () => classesApi.todayForTeacher() });

  const alumnos = (alumnosQ.data ?? []) as any[];
  const elegido = alumnos.find((s) => s.id === alumnoId);

  const sugerido = useMemo(() => {
    if (alumnoId || !hoyQ.data?.length) return null;
    const ahora = Date.now();
    // La clase en curso, o la siguiente de hoy.
    const orden = [...hoyQ.data].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    const enCurso = orden.find((c) => {
      const ini = new Date(c.startsAt).getTime();
      return ahora >= ini && ahora <= ini + (c.durationMin ?? 50) * 60_000;
    });
    const proxima = orden.find((c) => new Date(c.startsAt).getTime() > ahora);
    const c = enCurso ?? proxima;
    if (!c) return null;
    const s = alumnos.find((x) => x.id === c.studentId);
    return s ? { id: s.id, nombre: s.fullName, enCurso: c === enCurso } : null;
  }, [alumnoId, hoyQ.data, alumnos]);

  // Sin alumnos a cargo (un admin revisando contenido, o un profe recién
  // creado) la pregunta no tiene respuesta posible: mejor no preguntar. Se
  // espera a que cargue la lista para no parpadear.
  if (!elegido && (alumnosQ.isPending || alumnos.length === 0)) return null;

  if (elegido) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-ink/15 bg-brand-cream/50 px-4 py-3">
        <GraduationCap className="size-4 shrink-0 text-brand-ink/70" />
        <p className="text-sm text-brand-ink">
          En clase con <strong>{elegido.fullName}</strong>
          <span className="text-brand-ink/60"> — el avance se guarda para {elegido.fullName.split(" ")[0]}</span>
        </p>
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-brand-ink/70">
          Cambiar
          <select
            value={alumnoId}
            onChange={(e) => onElegir(e.target.value)}
            className="rounded-xl border border-brand-line bg-white px-3 py-1.5 text-sm font-normal focus:border-brand-ink focus:outline-none"
          >
            {alumnos.map((s) => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onElegir("")}
          title="Salir del modo clase — deja de guardar avance"
          className="rounded-full p-1.5 text-brand-ink/45 transition hover:bg-white hover:text-brand-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-brand-line bg-white px-4 py-3">
      <Users className="size-4 shrink-0 text-brand-ink/60" />
      <p className="text-sm text-brand-ink">
        ¿Con qué alumno estás en clase?
        <span className="text-brand-ink/60"> — elígelo y la lección abre donde quedaron.</span>
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {sugerido ? (
          <button
            type="button"
            onClick={() => onElegir(sugerido.id)}
            className="rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-ink-soft"
          >
            {sugerido.enCurso ? "Clase de ahora: " : "Siguiente: "}
            {sugerido.nombre}
          </button>
        ) : null}
        <select
          value=""
          onChange={(e) => onElegir(e.target.value)}
          className="w-52 rounded-xl border border-brand-line bg-white px-3 py-1.5 text-sm focus:border-brand-ink focus:outline-none"
        >
          <option value="">Solo revisar material</option>
          {alumnos.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, LayoutGrid, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { classesApi, teachersApi } from "@/lib/api/endpoints";
import { diaCorto, diaLargo, diaMes, duracionMin, horaDeClase } from "@/lib/domain/clases-fecha";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, Vacio, focusRing, tag } from "@/components/app/AppUi";
import { CifrasCaja, Seccion, btnRow, btnRowInk, td, th } from "@/components/teacher/TeacherUi";

export const Route = createFileRoute("/_authenticated/teacher/")({
  head: () => ({ meta: [{ title: "Hoy — Freakn for Teachers" }] }),
  component: TeacherHome,
});

const nombreDe = (c: any) => c.student?.fullName ?? `Estudiante #${String(c.studentId).slice(-6)}`;

function TeacherHome() {
  const { user } = useAuth();
  const zona = user?.timezone;
  const qc = useQueryClient();

  const todayQ = useQuery({ queryKey: ["teacher", "today"], queryFn: () => classesApi.todayForTeacher() });
  const upcomingQ = useQuery({ queryKey: ["teacher", "upcoming"], queryFn: () => teachersApi.schedule("upcoming") });
  const studentsQ = useQuery({ queryKey: ["teacher", "students"], queryFn: () => teachersApi.students() });
  const allQ = useQuery({ queryKey: ["teacher", "all"], queryFn: () => teachersApi.schedule() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["teacher", "today"] });
    qc.invalidateQueries({ queryKey: ["teacher", "all"] });
  };
  const validateM = useMutation({
    mutationFn: (id: string) => classesApi.validate(id),
    onSuccess: () => { toast.success("Asistencia validada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo validar"),
  });
  const noShowM = useMutation({
    mutationFn: (id: string) => classesApi.noShow(id),
    onSuccess: () => { toast.success("Marcado como no asistió"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo marcar"),
  });
  // "Validar todas" reutiliza el mismo endpoint de una en una: si una falla, las demás siguen.
  const validarTodasM = useMutation({
    mutationFn: async (ids: string[]) => {
      let ok = 0;
      for (const id of ids) {
        try {
          await classesApi.validate(id);
          ok += 1;
        } catch {
          /* se cuenta como no validada */
        }
      }
      return { ok, total: ids.length };
    },
    onSuccess: ({ ok, total }) => {
      if (ok === total) toast.success(total === 1 ? "Clase validada" : `${total} clases validadas`);
      else toast.error(`Se validaron ${ok} de ${total}. Inténtalo de nuevo con las que faltan.`);
      invalidate();
    },
  });
  const ocupado = validateM.isPending || noShowM.isPending || validarTodasM.isPending;

  const today = (todayQ.data ?? []) as any[];
  const upcoming = ((upcomingQ.data ?? []) as any[]).slice(0, 6);
  const all = (allQ.data ?? []) as any[];
  // Por validar: el estudiante ya confirmó y falta tu visto bueno. El conteo sale de esta misma lista.
  const porValidar = all
    .filter((c: any) => c.studentConfirmedAt && !c.teacherValidatedAt)
    .sort((a: any, b: any) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const stats = {
    students: studentsQ.data?.length ?? 0,
    completedWeek: all.filter(
      (c) => c.status === "validated" && (Date.now() - new Date(c.startsAt).getTime()) / 864e5 < 7,
    ).length,
  };

  const ahora = Date.now();
  const enCurso = (c: any) => +new Date(c.startsAt) <= ahora && ahora < +new Date(c.endsAt ?? c.startsAt);
  const primerNombre = user?.fullName.split(" ")[0] ?? "profe";
  const hoyTxt = diaLargo(new Date(), zona);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrowText={`Portal de profesores · ${hoyTxt.charAt(0).toUpperCase()}${hoyTxt.slice(1)}`}
        title={`Hola, ${primerNombre}`}
        highlight={primerNombre}
      />

      <CifrasCaja
        items={[
          { label: "Estudiantes activos", value: stats.students },
          { label: "Por validar", value: porValidar.length, atencion: porValidar.length > 0 },
          { label: "Validadas (7 días)", value: stats.completedWeek },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Seccion
          id="hoy"
          titulo="Clases de hoy"
          aside={
            <Link to="/teacher/calendar" className={cn("inline-flex min-h-11 items-center text-[13px] font-bold underline underline-offset-2", focusRing)}>
              Ver calendario completo
            </Link>
          }
        >
          {todayQ.isLoading ? (
            <div className="p-4 pt-0"><Cargando>Cargando tus clases de hoy…</Cargando></div>
          ) : todayQ.isError ? (
            <div className="p-4 pt-0"><EstadoError onRetry={() => void todayQ.refetch()}>No pudimos cargar tus clases de hoy.</EstadoError></div>
          ) : today.length === 0 ? (
            <div className="p-4 pt-0"><Vacio titulo="Hoy no tienes clases">Cuando haya clases programadas para hoy, aparecerán aquí con la hora y el botón para entrar.</Vacio></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Hora</th>
                    <th className={th}>Estudiante</th>
                    <th className={th}>Clase</th>
                    <th className={th}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {today.map((c: any) => {
                    const ahoraMismo = enCurso(c);
                    const nombre = nombreDe(c);
                    const porConfirmar = c.studentConfirmedAt && !c.teacherValidatedAt;
                    return (
                      <tr key={c.id} className={ahoraMismo ? "bg-brand-yellow-soft" : ""}>
                        <td className={cn(td, "whitespace-nowrap")}>
                          <b>{horaDeClase(c.startsAt, zona)}</b>
                          {ahoraMismo ? <span className="ml-1.5 text-xs font-bold">· Ahora</span> : null}
                        </td>
                        <td className={td}>
                          <Link
                            to="/teacher/students/$studentId"
                            params={{ studentId: c.studentId }}
                            className={cn("font-bold underline-offset-2 hover:underline", focusRing)}
                          >
                            {nombre}
                          </Link>
                          {c.status === "rescheduled" ? <span className={cn(tag, "ml-2 align-middle")}>Reprogramada</span> : null}
                          {porConfirmar ? <span className="mt-0.5 block text-xs text-brand-ink/70">El estudiante confirmó</span> : null}
                        </td>
                        <td className={td}>
                          {c.topic ?? "Sesión 1-on-1"}
                          <span className="block text-xs text-brand-ink/70">{duracionMin(c)} min</span>
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {c.student?.meetingUrl ? (
                              <a
                                href={c.student.meetingUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Entrar a la clase de ${nombre}`}
                                className={ahoraMismo ? btnRowInk : btnRow}
                              >
                                <Video className="size-3.5" aria-hidden="true" /> Entrar
                              </a>
                            ) : null}
                            {c.meetingUrl ? (
                              <a href={c.meetingUrl} aria-label={`Abrir board de ${nombre}`} className={btnRow}>
                                <LayoutGrid className="size-3.5" aria-hidden="true" /> Board
                              </a>
                            ) : null}
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => validateM.mutate(c.id)}
                              aria-label={`Validar asistencia de ${nombre}, ${horaDeClase(c.startsAt, zona)}`}
                              className={btnRow}
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden="true" /> Validar
                            </button>
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => noShowM.mutate(c.id)}
                              aria-label={`Marcar que ${nombre} no asistió, ${horaDeClase(c.startsAt, zona)}`}
                              className={btnRow}
                            >
                              No se dio
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

        <Seccion
          id="val"
          titulo="Por validar"
          aside={
            porValidar.length > 1 ? (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => validarTodasM.mutate(porValidar.map((c: any) => c.id))}
                aria-label={`Validar las ${porValidar.length} clases pendientes`}
                className={btnRowInk}
              >
                {validarTodasM.isPending ? "Validando…" : "Validar todas"}
              </button>
            ) : null
          }
        >
          <div className="px-4 pb-4">
            {allQ.isLoading ? (
              <Cargando>Cargando tus pendientes…</Cargando>
            ) : allQ.isError ? (
              <EstadoError onRetry={() => void allQ.refetch()}>No pudimos cargar tus pendientes.</EstadoError>
            ) : porValidar.length === 0 ? (
              <Vacio titulo="Todo al día">No tienes clases por validar.</Vacio>
            ) : (
              <>
                <p className="mb-1 text-[13px] text-brand-ink/80">Marca si la clase se dio para que cuente en la nómina.</p>
                <ul>
                  {porValidar.map((c: any) => {
                    const nombre = nombreDe(c);
                    const cuando = `${diaCorto(c.startsAt, zona)} · ${horaDeClase(c.startsAt, zona)}`;
                    return (
                      <li key={c.id} className="border-t border-brand-ink/15 py-3 text-sm">
                        <b>{nombre}</b>
                        <span className="block text-xs text-brand-ink/70">{cuando}</span>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => validateM.mutate(c.id)}
                            aria-label={`Validar clase de ${nombre}, ${cuando}`}
                            className={btnRowInk}
                          >
                            Validar
                          </button>
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => noShowM.mutate(c.id)}
                            aria-label={`Marcar que no se dio la clase de ${nombre}, ${cuando}`}
                            className={btnRow}
                          >
                            No se dio
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </Seccion>
      </div>

      <Seccion
        id="prox"
        titulo="Próximas clases"
        principal={false}
        aside={
          <Link to="/teacher/schedule" className={cn("inline-flex min-h-11 items-center gap-1 text-[13px] font-bold underline underline-offset-2", focusRing)}>
            Ver agenda completa <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      >
        <div className="px-4 pb-4">
          {upcomingQ.isLoading ? (
            <Cargando>Cargando tus próximas clases…</Cargando>
          ) : upcomingQ.isError ? (
            <EstadoError onRetry={() => void upcomingQ.refetch()}>No pudimos cargar tus próximas clases.</EstadoError>
          ) : upcoming.length === 0 ? (
            <Vacio>Sin clases programadas próximamente.</Vacio>
          ) : (
            <ul>
              {upcoming.map((c: any) => {
                const nombre = nombreDe(c);
                return (
                  <li key={c.id} className="grid grid-cols-[64px_1fr] items-center gap-3 border-t border-brand-ink/15 py-2.5 sm:grid-cols-[64px_1fr_auto]">
                    <span className="font-display text-[13px] font-extrabold uppercase leading-[1.05] text-brand-ink">
                      {diaCorto(c.startsAt, zona).split(" ")[0]}
                      <small className="block font-sans text-[11px] font-medium normal-case text-brand-ink/70">{diaMes(c.startsAt, zona)}</small>
                    </span>
                    <span className="min-w-0 text-sm">
                      <b>{nombre}</b>
                      <span className="block text-xs text-brand-ink/70">
                        {horaDeClase(c.startsAt, zona)} · {c.topic ?? "Sesión 1-on-1"}
                      </span>
                    </span>
                    <span className="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
                      {c.student?.meetingUrl ? (
                        <a href={c.student.meetingUrl} target="_blank" rel="noreferrer" aria-label={`Entrar a la clase de ${nombre}`} className={btnRow}>
                          <Video className="size-3.5" aria-hidden="true" /> Entrar
                        </a>
                      ) : null}
                      {c.meetingUrl ? (
                        <a href={c.meetingUrl} aria-label={`Abrir board de ${nombre}`} className={btnRow}>
                          <LayoutGrid className="size-3.5" aria-hidden="true" /> Board
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Seccion>
    </div>
  );
}

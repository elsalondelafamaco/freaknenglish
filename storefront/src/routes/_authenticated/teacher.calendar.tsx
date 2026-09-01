import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { AlertTriangle, CalendarOff, ExternalLink, Plus, Snowflake, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { classesApi, scheduleApi, teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/calendar")({
  head: () => ({ meta: [{ title: "Calendario — Freakn for Teachers" }] }),
  component: TeacherCalendar,
});

type PendingMove = { classId: string; startsAt: string; revert: () => void; label: string };
type Selected = {
  id: string; startsAt: string; endsAt: string; status: string;
  meetingUrl: string | null;
  student: { id: string; fullName: string; paymentActive: boolean; meetingUrl?: string | null };
};

/** Registrar ausencia por rango de fechas (vacaciones, cita médica, etc.). */
function AbsenceDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("Vacaciones");
  const createM = useMutation({
    mutationFn: () => teachersApi.createAbsence(new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), reason),
    onSuccess: (r) => {
      const n = r.affected?.length ?? 0;
      toast.success(n > 0
        ? `Ausencia registrada — ${n} clase(s) canceladas; estudiantes y admin notificados.`
        : "Ausencia registrada (sin clases afectadas en ese rango).");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar la ausencia"),
  });
  const valid = startsAt && endsAt && new Date(endsAt) > new Date(startsAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-brand-ink">Registrar ausencia</h3>
        <p className="mt-1 text-sm text-brand-ink/65">
          Indica el rango en el que no estarás disponible. Las clases dentro del rango se
          cancelan y se avisa a tus estudiantes y al admin.
        </p>
        <div className="mt-4 grid gap-3">
          <label className="text-xs font-semibold text-brand-ink/70">
            Desde
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
          </label>
          <label className="text-xs font-semibold text-brand-ink/70">
            Hasta
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
          </label>
          <label className="text-xs font-semibold text-brand-ink/70">
            Motivo
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm">
              {["Vacaciones", "Cita médica", "Enfermedad", "Otro"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/40">Cancelar</button>
          <button
            disabled={!valid || createM.isPending}
            onClick={() => createM.mutate()}
            className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50"
          >
            {createM.isPending ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ISO → valor para <input type="datetime-local"> en hora local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#111827",
  validated: "#059669",
  no_show: "#dc2626",
  cancelled: "#9ca3af",
  // Morado y no ámbar: el ámbar ya es el borde de "estudiante sin pago"
  // (#f59e0b) y una clase movida se leía como una alerta de cobro.
  rescheduled: "#7c3aed",
  // Congelada: sin este color se pintaba igual de negra que una programada y
  // no había forma de distinguir en el calendario cuál estaba por reprogramar.
  pending_reschedule: "#0284c7",
};

const NOMBRE_DIA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
/** "lunes, martes, miércoles, jueves y viernes" a partir de los días de la config. */
function diasHabiles(days: number[]): string {
  const nombres = days.slice().sort().map((d) => NOMBRE_DIA[d]);
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programada",
  validated: "Tomada",
  no_show: "No tomada",
  cancelled: "Cancelada",
  rescheduled: "Reprogramada",
  pending_reschedule: "Por reprogramar",
};

function TeacherCalendar() {
  const qc = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  // Cruce pendiente de confirmar: el backend avisó de otra clase a esa hora y
  // el profe decide si pone las dos.
  const [cruce, setCruce] = useState<{
    mensaje: string;
    reintentar: { id: string; startsAt: string; scope: "once" | "forever"; permitirCruce: boolean };
  } | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  // Mover a otra fecha/semana (one-off) sin depender del drag de la semana visible.
  const [moveDraft, setMoveDraft] = useState<string | null>(null);
  const calRef = useRef<FullCalendar | null>(null);

  const cfgQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const calQ = useQuery({
    queryKey: ["teacher", "calendar", range?.from, range?.to],
    queryFn: () => teachersApi.calendar(range!.from, range!.to),
    enabled: !!range,
  });
  // Ausencias (capa informativa integrada al calendario).
  const absQ = useQuery({ queryKey: ["teacher", "absences"], queryFn: () => teachersApi.absences() });
  const [absOpen, setAbsOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teacher", "calendar"] });
  const moveM = useMutation({
    mutationFn: (v: { id: string; startsAt: string; scope: "once" | "forever"; permitirCruce?: boolean }) =>
      teachersApi.rescheduleClass(v.id, v.startsAt, v.scope, !!v.permitirCruce),
    onSuccess: (_r, v) => {
      toast.success(v.scope === "forever" ? "Horario actualizado para siempre" : "Clase movida (solo esta semana)");
      setPendingMove(null);
      setCruce(null);
      setSelected(null);
      setMoveDraft(null);
      invalidate();
    },
    onError: (e: any, v) => {
      // Cruce de horario: no es un error, es una pregunta. El profe puede
      // querer dos clases a la misma hora —el que no entró y una reposición—,
      // así que se le pregunta con el nombre del otro alumno en vez de
      // rechazarlo. Ver `class-clash.ts` en el backend.
      if (e?.code === "clash") {
        setCruce({ mensaje: e.message, reintentar: { ...v, permitirCruce: true } });
        return;
      }
      toast.error(e?.message ?? "No se pudo mover la clase");
      pendingMove?.revert();
      setPendingMove(null);
      invalidate();
    },
  });
  const noShowM = useMutation({
    mutationFn: (id: string) => classesApi.noShow(id),
    onSuccess: () => { toast.success("Marcada como no tomada"); setSelected(null); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo marcar"),
  });
  const freezeM = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => classesApi.freeze(v.id, v.reason),
    onSuccess: () => {
      toast.success("Clase congelada — no cuenta como tomada. Ponle fecha cuando la tengas.");
      setSelected(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo congelar"),
  });
  const unfreezeM = useMutation({
    mutationFn: (id: string) => classesApi.unfreeze(id),
    onSuccess: () => { toast.success("Clase de vuelta en su horario"); setSelected(null); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo descongelar"),
  });
  const invalidateAbs = () => {
    qc.invalidateQueries({ queryKey: ["teacher", "absences"] });
    qc.invalidateQueries({ queryKey: ["teacher", "calendar"] });
  };
  const delAbsM = useMutation({
    mutationFn: (id: string) => teachersApi.deleteAbsence(id),
    onSuccess: () => { toast.success("Ausencia eliminada; las clases del rango vuelven a quedar programadas."); invalidateAbs(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const events = useMemo(() => {
    const data = calQ.data;
    if (!data) return [];
    const classEvents = data.classes.map((c) => ({
      id: c.id,
      title: c.student.fullName,
      start: c.startsAt,
      end: c.endsAt,
      backgroundColor: STATUS_COLOR[c.status] ?? "#111827",
      borderColor: c.student.paymentActive ? (STATUS_COLOR[c.status] ?? "#111827") : "#f59e0b",
      // Una clase ya movida se puede volver a mover: dejarla clavada era la
      // mitad de por qué "reprogramada" se sentía como un error del sistema.
      // Y las no tomadas también: es justo la que el profe quiere correr para
      // reponerla con otro alumno.
      editable: ["scheduled", "rescheduled", "no_show", "validated"].includes(c.status),
      extendedProps: c,
    }));
    const absenceEvents = data.absences.map((a) => ({
      id: `abs-${a.id}`,
      start: a.startsAt,
      end: a.endsAt,
      display: "background" as const,
      backgroundColor: "#fca5a5",
      overlap: true,
    }));
    return [...classEvents, ...absenceEvents];
  }, [calQ.data]);

  const cfg = cfgQ.data;

  // Valida el destino del "mover clase" contra la ventana operativa (por
  // política no se dictan clases fuera de ella: no entran a nómina, y el
  // calendario ni siquiera pinta sábado y domingo).
  const errorDestino = (() => {
    if (!moveDraft || !cfg) return null;
    const d = new Date(moveDraft);
    if (Number.isNaN(d.getTime())) return "Fecha inválida.";
    if (!cfg.days.includes(d.getDay())) {
      return `No se dictan clases los ${NOMBRE_DIA[d.getDay()]}. Solo ${diasHabiles(cfg.days)}.`;
    }
    if (d.getHours() < cfg.startHour || d.getHours() > cfg.endHour) {
      return `La hora debe estar entre ${cfg.startHour}:00 y ${cfg.endHour}:00.`;
    }
    return null;
  })();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Calendario</h1>
          <p className="mt-1 text-sm text-brand-ink/65">
            Arrastra una clase para reprogramarla. El borde <span className="font-semibold text-amber-600">ámbar</span> indica estudiante sin pago activo.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-brand-ink/60">
          {Object.entries({ Programada: "scheduled", Reprogramada: "rescheduled", Tomada: "validated", "No tomada": "no_show", "Por reprogramar": "pending_reschedule" }).map(([label, st]) => (
            <span key={st} className="inline-flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full" style={{ background: STATUS_COLOR[st] }} /> {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-[#fca5a5]" /> Ausencia
          </span>
        </div>
      </header>

      <div className="freakn-calendar overflow-x-auto rounded-3xl border border-brand-line bg-white p-2 shadow-soft md:p-4">
        <div className="min-w-[640px]">
        <FullCalendar
          ref={calRef as any}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          // OJO: aquí NO se puede poner timeZone="America/Bogota". FullCalendar
          // solo resuelve nombres de zona con un plugin (@fullcalendar/luxon3 o
          // moment-timezone), y sin él NO avisa: se comporta como UTC. Lo puse
          // así y corrió TODAS las clases +5 horas — las de la tarde se salieron
          // de la franja visible y parecía que habían desaparecido.
          //
          // 'local' es la hora del navegador, que para profes y admin en
          // Colombia es la correcta. Para fijarlo de verdad hay que instalar el
          // plugin primero.
          locale="es"
          buttonText={{ today: "Hoy" }}
          allDaySlot={false}
          slotDuration="01:00:00"
          slotMinTime={`${String(cfg?.startHour ?? 6).padStart(2, "0")}:00:00`}
          slotMaxTime={`${String((cfg?.endHour ?? 20) + 1).padStart(2, "0")}:00:00`}
          hiddenDays={cfg ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !cfg.days.includes(d)) : [0, 6]}
          height="auto"
          nowIndicator
          events={events}
          editable
          eventDurationEditable={false}
          datesSet={(arg) => {
            const from = arg.start.toISOString();
            const to = arg.end.toISOString();
            setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
          }}
          eventDrop={(info) => {
            const c = info.event.extendedProps as Selected;
            setPendingMove({
              classId: info.event.id,
              startsAt: info.event.start!.toISOString(),
              revert: info.revert,
              label: `${c.student?.fullName ?? "Clase"} → ${info.event.start!.toLocaleString("es-CO", { weekday: "long", hour: "2-digit", minute: "2-digit" })}`,
            });
          }}
          eventClick={(info) => {
            if (info.event.display === "background") return;
            setSelected(info.event.extendedProps as Selected);
          }}
          eventContent={(arg) => {
            const c = arg.event.extendedProps as Selected;
            if (arg.event.display === "background") return null;
            return (
              <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
                <div className="truncate font-semibold">
                  {!c.student?.paymentActive ? "⚠ " : ""}{c.student?.fullName}
                </div>
                <div className="opacity-80">{arg.timeText}</div>
              </div>
            );
          }}
        />
        </div>
      </div>

      {/* Ausencias: informativo, integrado al calendario (franja roja). */}
      <section className="rounded-3xl border border-brand-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-brand-ink">
              <CalendarOff className="size-4" /> Mis ausencias
            </h2>
            <p className="mt-0.5 text-xs text-brand-ink/55">
              Se ven como franja roja en tu calendario. Al registrar una, las clases del
              rango se cancelan, tus estudiantes reciben aviso y el admin coordina la reposición.
            </p>
          </div>
          <button
            onClick={() => setAbsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
          >
            <Plus className="size-3.5" /> Registrar ausencia
          </button>
        </div>
        {(absQ.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-brand-ink/55">No tienes ausencias registradas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-line/60">
            {(absQ.data ?? []).map((a: any) => {
              const past = new Date(a.endsAt).getTime() < Date.now();
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <span className="font-semibold capitalize text-brand-ink">
                      {new Date(a.startsAt).toLocaleString("es-CO", { weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-brand-ink/55">
                      {" — "}
                      {new Date(a.endsAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="ml-2 rounded-full bg-brand-cream/70 px-2 py-0.5 text-[11px] text-brand-ink/60">
                      {a.reason ?? "Sin motivo"}
                    </span>
                  </div>
                  {!past ? (
                    <button
                      onClick={() => delAbsM.mutate(a.id)}
                      disabled={delAbsM.isPending}
                      className="inline-flex items-center gap-1 rounded-full border border-brand-line px-3 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="size-3" /> Eliminar
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {absOpen ? (
        <AbsenceDialog
          onClose={() => setAbsOpen(false)}
          onDone={() => {
            setAbsOpen(false);
            invalidateAbs();
          }}
        />
      ) : null}

      {/* Modal: ¿solo esta semana o siempre? (AC-17) */}
      {pendingMove ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-6">
            <h3 className="text-lg font-bold text-brand-ink">¿Cómo aplicamos el cambio?</h3>
            <p className="mt-1 text-sm text-brand-ink/65">{pendingMove.label}</p>
            <div className="mt-5 grid gap-2">
              <button
                disabled={moveM.isPending}
                onClick={() => moveM.mutate({ id: pendingMove.classId, startsAt: pendingMove.startsAt, scope: "once" })}
                className="rounded-2xl border border-brand-line bg-white px-4 py-3 text-left text-sm hover:bg-brand-cream/40 disabled:opacity-60"
              >
                <div className="font-semibold text-brand-ink">Solo esta semana</div>
                <div className="text-xs text-brand-ink/60">Las demás semanas siguen en el horario habitual.</div>
              </button>
              <button
                disabled={moveM.isPending}
                onClick={() => moveM.mutate({ id: pendingMove.classId, startsAt: pendingMove.startsAt, scope: "forever" })}
                className="rounded-2xl border border-brand-ink bg-brand-ink px-4 py-3 text-left text-sm text-white hover:bg-brand-ink-soft disabled:opacity-60"
              >
                <div className="font-semibold">Para siempre</div>
                <div className="text-xs opacity-80">Mueve el horario fijo del estudiante y todas sus clases futuras.</div>
              </button>
            </div>
            <button
              onClick={() => { pendingMove.revert(); setPendingMove(null); }}
              className="mt-4 w-full rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/40"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Confirmación de cruce: dos clases a la misma hora es válido (una
          reposición encima de la que no se tomó), pero nunca por accidente. */}
      {cruce ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-6">
            <h3 className="text-lg font-bold text-brand-ink">Ya tienes clase a esa hora</h3>
            <p className="mt-2 text-sm text-brand-ink/70">{cruce.mensaje}</p>
            <p className="mt-2 text-xs text-brand-ink/55">
              Se verán las dos en el calendario, una al lado de la otra. Útil cuando el alumno no
              entró y quieres usar esa hora de reposición con otro.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => { cruce.reintentar && pendingMove?.revert(); setCruce(null); setPendingMove(null); invalidate(); }}
                className="rounded-full border border-brand-line px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40"
              >
                No, dejar como estaba
              </button>
              <button
                disabled={moveM.isPending}
                onClick={() => moveM.mutate(cruce.reintentar)}
                className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-60"
              >
                Sí, poner las dos
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal detalle de clase */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 px-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-brand-ink">{selected.student.fullName}</h3>
                <p className="text-sm text-brand-ink/65">
                  {new Date(selected.startsAt).toLocaleString("es-CO", { weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: STATUS_COLOR[selected.status] ?? "#111827" }}>
                {STATUS_LABEL[selected.status] ?? "Programada"}
              </span>
            </div>
            {!selected.student.paymentActive ? (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Este estudiante no tiene pago activo. Tenlo presente antes de dictar la clase.
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.student.meetingUrl ? (
                <a href={selected.student.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft">
                  Entrar <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              {selected.meetingUrl ? (
                <a href={selected.meetingUrl} className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40">
                  Board
                </a>
              ) : null}
              {["scheduled", "validated"].includes(selected.status) ? (
                <button
                  disabled={noShowM.isPending}
                  onClick={() => noShowM.mutate(selected.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  <XCircle className="size-3.5" /> No tomada
                </button>
              ) : null}
              {/* Congelar: la clase sale de circulación (no cuenta como tomada
                  ni entra a nómina) hasta que se le ponga fecha. Es lo que
                  hace falta cuando el estudiante pide mover y todavía no se
                  ha acordado para cuándo. */}
              {["scheduled", "rescheduled", "validated", "no_show"].includes(selected.status) ? (
                <button
                  disabled={freezeM.isPending}
                  onClick={() => {
                    const motivo = prompt("¿Por qué se reprograma? (opcional)") ?? undefined;
                    freezeM.mutate({ id: selected.id, reason: motivo });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
                >
                  <Snowflake className="size-3.5" /> Congelar
                </button>
              ) : null}
              {selected.status === "pending_reschedule" ? (
                <button
                  disabled={unfreezeM.isPending}
                  onClick={() => unfreezeM.mutate(selected.id)}
                  className="inline-flex items-center rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-60"
                >
                  Volver a su horario
                </button>
              ) : null}
              <Link
                to="/teacher/students/$studentId"
                params={{ studentId: selected.student.id }}
                className="inline-flex items-center rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
              >
                Ver estudiante
              </Link>
            </div>

            {/* Mover a otra fecha (incluida OTRA SEMANA) — solo esta clase.
                También desde `validated`/`no_show`/congelada: el caso real es
                justamente ese, una clase que el sistema ya dio por tomada y
                que en realidad hay que correr a una fecha futura. */}
            {["scheduled", "rescheduled", "pending_reschedule", "validated", "no_show"].includes(selected.status) ? (
              <div className="mt-4 rounded-2xl border border-brand-line bg-brand-cream/30 p-3">
                <div className="text-xs font-semibold text-brand-ink">
                  Mover esta clase (una sola vez, puede ser a otra semana)
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={moveDraft ?? toLocalInput(selected.startsAt)}
                    onChange={(e) => setMoveDraft(e.target.value)}
                    className="rounded-xl border border-brand-line bg-white px-3 py-2 text-xs focus:border-brand-ink focus:outline-none"
                  />
                  <button
                    disabled={moveM.isPending || moveDraft === null || !!errorDestino}
                    // No se cierra aquí: si hay cruce hay que preguntar, y
                    // cerrando el modal antes se perdía el contexto. Lo cierra
                    // `onSuccess`.
                    onClick={() => {
                      moveM.mutate({ id: selected.id, startsAt: new Date(moveDraft!).toISOString(), scope: "once" });
                    }}
                    className="rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50"
                  >
                    Mover clase
                  </button>
                </div>
                {/* Aviso antes de mandar: el backend igual lo rechaza, pero
                    equivocarse de fecha y enterarse solo por un toast rojo es
                    justo lo que hizo que una clase terminara en un sábado. */}
                {errorDestino ? (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-700">{errorDestino}</p>
                ) : null}
                <p className="mt-1.5 text-[11px] text-brand-ink/55">
                  El horario recurrente no cambia: la próxima semana la clase vuelve a su franja habitual.
                  {cfg ? ` Solo ${diasHabiles(cfg.days)}, de ${cfg.startHour}:00 a ${cfg.endHour}:00.` : ""}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

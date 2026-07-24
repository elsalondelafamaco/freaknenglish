import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { AlertTriangle, ExternalLink, XCircle } from "lucide-react";
import { toast } from "sonner";
import { classesApi, scheduleApi, teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/calendar")({
  head: () => ({ meta: [{ title: "Calendario — Freakn for Teachers" }] }),
  component: TeacherCalendar,
});

type PendingMove = { classId: string; startsAt: string; revert: () => void; label: string };
type Selected = {
  id: string; startsAt: string; endsAt: string; status: string;
  meetingUrl: string | null; student: { id: string; fullName: string; paymentActive: boolean };
};

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#111827",
  validated: "#059669",
  no_show: "#dc2626",
  cancelled: "#9ca3af",
  rescheduled: "#d97706",
};

function TeacherCalendar() {
  const qc = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const calRef = useRef<FullCalendar | null>(null);

  const cfgQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const calQ = useQuery({
    queryKey: ["teacher", "calendar", range?.from, range?.to],
    queryFn: () => teachersApi.calendar(range!.from, range!.to),
    enabled: !!range,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teacher", "calendar"] });
  const moveM = useMutation({
    mutationFn: (v: { id: string; startsAt: string; scope: "once" | "forever" }) =>
      teachersApi.rescheduleClass(v.id, v.startsAt, v.scope),
    onSuccess: (_r, v) => {
      toast.success(v.scope === "forever" ? "Horario actualizado para siempre" : "Clase movida (solo esta semana)");
      setPendingMove(null);
      invalidate();
    },
    onError: (e: any) => {
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
      editable: c.status === "scheduled",
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
          {Object.entries({ Programada: "scheduled", Tomada: "validated", "No tomada": "no_show" }).map(([label, st]) => (
            <span key={st} className="inline-flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full" style={{ background: STATUS_COLOR[st] }} /> {label}
            </span>
          ))}
        </div>
      </header>

      <div className="freakn-calendar rounded-3xl border border-brand-line bg-white p-4 shadow-soft">
        <FullCalendar
          ref={calRef as any}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          locale="es"
          buttonText={{ today: "Hoy" }}
          allDaySlot={false}
          slotDuration="01:00:00"
          slotMinTime={`${String(cfg?.startHour ?? 7).padStart(2, "0")}:00:00`}
          slotMaxTime={`${String((cfg?.endHour ?? 18) + 1).padStart(2, "0")}:00:00`}
          hiddenDays={cfg ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !cfg.days.includes(d)) : [0, 6]}
          height="auto"
          nowIndicator
          events={events}
          editable
          eventDurationEditable={false}
          datesSet={(arg) => setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() })}
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
                {selected.status === "validated" ? "Tomada" : selected.status === "no_show" ? "No tomada" : selected.status === "cancelled" ? "Cancelada" : "Programada"}
              </span>
            </div>
            {!selected.student.paymentActive ? (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Este estudiante no tiene pago activo. Tenlo presente antes de dictar la clase.
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.meetingUrl ? (
                <a href={selected.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft">
                  Abrir aula <ExternalLink className="size-3.5" />
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
              <Link
                to="/teacher/students/$studentId"
                params={{ studentId: selected.student.id }}
                className="inline-flex items-center rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
              >
                Ver estudiante
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

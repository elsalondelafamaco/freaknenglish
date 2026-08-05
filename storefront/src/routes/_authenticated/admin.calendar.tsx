import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { adminApi, scheduleApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/admin/calendar")({
  head: () => ({ meta: [{ title: "Calendario — Admin Freakn'" }] }),
  component: AdminCalendar,
});

// Paleta estable por profesor (hash → color).
const PALETTE = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};

/** Quita tildes y baja a minúsculas, para que "jose" encuentre a "José". */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function AdminCalendar() {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [verDisponibilidad, setVerDisponibilidad] = useState(true);

  const cfgQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const calQ = useQuery({
    queryKey: ["admin", "calendar", range?.from, range?.to],
    queryFn: () => adminApi.calendar(range!.from, range!.to),
    enabled: !!range,
  });
  // La disponibilidad es semanal y no depende del rango visible: se pide una
  // sola vez y FullCalendar la repite en cada semana.
  const dispQ = useQuery({
    queryKey: ["admin", "availability"],
    queryFn: () => scheduleApi.adminAllAvailability(),
    staleTime: 5 * 60_000,
  });

  const teachers = calQ.data?.teachers ?? [];
  const visible = (id: string) => !hidden.has(id);

  const clases = useMemo(
    () =>
      (calQ.data?.classes ?? [])
        .filter((c) => c.teacher && visible(c.teacher.id) && c.status !== "cancelled")
        .map((c) => ({
          id: c.id,
          title: `${c.student.fullName} · ${c.teacher!.fullName}`,
          start: c.startsAt,
          end: c.endsAt,
          backgroundColor: colorFor(c.teacher!.id),
          borderColor: c.student.paymentActive ? colorFor(c.teacher!.id) : "#f59e0b",
          extendedProps: c,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calQ.data, hidden],
  );

  // Disponibilidad como eventos de FONDO recurrentes: FullCalendar entiende
  // `daysOfWeek` + `startTime`/`endTime` sin plugins extra, así que no hay que
  // proyectar las franjas a fechas concretas semana por semana.
  const disponibilidad = useMemo(() => {
    if (!verDisponibilidad) return [];
    return (dispQ.data ?? [])
      .filter((a) => visible(a.teacherId))
      .map((a) => ({
        id: `disp-${a.id}`,
        daysOfWeek: [a.weekday],
        startTime: a.startsAt,
        endTime: a.endsAt,
        display: "background" as const,
        // ~22% de opacidad: se distingue del fondo pero no compite con las
        // clases, y al superponerse dos profes la zona común se ve más fuerte.
        backgroundColor: `${colorFor(a.teacherId)}38`,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispQ.data, hidden, verDisponibilidad]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return teachers;
    return teachers.filter((t) => normalizar(t.fullName).includes(q));
  }, [teachers, busqueda]);

  function toggleTeacher(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const cfg = cfgQ.data;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Calendario global</h1>
        <p className="mt-1 text-sm text-brand-ink/60">
          Todas las clases de la semana sobre la disponibilidad declarada de cada profe. Borde ámbar
          = estudiante sin pago activo.
        </p>
      </header>

      {/* Calendario + panel de profesores. En móvil el panel va debajo. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_260px] lg:items-start">
        <div className="freakn-calendar overflow-x-auto rounded-3xl border border-brand-line bg-white p-2 shadow-soft md:p-4">
          <div className="min-w-[640px]">
            <FullCalendar
              plugins={[timeGridPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
              locale="es"
              buttonText={{ today: "Hoy" }}
              allDaySlot={false}
              slotDuration="01:00:00"
              slotMinTime={`${String(cfg?.startHour ?? 6).padStart(2, "0")}:00:00`}
              slotMaxTime={`${String((cfg?.endHour ?? 20) + 1).padStart(2, "0")}:00:00`}
              hiddenDays={cfg ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !cfg.days.includes(d)) : [0, 6]}
              height="auto"
              nowIndicator
              events={[...disponibilidad, ...clases]}
              datesSet={(arg) => {
                const from = arg.start.toISOString();
                const to = arg.end.toISOString();
                setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
              }}
              eventContent={(arg) => {
                // Los eventos de fondo (disponibilidad) no llevan contenido.
                if (arg.event.display === "background") return null;
                const c: any = arg.event.extendedProps;
                return (
                  <div className="overflow-hidden px-1 py-0.5 text-[10px] leading-tight">
                    <div className="truncate font-semibold">
                      {!c.student?.paymentActive ? "⚠ " : ""}
                      {c.student?.fullName}
                    </div>
                    <div className="truncate opacity-80">{c.teacher?.fullName}</div>
                  </div>
                );
              }}
            />
          </div>
        </div>

        <PanelProfesores
          teachers={filtrados}
          total={teachers.length}
          hidden={hidden}
          busqueda={busqueda}
          onBuscar={setBusqueda}
          onToggle={toggleTeacher}
          onTodos={() => setHidden(hidden.size > 0 ? new Set() : new Set(teachers.map((t) => t.id)))}
          verDisponibilidad={verDisponibilidad}
          onVerDisponibilidad={setVerDisponibilidad}
          conDisponibilidad={new Set((dispQ.data ?? []).map((a) => a.teacherId))}
        />
      </div>
    </div>
  );
}

/**
 * Panel lateral de profesores: lista con scroll y buscador.
 *
 * Antes eran chips en línea sobre el calendario; con muchos profes ocupaban
 * media pantalla y no había forma de encontrar a uno concreto.
 */
function PanelProfesores({
  teachers,
  total,
  hidden,
  busqueda,
  onBuscar,
  onToggle,
  onTodos,
  verDisponibilidad,
  onVerDisponibilidad,
  conDisponibilidad,
}: {
  teachers: Array<{ id: string; fullName: string }>;
  total: number;
  hidden: Set<string>;
  busqueda: string;
  onBuscar: (v: string) => void;
  onToggle: (id: string) => void;
  onTodos: () => void;
  verDisponibilidad: boolean;
  onVerDisponibilidad: (v: boolean) => void;
  conDisponibilidad: Set<string>;
}) {
  const activos = total - hidden.size;
  return (
    <aside className="rounded-3xl border border-brand-line bg-white p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-brand-ink">Profesores</h2>
        <span className="text-xs text-brand-ink/55">{activos}/{total}</span>
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink/40" />
        <input
          value={busqueda}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Buscar profesor…"
          className="w-full rounded-full border border-brand-line bg-white py-1.5 pl-8 pr-3 text-xs focus:border-brand-ink focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={onTodos}
        className="mt-2 w-full rounded-full border border-brand-ink bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-cream/40"
      >
        {hidden.size > 0 ? "Seleccionar todos" : "Deseleccionar todos"}
      </button>

      <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl bg-brand-cream/30 px-3 py-2 text-xs text-brand-ink/75">
        <input
          type="checkbox"
          checked={verDisponibilidad}
          onChange={(e) => onVerDisponibilidad(e.target.checked)}
        />
        Ver disponibilidad de fondo
      </label>

      {/* Alto acotado + scroll: la lista puede crecer sin empujar el calendario. */}
      <ul className="mt-3 max-h-[52vh] space-y-1 overflow-y-auto pr-1">
        {teachers.length === 0 ? (
          <li className="px-1 py-3 text-xs text-brand-ink/50">Sin resultados.</li>
        ) : (
          teachers.map((t) => {
            const off = hidden.has(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onToggle(t.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-medium transition ${
                    off ? "text-brand-ink/40 hover:bg-brand-cream/40" : "text-brand-ink hover:bg-brand-cream/50"
                  }`}
                >
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ background: colorFor(t.id), opacity: off ? 0.3 : 1 }}
                  />
                  <span className="flex-1 truncate">{t.fullName}</span>
                  {/* Sin franjas declaradas no hay fondo que pintar: se avisa,
                      porque si no parece que el filtro no funciona. */}
                  {!conDisponibilidad.has(t.id) ? (
                    <span className="shrink-0 text-[10px] text-brand-ink/40" title="Sin disponibilidad declarada">
                      sin agenda
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

function AdminCalendar() {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const cfgQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const calQ = useQuery({
    queryKey: ["admin", "calendar", range?.from, range?.to],
    queryFn: () => adminApi.calendar(range!.from, range!.to),
    enabled: !!range,
  });

  const teachers = calQ.data?.teachers ?? [];
  const events = useMemo(
    () =>
      (calQ.data?.classes ?? [])
        .filter((c) => c.teacher && !hidden.has(c.teacher.id) && c.status !== "cancelled")
        .map((c) => ({
          id: c.id,
          title: `${c.student.fullName} · ${c.teacher!.fullName}`,
          start: c.startsAt,
          end: c.endsAt,
          backgroundColor: colorFor(c.teacher!.id),
          borderColor: c.student.paymentActive ? colorFor(c.teacher!.id) : "#f59e0b",
          extendedProps: c,
        })),
    [calQ.data, hidden],
  );

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
          Todas las clases de la semana. Filtra por profesor; borde ámbar = estudiante sin pago activo.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {teachers.map((t) => {
          const off = hidden.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggleTeacher(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                off ? "border-brand-line bg-white text-brand-ink/40" : "border-transparent text-white"
              }`}
              style={off ? {} : { background: colorFor(t.id) }}
            >
              <span className={`inline-block size-2 rounded-full ${off ? "" : "bg-white/80"}`} style={off ? { background: colorFor(t.id) } : {}} />
              {t.fullName}
            </button>
          );
        })}
      </div>

      <div className="freakn-calendar rounded-3xl border border-brand-line bg-white p-4 shadow-soft">
        <FullCalendar
          plugins={[timeGridPlugin]}
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
          datesSet={(arg) => {
            const from = arg.start.toISOString();
            const to = arg.end.toISOString();
            setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
          }}
          eventContent={(arg) => {
            const c: any = arg.event.extendedProps;
            return (
              <div className="overflow-hidden px-1 py-0.5 text-[10px] leading-tight">
                <div className="truncate font-semibold">{!c.student?.paymentActive ? "⚠ " : ""}{c.student?.fullName}</div>
                <div className="truncate opacity-80">{c.teacher?.fullName}</div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

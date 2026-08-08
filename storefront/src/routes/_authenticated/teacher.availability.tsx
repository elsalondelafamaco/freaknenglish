import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paintbrush, Save } from "lucide-react";
import { toast } from "sonner";
import { scheduleApi, teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/availability")({
  head: () => ({ meta: [{ title: "Disponibilidad — Freakn for Teachers" }] }),
  component: AvailabilityEditor,
});

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const cellKey = (d: number, h: number) => `${d}:${h}`;

/** Expande rangos {weekday,startsAt,endsAt} → set de celdas "d:h". */
function rangesToCells(ranges: Array<{ weekday: number; startsAt: string; endsAt: string }>): Set<string> {
  const set = new Set<string>();
  for (const r of ranges) {
    const s = parseInt(r.startsAt.split(":")[0] ?? "0", 10);
    const e = parseInt(r.endsAt.split(":")[0] ?? "0", 10);
    for (let h = s; h < e; h++) set.add(cellKey(r.weekday, h));
  }
  return set;
}

/** Fusiona celdas contiguas por día → rangos para el backend. */
function cellsToRanges(cells: Set<string>): Array<{ weekday: number; startsAt: string; endsAt: string }> {
  const byDay = new Map<number, number[]>();
  for (const k of cells) {
    const [d, h] = k.split(":").map(Number);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(h);
  }
  const out: Array<{ weekday: number; startsAt: string; endsAt: string }> = [];
  for (const [d, hours] of byDay) {
    hours.sort((a, b) => a - b);
    let start = hours[0];
    let prev = hours[0];
    for (let i = 1; i <= hours.length; i++) {
      const h = hours[i];
      if (h !== prev + 1) {
        out.push({ weekday: d, startsAt: `${String(start).padStart(2, "0")}:00`, endsAt: `${String(prev + 1).padStart(2, "0")}:00` });
        start = h;
      }
      prev = h;
    }
  }
  return out;
}

function AvailabilityEditor() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const availQ = useQuery({ queryKey: ["teacher", "availability"], queryFn: () => teachersApi.myAvailability() });
  // Horas que ya tienen clase: despintar una no desasigna al estudiante, así
  // que sin este aviso el desajuste queda invisible.
  const ocupQ = useQuery({
    queryKey: ["teacher", "occupied-slots"],
    queryFn: () => teachersApi.myOccupiedSlots(),
  });

  const [cells, setCells] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const paintMode = useRef<"add" | "remove" | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || !availQ.data) return;
    setCells(rangesToCells(availQ.data));
    loaded.current = true;
  }, [availQ.data]);

  const saveM = useMutation({
    mutationFn: () => teachersApi.saveMyAvailability(cellsToRanges(cells)),
    onSuccess: (r) => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["teacher", "availability"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      const n = r?.reassigned?.length ?? 0;
      toast.success(n > 0 ? `Disponibilidad guardada. ${n} estudiante(s) pendiente(s) asignados.` : "Disponibilidad guardada.");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  // Clases cuyas horas dejaron de estar pintadas. El estudiante sigue
  // asignado (quitar disponibilidad no lo mueve), así que el horario queda
  // fuera de la grilla sin que nada lo señale.
  const descubiertas = useMemo(() => {
    const ocupadas = ocupQ.data ?? [];
    return ocupadas.filter((o) => o.hours.some((h) => !cells.has(cellKey(o.weekday, h))));
  }, [ocupQ.data, cells]);

  /** Celdas con clase, para marcarlas en la grilla antes de despintarlas. */
  const conClase = useMemo(() => {
    const s = new Map<string, string>();
    for (const o of ocupQ.data ?? []) {
      for (const h of o.hours) s.set(cellKey(o.weekday, h), o.studentName ?? "clase asignada");
    }
    return s;
  }, [ocupQ.data]);

  const cfg = cfgQ.data;
  const days = useMemo(() => (cfg ? [...cfg.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) : []), [cfg]);
  const hours = useMemo(
    () => (cfg ? Array.from({ length: cfg.endHour - cfg.startHour + 1 }, (_, i) => cfg.startHour + i) : []),
    [cfg],
  );

  function applyPaint(d: number, h: number) {
    const k = cellKey(d, h);
    setCells((prev) => {
      const next = new Set(prev);
      if (paintMode.current === "add") next.add(k);
      else next.delete(k);
      return next;
    });
    setDirty(true);
  }

  if (cfgQ.isLoading || availQ.isLoading) return <p className="text-sm text-brand-ink/60">Cargando…</p>;

  return (
    <div className="flex flex-col gap-5" onMouseUp={() => (paintMode.current = null)} onMouseLeave={() => (paintMode.current = null)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Disponibilidad</h1>
          <p className="mt-1 max-w-xl text-sm text-brand-ink/65">
            <Paintbrush className="mr-1 inline size-3.5" />
            Pinta las horas en las que puedes dar clase (click o arrastra). Tus estudiantes actuales no se
            ven afectados: esto solo aplica para nuevas asignaciones.
          </p>
        </div>
        <button
          onClick={() => saveM.mutate()}
          disabled={!dirty || saveM.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <Save className="size-4" /> {saveM.isPending ? "Guardando…" : dirty ? "Guardar cambios" : "Guardado"}
        </button>
      </header>

      {descubiertas.length > 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {descubiertas.length} clase(s) tuya(s) quedan fuera de tu disponibilidad
          </p>
          <p className="mt-1 text-xs text-amber-900/70">
            Sigues teniendo estas clases: quitar la hora no reasigna a nadie. Vuelve a pintarla o
            pide al admin que reagende al estudiante.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {descubiertas.map((o, i) => (
              <li key={i} className="text-xs text-amber-950">
                <span className="font-semibold">{o.studentName ?? "—"}</span>
                {` · ${DAY_NAMES[o.weekday]} ${o.hour}:00 (${o.durationMin} min)`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-brand-line bg-white p-4 shadow-soft">
        <div className="min-w-[560px] select-none">
          <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}>
            <div />
            {days.map((d) => (
              <div key={d} className="pb-2 text-center text-xs font-bold uppercase tracking-wide text-brand-ink/70">
                <span className="hidden md:inline">{DAY_NAMES[d]}</span>
                <span className="md:hidden">{DAY_SHORT[d]}</span>
              </div>
            ))}
            {hours.map((h) => (
              <RowCells
                key={h}
                h={h}
                days={days}
                cells={cells}
                conClase={conClase}
                paintMode={paintMode}
                onPaint={applyPaint}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-brand-ink/55">
        {cells.size} hora(s) disponibles por semana · Clases de {cfg?.durationMin ?? 50} min
      </p>
    </div>
  );
}

function RowCells({
  h,
  days,
  cells,
  conClase,
  paintMode,
  onPaint,
}: {
  h: number;
  days: number[];
  cells: Set<string>;
  /** celda → nombre del estudiante que ocupa esa hora, si lo hay. */
  conClase: Map<string, string>;
  paintMode: React.MutableRefObject<"add" | "remove" | null>;
  onPaint: (d: number, h: number) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-3 text-[11px] font-medium text-brand-ink/55">{h}:00</div>
      {days.map((d) => {
        const k = cellKey(d, h);
        const on = cells.has(k);
        const estudiante = conClase.get(k);
        // Hora con clase pero sin pintar: el desajuste que hay que ver de una.
        const descubierta = !!estudiante && !on;
        return (
          <div
            key={`${d}:${h}`}
            onMouseDown={(e) => {
              e.preventDefault();
              paintMode.current = on ? "remove" : "add";
              onPaint(d, h);
            }}
            onMouseEnter={() => {
              if (paintMode.current) onPaint(d, h);
            }}
            className={`relative m-0.5 h-10 cursor-pointer rounded-lg border transition ${
              descubierta
                ? "border-amber-500 bg-amber-100"
                : on
                  ? "border-brand-ink bg-brand-ink/90"
                  : "border-brand-line bg-brand-cream/30 hover:bg-brand-cream/70"
            }`}
            title={
              estudiante
                ? `${DAY_NAMES[d]} ${h}:00 · clase con ${estudiante}${descubierta ? " — sin pintar en tu disponibilidad" : ""}`
                : `${DAY_NAMES[d]} ${h}:00–${h}:50`
            }
          >
            {estudiante ? (
              <span
                className={`absolute right-1 top-1 size-1.5 rounded-full ${
                  descubierta ? "bg-amber-600" : "bg-white/70"
                }`}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

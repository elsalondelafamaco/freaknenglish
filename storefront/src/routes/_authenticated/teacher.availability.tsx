import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Save } from "lucide-react";
import { toast } from "sonner";
import { scheduleApi, teachersApi } from "@/lib/api/endpoints";
import { horaEn12 } from "@/lib/domain/zona-horaria";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, btnChip, btnPrimaryAuto, cardPlain, focusRing } from "@/components/app/AppUi";

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
      // Un "guardada" a secas daba por buena una agenda que no cuadra: si alguna
      // clase quedó fuera de lo pintado hay que decirlo aquí, aunque el panel
      // ámbar de arriba ya la liste. No se bloquea el guardado: quitar una hora
      // no desasigna a nadie y el profe tiene que poder arreglar su agenda.
      const fuera = r?.avisos?.length ?? 0;
      if (fuera > 0) {
        toast.warning(
          `Disponibilidad guardada, pero ${fuera} clase(s) tuya(s) quedan fuera de tu disponibilidad.`,
          { duration: 8000 },
        );
      } else {
        toast.success(n > 0 ? `Disponibilidad guardada. ${n} estudiante(s) pendiente(s) asignados.` : "Disponibilidad guardada.");
      }
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

  if (cfgQ.isLoading || availQ.isLoading) return <Cargando>Cargando tu disponibilidad…</Cargando>;
  if (cfgQ.isError || availQ.isError) {
    return (
      <EstadoError onRetry={() => { void cfgQ.refetch(); void availQ.refetch(); }}>
        No pudimos cargar tu disponibilidad. Revisa tu conexión e inténtalo de nuevo.
      </EstadoError>
    );
  }

  /** Copia las horas pintadas del lunes a todos los demás días (no guarda hasta que lo pidas). */
  function copiarLunes() {
    if (!days.includes(1)) return;
    const horasLunes = hours.filter((h) => cells.has(cellKey(1, h)));
    setCells((prev) => {
      const next = new Set(prev);
      for (const d of days) {
        if (d === 1) continue;
        for (const h of hours) next.delete(cellKey(d, h));
        for (const h of horasLunes) next.add(cellKey(d, h));
      }
      return next;
    });
    setDirty(true);
  }

  return (
    <div className="flex flex-col gap-5" onMouseUp={() => (paintMode.current = null)} onMouseLeave={() => (paintMode.current = null)}>
      <PageHeader
        eyebrowText="Pinta tus horas libres"
        title="Tu disponibilidad"
        highlight="disponibilidad"
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {dirty || saveM.isPending ? (
              <button
                type="button"
                onClick={() => saveM.mutate()}
                disabled={saveM.isPending}
                className={btnPrimaryAuto}
              >
                <Save className="size-4" aria-hidden="true" /> {saveM.isPending ? "Guardando…" : "Guardar cambios"}
              </button>
            ) : (
              <span role="status" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-ink">
                <Check className="size-4" aria-hidden="true" /> Guardado
              </span>
            )}
            {days.includes(1) ? (
              <button type="button" onClick={copiarLunes} className={btnChip}>
                Copiar lunes a toda la semana
              </button>
            ) : null}
          </div>
        }
      />

      {descubiertas.length > 0 ? (
        <div role="alert" className={cn(cardPlain, "bg-brand-yellow-soft px-4 py-3")}>
          <p className="text-sm font-bold text-brand-ink">
            {descubiertas.length} clase(s) tuya(s) quedan fuera de tu disponibilidad
          </p>
          <p className="mt-1 text-xs text-brand-ink/80">
            Sigues teniendo estas clases: quitar la hora no reasigna a nadie. Vuelve a pintarla o
            pide al admin que reagende al estudiante.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {descubiertas.map((o, i) => (
              <li key={i} className="text-xs text-brand-ink">
                <span className="font-bold">{o.studentName ?? "—"}</span>
                {` · ${DAY_NAMES[o.weekday]} ${horaEn12(o.hour)} (${o.durationMin} min)`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Leyenda: cada estado tiene su forma, no solo su color. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-semibold text-brand-ink">
        <span className="inline-flex items-center gap-2"><i className="grid size-[18px] place-items-center border-[1.5px] border-brand-ink bg-brand-ink text-brand-cream dark:text-white"><Check className="size-3" aria-hidden="true" /></i>Disponible</span>
        <span className="inline-flex items-center gap-2"><i className="block size-[18px] border-2 border-brand-ink bg-white" />Estudiante asignado</span>
        <span className="inline-flex items-center gap-2"><i className="block size-[18px] border-2 border-brand-ink bg-brand-yellow-soft" />Con clase, sin pintar</span>
        <span className="inline-flex items-center gap-2"><i className="block size-[18px] border-[1.5px] border-dashed border-brand-ink/60 bg-white" />No disponible</span>
        <span className="font-medium text-brand-ink/70">Click o arrastra para pintar. Tus estudiantes actuales no cambian.</span>
      </div>

      <div className="shadow-hard overflow-x-auto border-2 border-brand-ink bg-white p-3.5">
        <div className="min-w-[640px] select-none">
          <div className="grid gap-[5px]" style={{ gridTemplateColumns: `84px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d} className="py-1.5 text-center font-display text-[12px] font-extrabold uppercase text-brand-ink">
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

      <p className="text-xs text-brand-ink/70">
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
  const hora = horaEn12(h);
  return (
    <>
      <div className="flex items-center justify-end whitespace-nowrap pr-2 text-xs font-bold text-brand-ink/70">{hora}</div>
      {days.map((d) => {
        const k = cellKey(d, h);
        const on = cells.has(k);
        const estudiante = conClase.get(k);
        // Hora con clase pero sin pintar: el desajuste que hay que ver de una.
        const descubierta = !!estudiante && !on;
        const asignada = !!estudiante && on;
        const corto = estudiante ? estudiante.split(" ").slice(0, 2).map((p, i) => (i === 0 ? p : `${p[0]}.`)).join(" ") : "";
        const estado = descubierta
          ? `asignado a ${estudiante}, sin pintar en tu disponibilidad`
          : asignada
            ? `asignado a ${estudiante}`
            : on
              ? "disponible"
              : "no disponible";
        return (
          // Botón real: el mouse pinta al arrastrar; con teclado, Enter o Espacio alterna la celda.
          <button
            key={k}
            type="button"
            aria-label={`${DAY_NAMES[d]} ${hora}, ${estado}`}
            onMouseDown={(e) => {
              e.preventDefault();
              paintMode.current = on ? "remove" : "add";
              onPaint(d, h);
            }}
            onMouseEnter={() => {
              if (paintMode.current) onPaint(d, h);
            }}
            onClick={(e) => {
              // detail 0 = activación por teclado; el clic de mouse ya pintó en mousedown.
              if (e.detail === 0) {
                paintMode.current = on ? "remove" : "add";
                onPaint(d, h);
                paintMode.current = null;
              }
            }}
            className={cn(
              "flex h-[34px] cursor-pointer items-center justify-center gap-1 overflow-hidden whitespace-nowrap px-2 text-xs font-bold text-brand-ink transition-colors",
              focusRing,
              descubierta
                ? "border-2 border-brand-ink bg-brand-yellow-soft"
                : asignada
                  ? "border-2 border-brand-ink bg-white"
                  : on
                    ? "border-[1.5px] border-brand-ink bg-brand-ink text-brand-cream dark:text-white"
                    : "border-[1.5px] border-dashed border-brand-ink/60 bg-white hover:bg-brand-cream-soft",
            )}
          >
            {estudiante ? corto : on ? <Check className="size-3.5" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </>
  );
}

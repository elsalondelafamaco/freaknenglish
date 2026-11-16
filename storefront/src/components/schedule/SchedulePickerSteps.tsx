import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { ScheduleConfig, SlotRef } from "@/lib/api/endpoints";
import {
  ZONA_BOGOTA,
  franjaEnZona,
  horaEn12,
  nombreDeZona,
  zonaDe,
} from "@/lib/domain/zona-horaria";
import { daysFromConfig, hoursFromConfig, toggleSlot } from "./SchedulePickerGrid";
import { focusRing } from "@/components/site/AuthShell";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const card = "shadow-hard border-2 border-brand-ink bg-white p-4 md:p-5";

/**
 * Check de "elegido" en la esquina del botón. Va por fuera del texto: dentro de
 * un botón angosto ("LUN", "7:00 a. m.") se montaba sobre la etiqueta.
 */
function MarcaElegido() {
  return (
    <span
      aria-hidden
      className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border-2 border-brand-ink bg-brand-yellow text-brand-ink"
    >
      <Check className="size-2.5" strokeWidth={4} />
    </span>
  );
}

/** Seleccionado = tinta + check en la esquina (elegir no mueve nada). */
const pill = (activo: boolean) =>
  `relative inline-flex h-11 items-center justify-center rounded-full border-2 border-brand-ink px-3 text-sm font-bold transition-colors ${focusRing} ${
    activo ? "bg-brand-ink text-brand-cream" : "bg-white text-brand-ink hover:bg-brand-cream-soft"
  }`;

/**
 * Selector de horario en dos pasos: primero los DÍAS, después la HORA de cada
 * día elegido. Misma regla de validación que la rejilla (`toggleSlot`) y mismo
 * contrato de props: lo que cambia es la forma de elegir, no lo que se elige.
 *
 * Las casillas siguen siendo hora de Colombia; `zona` solo cambia la etiqueta,
 * igual que en la rejilla.
 */
export function SchedulePickerSteps({
  cfg,
  need,
  selected,
  onChange,
  zona,
}: {
  cfg: ScheduleConfig;
  need: number;
  selected: SlotRef[];
  onChange: (next: SlotRef[]) => void;
  zona?: string;
}) {
  const dias = daysFromConfig(cfg);
  const horas = hoursFromConfig(cfg);
  const propia = zonaDe(zona) !== ZONA_BOGOTA;

  // Días elegidos aunque todavía no tengan hora: la selección real (`selected`)
  // solo guarda franjas completas, así que el paso 1 vive aquí.
  const [diasElegidos, setDiasElegidos] = useState<number[]>(() => [
    ...new Set(selected.map((s) => s.weekday)),
  ]);
  // Una selección que llega de fuera (horario anterior precargado, vuelta
  // atrás) también marca sus días. Nunca se quitan días desde aquí.
  useEffect(() => {
    setDiasElegidos((prev) => {
      const faltan = selected.map((s) => s.weekday).filter((d) => !prev.includes(d));
      return faltan.length ? [...new Set([...prev, ...faltan])] : prev;
    });
  }, [selected]);

  function alternarDia(d: number) {
    if (diasElegidos.includes(d)) {
      setDiasElegidos(diasElegidos.filter((x) => x !== d));
      if (selected.some((s) => s.weekday === d)) onChange(selected.filter((s) => s.weekday !== d));
      return;
    }
    if (need > 0 && diasElegidos.length >= need) {
      toast.info(`Tu plan incluye ${need} clases por semana. Quita un día para cambiar.`);
      return;
    }
    setDiasElegidos([...diasElegidos, d]);
  }

  function alternarHora(weekday: number, hour: number) {
    const next = toggleSlot(selected, { weekday, hour }, cfg, need);
    if (next) onChange(next);
  }

  const diasConHora = dias.filter((d) => diasElegidos.includes(d));

  return (
    <div className="flex flex-col gap-5">
      <section className={card} aria-labelledby="paso-dias">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="paso-dias" className="font-display text-base font-extrabold uppercase text-brand-ink">
            1 · Tus días
          </h2>
          <span className="text-xs font-bold text-brand-ink">
            {diasElegidos.length} de {need}
          </span>
        </div>
        <div
          role="group"
          aria-label="Días de la semana"
          className="mt-3 grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(52px, 1fr))" }}
        >
          {dias.map((d) => {
            const activo = diasElegidos.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={activo}
                aria-label={DAY_NAMES[d]}
                onClick={() => alternarDia(d)}
                className={`${pill(activo)} !px-0 font-display text-[13px] uppercase`}
              >
                {activo ? <MarcaElegido /> : null}
                {DAY_SHORT[d]}
              </button>
            );
          })}
        </div>
      </section>

      <section className={card} aria-labelledby="paso-horas">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="paso-horas" className="font-display text-base font-extrabold uppercase text-brand-ink">
            2 · ¿A qué hora?
          </h2>
          <span className="text-xs text-brand-ink/70">
            {propia ? `Hora de ${nombreDeZona(zonaDe(zona))}` : "Hora de Colombia"}
          </span>
        </div>
        {diasConHora.length === 0 ? (
          <p className="mt-3 text-sm text-brand-ink/70">
            Elige primero tus días y aquí escoges la hora de cada uno.
          </p>
        ) : (
          <div className="mt-2">
            {diasConHora.map((d) => (
              <div
                key={d}
                role="group"
                aria-label={DAY_NAMES[d]}
                className="grid grid-cols-[44px_1fr] items-start gap-2 border-t border-brand-ink/15 py-3 first:border-t-0"
              >
                <span className="pt-3 font-display text-[13px] font-extrabold uppercase text-brand-ink">
                  {DAY_SHORT[d]}
                </span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {horas.map((h) => {
                    const activo = selected.some((s) => s.weekday === d && s.hour === h);
                    const local = propia ? franjaEnZona(d, h, zona) : null;
                    const texto = horaEn12(local?.hour ?? h, local?.minuto ?? 0);
                    const cruce =
                      local && local.cruzaDia !== 0 ? (local.cruzaDia === 1 ? "+1 día" : "−1 día") : null;
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={activo}
                        aria-label={`${DAY_NAMES[d]} ${texto}${cruce ? `, ${cruce}` : ""}${
                          propia ? `, ${h}:00 en Colombia` : ""
                        }`}
                        onClick={() => alternarHora(d, h)}
                        className={`${pill(activo)} whitespace-nowrap !px-1 text-[13px]`}
                      >
                        {activo ? <MarcaElegido /> : null}
                        <span className="flex flex-col items-center leading-tight">
                          {texto}
                          {cruce ? <span className="text-[10px] font-semibold">{cruce}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

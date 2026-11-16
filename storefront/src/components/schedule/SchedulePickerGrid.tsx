import { Check, Zap } from "lucide-react";
import { toast } from "sonner";
import type { ScheduleConfig, SlotRef } from "@/lib/api/endpoints";
import { ZONA_BOGOTA, franjaEnZona, horaEn12, zonaDe } from "@/lib/domain/zona-horaria";
import { cn } from "@/lib/utils";

/**
 * Grilla de selección de horario, ÚNICA en toda la app.
 *
 * Vive aquí porque el checkout y el onboarding la pintaban por separado y se
 * habían desincronizado: el del app dejaba elegir varias clases el mismo día e
 * ignoraba la ventana horaria del admin, así que el backend rechazaba la
 * selección recién al enviarla. Con un solo componente, las validaciones
 * (cantidad del plan, `maxPerDay` y ventana días × horas) son las mismas en
 * ambos lados por construcción.
 *
 * Las validaciones de aquí son de UX: el backend vuelve a validar todo en
 * `validateSelection()` — esta grilla solo evita que el usuario llegue a
 * enviar algo inválido.
 */

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const slotKey = (s: SlotRef) => `${s.weekday}:${s.hour}`;

/** "8:00–8:50" o, con duraciones largas, "8:00–9:15" (cruza la hora). */
export function slotTimeRange(hour: number, durationMin: number): string {
  const end = hour * 60 + durationMin;
  return `${hour}:00–${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`;
}

/** Horas visibles según config. `endHour` es INCLUSIVO (última clase a esa hora). */
export function hoursFromConfig(cfg: ScheduleConfig): number[] {
  return Array.from({ length: Math.max(0, cfg.endHour - cfg.startHour + 1) }, (_, i) => cfg.startHour + i);
}

/** Días visibles, con lunes primero. */
export function daysFromConfig(cfg: ScheduleConfig): number[] {
  return [...cfg.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

/**
 * Aplica una selección/deselección respetando las reglas. Devuelve la nueva
 * lista, o `null` si el toggle no procede (ya avisó por toast).
 */
export function toggleSlot(
  selected: SlotRef[],
  slot: SlotRef,
  cfg: ScheduleConfig,
  need: number,
): SlotRef[] | null {
  const k = slotKey(slot);
  if (selected.some((s) => slotKey(s) === k)) {
    return selected.filter((s) => slotKey(s) !== k);
  }
  if (need > 0 && selected.length >= need) {
    toast.info(`Tu plan incluye ${need} clases por semana. Quita una franja para cambiar.`);
    return null;
  }
  const sameDay = selected.filter((s) => s.weekday === slot.weekday).length;
  if (sameDay >= cfg.maxPerDay) {
    toast.info(cfg.maxPerDay === 1 ? "Solo una clase por día." : `Máximo ${cfg.maxPerDay} clases por día.`);
    return null;
  }
  // Clases largas (planes internos, ej. 75 min): ocupan también la(s) hora(s)
  // siguiente(s), así que no caben al final de la ventana ni pegadas entre sí.
  const span = Math.max(1, Math.ceil(cfg.durationMin / 60));
  if (span > 1) {
    if (slot.hour + span - 1 > cfg.endHour) {
      toast.info(`Una clase de ${cfg.durationMin} min no cabe empezando a las ${slot.hour}:00 (se sale de la ventana).`);
      return null;
    }
    const tooClose = selected.some((s) => s.weekday === slot.weekday && Math.abs(s.hour - slot.hour) < span);
    if (tooClose) {
      toast.info(`Una clase de ${cfg.durationMin} min ocupa también la hora siguiente: separa las franjas del mismo día.`);
      return null;
    }
  }
  return [...selected, slot];
}

export function SchedulePickerGrid({
  cfg,
  need,
  selected,
  onChange,
  autoMap,
  zona,
}: {
  cfg: ScheduleConfig;
  need: number;
  selected: SlotRef[];
  onChange: (next: SlotRef[]) => void;
  /** "weekday:hour" → hay profe libre ⇒ inicio inmediato. Opcional. */
  autoMap?: Map<string, boolean>;
  /**
   * Zona del estudiante. Las CASILLAS siguen significando hora de Colombia
   * —los profes están aquí, `maxPerDay` cuenta por día colombiano y la ventana
   * del admin también—; lo único que cambia es la etiqueta.
   *
   * Sin esto, la grilla pintaba el entero pelado y el backend lo leía como hora
   * de Bogotá: una alumna en San Francisco eligió "9:00" pensando en su hora y
   * acabó con una clase a las 9:00 de Colombia y con otra profesora.
   */
  zona?: string;
}) {
  const days = daysFromConfig(cfg);
  const hours = hoursFromConfig(cfg);

  const toggle = (slot: SlotRef) => {
    const next = toggleSlot(selected, slot, cfg, need);
    if (next) onChange(next);
  };

  return (
    <div className="shadow-hard overflow-x-auto border-2 border-brand-ink bg-white p-4">
      <div className="min-w-[640px]">
        <div className="grid gap-[5px]" style={{ gridTemplateColumns: `84px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d} className="py-1.5 text-center font-display text-[12px] font-extrabold uppercase text-brand-ink">
              <span className="hidden md:inline">{DAY_NAMES[d]}</span>
              <span className="md:hidden">{DAY_SHORT[d]}</span>
            </div>
          ))}
          {hours.map((h) => (
            <HourRow
              key={h}
              h={h}
              days={days}
              autoMap={autoMap}
              selected={selected}
              onToggle={toggle}
              durationMin={cfg.durationMin}
              zona={zona}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HourRow({
  h,
  days,
  autoMap,
  selected,
  onToggle,
  durationMin,
  zona,
}: {
  h: number;
  days: number[];
  autoMap?: Map<string, boolean>;
  selected: SlotRef[];
  onToggle: (s: SlotRef) => void;
  durationMin: number;
  zona?: string;
}) {
  // El desfase no cambia entre columnas, así que basta calcularlo UNA vez por
  // fila: dentro de una misma hora de Bogotá, todos los días se corren igual.
  const propia = zonaDe(zona) !== ZONA_BOGOTA ? franjaEnZona(days[0] ?? 1, h, zona) : null;
  const horaLocal = propia ? horaEn12(propia.hour, propia.minuto) : horaEn12(h);

  return (
    <>
      <div className="flex flex-col items-end justify-center whitespace-nowrap pr-2 text-xs font-bold text-brand-ink/70">
        <span className={propia ? "text-[12px] text-brand-ink" : undefined}>{horaLocal}</span>
        {propia ? (
          <>
            <span className="text-[10px] font-medium leading-tight">{horaEn12(h)} Colombia</span>
            {/* Sin esta marca la cabecera del día estaría mintiendo: en Tokio,
                el lunes a las 20:00 de Colombia es MARTES a las 10:00. */}
            {propia.cruzaDia !== 0 ? (
              <span className="mt-0.5 border border-brand-ink bg-brand-yellow-soft px-1 text-[9px] font-bold text-brand-ink">
                {propia.cruzaDia === 1 ? "+1 día" : "−1 día"}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {days.map((d) => {
        const k = `${d}:${h}`;
        const isSel = selected.some((s) => s.weekday === d && s.hour === h);
        const isAuto = autoMap?.get(k) ?? false;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle({ weekday: d, hour: h })}
            aria-pressed={isSel}
            aria-label={`${DAY_NAMES[d]} ${horaLocal}, ${isSel ? "elegida" : isAuto ? "disponible, inicio inmediato" : "disponible"}`}
            title={propia ? `${horaLocal} · ${horaEn12(h)} en Colombia` : slotTimeRange(h, durationMin)}
            className={cn(
              "flex h-11 items-center justify-center gap-1 whitespace-nowrap text-[11px] font-bold transition-colors",
              "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow",
              isSel
                ? "border-2 border-brand-ink bg-brand-ink text-brand-cream dark:text-white"
                : isAuto
                  ? "border-2 border-brand-ink bg-brand-yellow-soft text-brand-ink hover:bg-brand-yellow"
                  : "border-[1.5px] border-brand-ink/60 bg-white text-brand-ink hover:bg-brand-cream-soft",
            )}
          >
            {/* Elegida = visto; el rayito marca inicio inmediato, pero la hora siempre se ve. */}
            {isSel ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            {!isSel && isAuto ? <Zap className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            {horaLocal}
          </button>
        );
      })}
    </>
  );
}

import { ArrowLeft, ArrowRight, Clock, Zap } from "lucide-react";
import type { SlotRef } from "@/lib/api/endpoints";
import { franjaEnZona } from "@/lib/domain/zona-horaria";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Una franja escrita en la hora de quien la lee: "Lunes 8:00", "Martes 3:30 (+1 día)". */
function textoDeFranja(s: SlotRef, zona: string): string {
  const f = franjaEnZona(s.weekday, s.hour, zona);
  const hora = `${f.hour}:${String(f.minuto).padStart(2, "0")}`;
  const cruce = f.cruzaDia === 1 ? " (+1 día)" : f.cruzaDia === -1 ? " (−1 día)" : "";
  return `${DIAS[s.weekday]} ${hora}${cruce}`;
}

const mismaFranja = (a: SlotRef, b: SlotRef) => a.weekday === b.weekday && a.hour === b.hour;

/**
 * Qué cambia una sugerencia respecto a lo que pidió. Se empareja cada franja
 * nueva con la pedida del mismo día (si la hay) para poder decir "Lunes 8:00 →
 * 10:00" en vez de soltar un horario entero sin contexto.
 */
function diferencias(pedidas: SlotRef[], propuesta: SlotRef[]) {
  const sinTocar = propuesta.filter((p) => pedidas.some((x) => mismaFranja(x, p)));
  const nuevas = propuesta.filter((p) => !pedidas.some((x) => mismaFranja(x, p)));
  let restantes = pedidas.filter((x) => !propuesta.some((p) => mismaFranja(x, p)));
  const cambios = nuevas.map((nueva) => {
    const delMismoDia = restantes.find((x) => x.weekday === nueva.weekday) ?? restantes[0];
    restantes = restantes.filter((x) => x !== delMismoDia);
    return { antes: delMismoDia, despues: nueva };
  });
  return { sinTocar, cambios };
}

/**
 * Paso 2 del horario, solo cuando lo que eligió no tiene profe libre ya.
 *
 * No se le niega nada: puede seguir con su horario y el equipo lo coordina. Pero
 * si le sirve uno parecido que SÍ arranca de inmediato, se lo dejamos a un clic,
 * del más al menos parecido. Las horas van en su zona, como en la rejilla.
 */
export function SugerenciasDeHorario({
  pedidas,
  sugerencias,
  zona,
  onSeguirConElMio,
  onElegir,
  onVolver,
}: {
  pedidas: SlotRef[];
  sugerencias: SlotRef[][];
  zona: string;
  onSeguirConElMio: () => void;
  onElegir: (franjas: SlotRef[]) => void;
  onVolver: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="border-2 border-brand-ink bg-brand-yellow-soft p-5 text-sm text-brand-ink">
        <div className="flex items-center gap-2 font-display text-base font-extrabold uppercase">
          <Clock className="size-4" /> Tu horario necesita coordinación
        </div>
        <p className="mt-2">
          En este momento ningún profe tiene libre exactamente ese horario. Puedes seguir igual: nuestro
          equipo te contacta en menos de 24&nbsp;h hábiles para coordinar tu profesor y el inicio de tus
          clases. <strong>Tu cupo queda garantizado.</strong>
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {/* Por día de la semana: llegan en el orden en que las tocó. */}
          {[...pedidas].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour).map((s) => (
            <li key={`${s.weekday}:${s.hour}`} className="rounded-full border border-brand-ink/30 bg-white px-3 py-1 text-xs font-semibold">
              {textoDeFranja(s, zona)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onSeguirConElMio}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-brand-ink px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5"
        >
          Continuar con mi horario <ArrowRight className="size-4" />
        </button>
      </div>

      {sugerencias.length > 0 ? (
        <section>
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold uppercase text-brand-ink">
            <Zap className="size-4" /> O empieza de inmediato con uno de estos
          </h2>
          <p className="mt-1 text-sm text-brand-ink/65">
            Horarios con profe libre ya, del más al menos parecido al que elegiste.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {sugerencias.map((propuesta, i) => {
              const { sinTocar, cambios } = diferencias(pedidas, propuesta);
              return (
                <li key={propuesta.map((s) => `${s.weekday}:${s.hour}`).join("|")}>
                  <button
                    type="button"
                    onClick={() => onElegir(propuesta)}
                    className="flex h-full w-full flex-col gap-2 rounded-2xl border-2 border-brand-line bg-white p-4 text-left text-sm text-brand-ink transition hover:-translate-y-0.5 hover:border-brand-ink"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink/50">
                      Opción {i + 1}
                    </span>
                    <ul className="flex flex-col gap-1">
                      {cambios.map(({ antes, despues }) => (
                        <li key={`c-${despues.weekday}:${despues.hour}`} className="font-semibold">
                          {antes ? (
                            <>
                              <span className="text-brand-ink/45 line-through">{textoDeFranja(antes, zona)}</span>{" "}
                              → {textoDeFranja(despues, zona)}
                            </>
                          ) : (
                            textoDeFranja(despues, zona)
                          )}
                        </li>
                      ))}
                      {sinTocar.map((s) => (
                        <li key={`s-${s.weekday}:${s.hour}`} className="text-brand-ink/70">
                          {textoDeFranja(s, zona)} · igual
                        </li>
                      ))}
                    </ul>
                    <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-brand-ink">
                      Elegir este y pagar <ArrowRight className="size-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-brand-ink/70 hover:text-brand-ink"
      >
        <ArrowLeft className="size-4" /> Cambiar mi horario
      </button>
    </div>
  );
}

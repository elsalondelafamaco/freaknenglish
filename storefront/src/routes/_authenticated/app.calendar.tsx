import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, Flag, LayoutGrid, MessageCircle, Video } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { classesApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supportWhatsAppUrl } from "@/components/app/PlatformError";
import { inputClass } from "@/components/site/AuthShell";
import {
  DIAS_CORTO,
  DIAS_LARGO,
  MESES_LARGO,
  claveDia,
  diaCorto,
  diaLargo,
  duracionMin,
  horaDeClase,
  lunesDe,
  partesDe,
  partesDeClave,
  sumarDias,
  conProfe,
} from "@/lib/domain/clases-fecha";
import { horaEn12 } from "@/lib/domain/zona-horaria";
import { cn } from "@/lib/utils";
import {
  Cargando,
  EstadoError,
  PageHeader,
  SeccionTitulo,
  Vacio,
  btnChip,
  btnChipInk,
  btnPrimaryAuto,
  btnSecondaryAuto,
  cardPlain,
  cardPrimary,
  eyebrow,
  focusRing,
  rowLine,
  tag,
  tagNeutral,
} from "@/components/app/AppUi";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => ({ meta: [{ title: "Calendario — FreaknEnglish" }] }),
  component: CalendarPage,
});

const startsSoon = (c: any) => {
  const diff = new Date(c.startsAt).getTime() - Date.now();
  return diff < 15 * 60_000 && diff > -60 * 60_000; // 15 min antes → 1 h después
};

type Tab = "upcoming" | "taken" | "all";

/** Alto de una hora en la grilla de la semana. */
const HORA_PX = 48;

/** "7:00" (sin a. m./p. m.: el eje de la grilla ya lo dice). */
const hhmm = (h: number, m: number) => `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;

/** Rango de una clase: "7:00–7:50 a. m." */
function rangoDeClase(c: any, zona?: string | null) {
  const ini = partesDe(c.startsAt, zona);
  const fin = partesDe(new Date(new Date(c.startsAt).getTime() + duracionMin(c) * 60_000), zona);
  const sufijo = horaEn12(fin.hora, fin.min).split(" ").slice(1).join(" ");
  return `${hhmm(ini.hora, ini.min)}–${hhmm(fin.hora, fin.min)} ${sufijo}`;
}

const diasEntre = (a: string, b: string) => {
  const pa = partesDeClave(a);
  const pb = partesDeClave(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
};

function CalendarPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const zona = user?.timezone;
  const [tab, setTab] = useState<Tab>("upcoming");
  const [reporting, setReporting] = useState<any | null>(null);
  const [offset, setOffset] = useState(0);
  const [elegido, setElegido] = useState<string | null>(null);
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: () => classesApi.list() });

  const classes = (classesQ.data ?? []) as any[];
  const now = Date.now();
  const { upcoming, taken, other } = useMemo(() => {
    const upcoming = classes
      .filter((c) => ["scheduled", "rescheduled"].includes(c.status) && new Date(c.endsAt).getTime() >= now)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    const taken = classes
      .filter((c) => c.status === "validated")
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    const other = classes
      .filter((c) => !upcoming.includes(c) && c.status !== "validated")
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { upcoming, taken, other };
  }, [classes, now]);

  // El link de Meet/Zoom lo asigna tu profesor a tu perfil.
  const meetUrl = (user as any)?.meetingUrl as string | undefined;

  const next = upcoming[0];
  const teacherName = classes[0]?.teacher?.fullName as string | undefined;

  // ── Semana en pantalla ───────────────────────────────────────────────
  const hoyClave = claveDia(new Date(), zona);
  const lunes = sumarDias(lunesDe(hoyClave), offset * 7);
  const semanaCompleta = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const porDia = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const c of classes) {
      const k = claveDia(c.startsAt, zona);
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    for (const arr of m.values()) arr.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    return m;
  }, [classes, zona]);
  // Sábado y domingo solo aparecen si ese día hay clase.
  const dias = semanaCompleta.filter((k, i) => i < 5 || (porDia.get(k)?.length ?? 0) > 0);
  const diaPorDefecto = dias.includes(hoyClave)
    ? hoyClave
    : (dias.find((k) => (porDia.get(k)?.length ?? 0) > 0) ?? dias[0]);
  const diaSel = elegido && dias.includes(elegido) ? elegido : diaPorDefecto;
  const clasesDelDia = porDia.get(diaSel) ?? [];

  // Rango de horas que cubre la grilla: lo que hay, con una hora de aire a cada lado.
  const minutosSemana = dias.flatMap((k) =>
    (porDia.get(k) ?? []).map((c) => {
      const p = partesDe(c.startsAt, zona);
      const ini = p.hora * 60 + p.min;
      return [ini, ini + duracionMin(c)] as const;
    }),
  );
  let h0 = minutosSemana.length ? Math.max(0, Math.floor(Math.min(...minutosSemana.map((x) => x[0])) / 60) - 1) : 6;
  let h1 = minutosSemana.length ? Math.min(24, Math.ceil(Math.max(...minutosSemana.map((x) => x[1])) / 60) + 1) : 10;
  if (h1 - h0 < 4) h1 = Math.min(24, h0 + 4);
  if (h1 - h0 < 4) h0 = Math.max(0, h1 - 4);
  const altoGrilla = (h1 - h0) * HORA_PX;
  const topDeClase = (c: any) => {
    const p = partesDe(c.startsAt, zona);
    return ((p.hora * 60 + p.min - h0 * 60) / 60) * HORA_PX;
  };
  const primeraTop = minutosSemana.length ? topDeClase(dias.map((k) => porDia.get(k)?.[0]).find(Boolean)) : altoGrilla / 2 - 20;

  const d0 = partesDeClave(dias[0]);
  const d1 = partesDeClave(dias[dias.length - 1]);
  const tituloSemana =
    d0.m === d1.m
      ? `Semana del ${d0.d} al ${d1.d} de ${MESES_LARGO[d1.m - 1]}`
      : `Semana del ${d0.d} de ${MESES_LARGO[d0.m - 1]} al ${d1.d} de ${MESES_LARGO[d1.m - 1]}`;

  const movidasSemana = dias.flatMap((k) => (porDia.get(k) ?? []).filter((c) => c.status === "rescheduled"));
  const proximaFuera = next && !dias.includes(claveDia(next.startsAt, zona)) ? next : null;
  const cambiarSemana = (n: number) => { setOffset(n); setElegido(null); };

  const hayClases = classes.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrowText={tituloSemana} title="Tu calendario" highlight="calendario">
        Tus clases 1 a 1 con {teacherName ?? "tu profe"} — todas en vivo.
      </PageHeader>

      {classesQ.isLoading ? (
        <Cargando>Cargando tu calendario…</Cargando>
      ) : classesQ.isError ? (
        <EstadoError onRetry={() => void classesQ.refetch()}>
          No pudimos cargar tus clases. Revisa tu conexión e inténtalo de nuevo.
        </EstadoError>
      ) : !hayClases ? (
        <Vacio titulo="Aún no tienes clases">
          Cuando tu profe y tu horario estén listos, tus clases aparecerán aquí.
        </Vacio>
      ) : (
        <>
          {/* Semana */}
          <section aria-label="Semana" className="flex max-w-4xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => cambiarSemana(offset - 1)} className={btnChip}>
                <ChevronLeft className="size-4" aria-hidden="true" /> Anterior
              </button>
              <button type="button" onClick={() => cambiarSemana(offset + 1)} className={btnChip}>
                Siguiente <ChevronRight className="size-4" aria-hidden="true" />
              </button>
              {offset !== 0 ? (
                <button type="button" onClick={() => cambiarSemana(0)} className={btnChip}>
                  Esta semana
                </button>
              ) : null}
            </div>

            <div
              role="group"
              aria-label="Días de la semana"
              className="grid gap-1"
              style={{ gridTemplateColumns: `54px repeat(${dias.length}, minmax(0, 1fr))` }}
            >
              <span />
              {dias.map((k) => {
                const p = partesDeClave(k);
                const sel = k === diaSel;
                const esHoy = k === hoyClave;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={sel}
                    aria-label={`${DIAS_LARGO[p.dow]} ${p.d} de ${MESES_LARGO[p.m - 1]}${esHoy ? ", hoy" : ""}`}
                    onClick={() => setElegido(k)}
                    className={cn(
                      "flex h-14 min-w-0 flex-col items-center justify-center gap-px border-2 border-brand-ink text-[11px] font-semibold",
                      sel
                        ? "bg-brand-ink text-brand-cream dark:text-white"
                        : esHoy
                          ? "bg-brand-yellow-soft text-brand-ink"
                          : "bg-white text-brand-ink",
                      focusRing,
                    )}
                  >
                    {sel ? <CheckCircle2 className="size-3" aria-hidden="true" /> : null}
                    <span className="uppercase">{DIAS_CORTO[p.dow]}</span>
                    <b className="font-display text-[18px] font-extrabold leading-none">{p.d}</b>
                  </button>
                );
              })}
            </div>

            <div
              role="group"
              aria-label="Clases de la semana"
              className="grid gap-1"
              style={{ gridTemplateColumns: `54px repeat(${dias.length}, minmax(0, 1fr))` }}
            >
              <div aria-hidden="true" className="relative" style={{ height: altoGrilla }}>
                {Array.from({ length: h1 - h0 }, (_, i) => (
                  <span
                    key={i}
                    className="absolute right-1 whitespace-nowrap text-[10px] font-bold text-brand-ink/70"
                    style={{ top: i * HORA_PX + 2 }}
                  >
                    {horaEn12(h0 + i, 0)}
                  </span>
                ))}
              </div>
              {dias.map((k) => {
                const delDia = porDia.get(k) ?? [];
                const p = partesDeClave(k);
                const resumen = delDia.length
                  ? `${DIAS_LARGO[p.dow]} ${p.d}: ${delDia.map((c) => `clase ${rangoDeClase(c, zona)}`).join(", ")}`
                  : `${DIAS_LARGO[p.dow]} ${p.d}: libre`;
                return (
                  <div
                    key={k}
                    aria-label={resumen}
                    className="relative border-2 border-brand-ink bg-white"
                    style={{
                      height: altoGrilla,
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_PX - 1}px, color-mix(in oklab, var(--brand-ink) 15%, transparent) ${HORA_PX - 1}px, color-mix(in oklab, var(--brand-ink) 15%, transparent) ${HORA_PX}px)`,
                    }}
                  >
                    {delDia.length === 0 ? (
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-0.5 flex h-10 items-center justify-center border-[1.5px] border-dashed border-brand-ink/60 text-[10px] font-semibold text-brand-ink/70"
                        style={{ top: primeraTop }}
                      >
                        Libre
                      </div>
                    ) : (
                      delDia.map((c) => {
                        const p2 = partesDe(c.startsAt, zona);
                        const fin = partesDe(new Date(new Date(c.startsAt).getTime() + duracionMin(c) * 60_000), zona);
                        const esProxima = c === next;
                        const tomada = c.status === "validated";
                        const sinEfecto = c.status === "cancelled" || c.status === "no_show";
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setElegido(k)}
                            aria-label={`${DIAS_LARGO[p.dow]} ${p.d}, clase ${rangoDeClase(c, zona)}${esProxima ? ", próxima" : ""}`}
                            className={cn(
                              "absolute inset-x-0.5 flex flex-col items-center justify-center border-2 text-center text-[10px] font-extrabold leading-[1.1] text-brand-ink",
                              sinEfecto
                                ? "border-dashed border-brand-ink/60 bg-white font-semibold text-brand-ink/70"
                                : "border-brand-ink",
                              esProxima
                                ? "bg-brand-yellow shadow-[3px_3px_0_0_var(--brand-ink)]"
                                : c.status === "rescheduled" || c.status === "pending_reschedule"
                                  ? "bg-brand-yellow-soft"
                                  : tomada
                                    ? "bg-brand-cream"
                                    : "bg-white",
                              focusRing,
                            )}
                            style={{ top: topDeClase(c), height: Math.max(38, (duracionMin(c) / 60) * HORA_PX - 2) }}
                          >
                            <span>
                              {esProxima
                                ? "Próxima"
                                : c.status === "rescheduled"
                                  ? "Movida"
                                  : tomada
                                    ? "Tomada"
                                    : c.status === "cancelled"
                                      ? "Cancelada"
                                      : c.status === "no_show"
                                        ? "No asistió"
                                        : c.status === "pending_reschedule"
                                          ? "Por mover"
                                          : "Clase"}
                            </span>
                            <span className="font-semibold">{hhmm(p2.hora, p2.min)}–{hhmm(fin.hora, fin.min)}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>

            {proximaFuera ? (
              <button
                type="button"
                onClick={() => cambiarSemana(Math.round(diasEntre(lunesDe(hoyClave), lunesDe(claveDia(proximaFuera.startsAt, zona))) / 7))}
                className={cn(btnChip, "self-start")}
              >
                Ir a mi próxima clase: {diaCorto(proximaFuera.startsAt, zona)}, {horaDeClase(proximaFuera.startsAt, zona)}
              </button>
            ) : null}
          </section>

          {/* Detalle del día elegido */}
          <section
            aria-label={`Detalle del ${DIAS_LARGO[partesDeClave(diaSel).dow]} ${partesDeClave(diaSel).d}`}
            className={cn(cardPrimary, "max-w-4xl p-4 [--hard-x:4px] md:p-5")}
          >
            {clasesDelDia.length === 0 ? (
              <>
                <p className={eyebrow}>
                  {DIAS_LARGO[partesDeClave(diaSel).dow]} {partesDeClave(diaSel).d} · Libre
                </p>
                <p className="mt-1 text-sm text-brand-ink/80">No tienes clases este día.</p>
              </>
            ) : (
              <ul className="flex flex-col gap-4">
                {clasesDelDia.map((c) => (
                  <DetalleClase
                    key={c.id}
                    c={c}
                    zona={zona}
                    esProxima={c === next}
                    meetUrl={meetUrl}
                    teacherName={c.teacher?.fullName ?? teacherName}
                    onReport={() => setReporting(c)}
                  />
                ))}
              </ul>
            )}
          </section>

          {movidasSemana.length > 0 ? (
            <section aria-label="Cambios de esta semana" className="flex max-w-4xl flex-col gap-2">
              {movidasSemana.map((c) => (
                <div key={c.id} className="flex items-start gap-3 text-sm leading-snug">
                  <span className={cn(tag, "mt-0.5 shrink-0")}>Cambio</span>
                  <span>
                    Tu clase{c.topic ? <> <b>{c.topic}</b></> : null} se movió: ahora es el{" "}
                    <b>{diaCorto(c.startsAt, zona)}, {horaDeClase(c.startsAt, zona)}</b>
                  </span>
                </div>
              ))}
            </section>
          ) : null}

          {/* Historial y lista completa */}
          <section aria-labelledby="tus-clases" className="flex max-w-4xl flex-col gap-3">
            <SeccionTitulo id="tus-clases">Tus clases</SeccionTitulo>
            <div role="group" aria-label="Filtrar clases" className="inline-flex self-start overflow-hidden rounded-full border-2 border-brand-ink bg-white">
              {([
                ["upcoming", `Próximas (${upcoming.length})`],
                ["taken", `Tomadas (${taken.length})`],
                ["all", "Todas"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "inline-flex h-11 items-center gap-1.5 px-4 text-[13px] font-bold transition-colors",
                    tab === key ? "bg-brand-ink text-brand-cream dark:text-white" : "bg-white text-brand-ink hover:bg-brand-cream",
                    focusRing,
                  )}
                >
                  {tab === key ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : null}
                  {label}
                </button>
              ))}
            </div>

            {tab === "upcoming" ? (
              upcoming.length === 0 ? (
                <Vacio>No tienes clases programadas todavía.</Vacio>
              ) : (
                <ClassList
                  classes={upcoming}
                  zona={zona}
                  meetUrl={meetUrl}
                  nextId={next?.id}
                  teacherName={teacherName}
                />
              )
            ) : null}

            {tab === "taken" ? (
              taken.length === 0 ? (
                <Vacio>Aún no tienes clases tomadas — tu primera está cerca.</Vacio>
              ) : (
                <ClassList classes={taken} zona={zona} teacherName={teacherName} onReport={(c) => setReporting(c)} />
              )
            ) : null}

            {tab === "all" ? (
              classes.length === 0 ? (
                <Vacio>Aún no tienes clases.</Vacio>
              ) : (
                <ClassList
                  classes={[...upcoming, ...taken, ...other]}
                  zona={zona}
                  teacherName={teacherName}
                  onReport={(c) => (c.status === "validated" || c.status === "no_show" ? setReporting(c) : undefined)}
                />
              )
            ) : null}
          </section>
        </>
      )}

      {reporting ? (
        <ReportDialog
          session={reporting}
          zona={zona}
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            qc.invalidateQueries({ queryKey: ["classes"] });
          }}
        />
      ) : null}
    </div>
  );
}

/** Una clase del día elegido: hora, profe, estado y lo que se puede hacer con ella. */
function DetalleClase({
  c,
  zona,
  esProxima,
  meetUrl,
  teacherName,
  onReport,
}: {
  c: any;
  zona?: string | null;
  esProxima: boolean;
  meetUrl?: string;
  teacherName?: string;
  onReport: () => void;
}) {
  const porVenir = ["scheduled", "rescheduled"].includes(c.status) && new Date(c.endsAt).getTime() >= Date.now();
  const reportable = ["validated", "no_show"].includes(c.status);
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2">
        <p className={eyebrow}>
          {diaLargo(c.startsAt, zona)}
          {esProxima ? (startsSoon(c) ? " · Tu clase es ahora" : " · Próxima clase") : ""}
        </p>
        <StatusPill status={c.status} />
      </div>
      <p className="mt-1.5 text-[15px] text-brand-ink">
        <b>{c.topic ?? "Clase 1 a 1"}</b> · {rangoDeClase(c, zona)} · {teacherName ? conProfe(teacherName) : "tu profe"}
      </p>
      {porVenir || reportable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {porVenir && meetUrl ? (
            <a href={meetUrl} target="_blank" rel="noreferrer" className={startsSoon(c) ? btnChipInk : btnChip}>
              <Video className="size-4" aria-hidden="true" /> Entrar a clase
            </a>
          ) : null}
          {porVenir && !meetUrl ? (
            <span className="inline-flex min-h-11 items-center rounded-full border-2 border-dashed border-brand-ink/60 px-4 text-xs font-bold text-brand-ink/80">
              Tu profe aún no configura el link de la clase
            </span>
          ) : null}
          {porVenir && c.meetingUrl ? (
            <a href={c.meetingUrl} className={btnChip}>
              <LayoutGrid className="size-4" aria-hidden="true" /> Board
            </a>
          ) : null}
          {porVenir ? (
            <a
              href={supportWhatsAppUrl(`Hola, quiero pedir un cambio para mi clase del ${diaLargo(c.startsAt, zona)} a las ${horaDeClase(c.startsAt, zona)}.`)}
              target="_blank"
              rel="noreferrer"
              className={btnChip}
            >
              <MessageCircle className="size-4" aria-hidden="true" /> Pedir cambio de clase
            </a>
          ) : null}
          {reportable ? (
            <button type="button" onClick={onReport} className={btnChip}>
              <Flag className="size-3.5" aria-hidden="true" /> Reportar
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Lista de clases: día y hora a la izquierda, estado y acciones a la derecha. */
function ClassList({
  classes,
  zona,
  meetUrl,
  nextId,
  teacherName,
  onReport,
}: {
  classes: any[];
  zona?: string | null;
  meetUrl?: string;
  nextId?: string;
  teacherName?: string;
  onReport?: (c: any) => void;
}) {
  return (
    <ul className={cn(cardPlain, "px-4")}>
      {classes.map((c, i) => {
        const porVenir = ["scheduled", "rescheduled"].includes(c.status) && new Date(c.endsAt).getTime() >= Date.now();
        const reportable = onReport && ["validated", "no_show"].includes(c.status);
        return (
          <li
            key={c.id}
            className={cn("flex flex-wrap items-center justify-between gap-3 py-3", i > 0 ? rowLine : "", c.id === nextId ? "-mx-4 bg-brand-yellow-soft px-4" : "")}
          >
            <div className="min-w-0">
              <div className="text-sm font-bold text-brand-ink first-letter:uppercase">
                {diaLargo(c.startsAt, zona)}
              </div>
              <div className="text-xs text-brand-ink/70">
                {rangoDeClase(c, zona)} · {c.teacher?.fullName ?? teacherName ?? "tu profe"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={c.status} />
              {porVenir && meetUrl ? (
                <a href={meetUrl} target="_blank" rel="noreferrer" className={btnChip}>
                  <Video className="size-3.5" aria-hidden="true" /> Entrar
                </a>
              ) : null}
              {porVenir && c.meetingUrl ? (
                <a href={c.meetingUrl} className={btnChip}>
                  <LayoutGrid className="size-3.5" aria-hidden="true" /> Board
                </a>
              ) : null}
              {reportable ? (
                <button type="button" onClick={() => onReport!(c)} className={btnChip}>
                  <Flag className="size-3" aria-hidden="true" /> Reportar
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  // Amarillo solo donde hay algo que mirar (movida / por reprogramar).
  const map: Record<string, { label: string; attention: boolean }> = {
    validated: { label: "Tomada", attention: false },
    cancelled: { label: "Cancelada", attention: false },
    no_show: { label: "No asististe", attention: false },
    rescheduled: { label: "Reprogramada", attention: true },
    scheduled: { label: "Programada", attention: false },
    // Sin esta entrada el estudiante veía el string crudo `pending_reschedule`.
    pending_reschedule: { label: "Por reprogramar", attention: true },
  };
  const v = map[status] ?? { label: status, attention: false };
  return <span className={v.attention ? tag : tagNeutral}>{v.label}</span>;
}

/** Reporte de una clase: envía nota al equipo admin (correo + notificación). */
function ReportDialog({ session, zona, onClose, onDone }: { session: any; zona?: string | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const report = useMutation({
    mutationFn: () => classesApi.report(session.id, note.trim()),
    onSuccess: () => {
      toast.success("Reporte enviado — el equipo lo revisará y te contactará.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo enviar el reporte"),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="border-2 border-brand-ink bg-white sm:rounded-none">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold uppercase text-brand-ink">Reportar clase</DialogTitle>
          <DialogDescription className="text-brand-ink/80">
            Clase del {diaLargo(session.startsAt, zona)}, {horaDeClase(session.startsAt, zona)}. Cuéntanos qué pasó — el equipo de
            FreaknEnglish recibirá tu reporte de inmediato.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="nota-reporte" className="-mb-2 text-[13px] font-bold text-brand-ink">
          ¿Qué pasó?
        </label>
        <textarea
          id="nota-reporte"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Ej: mi profe no se conectó, la clase se marcó como tomada pero no la recibí…"
          className={cn(inputClass, "h-auto min-h-28 py-3")}
        />
        <DialogFooter className="gap-2 sm:space-x-0">
          <button type="button" onClick={onClose} className={btnSecondaryAuto}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!note.trim() || report.isPending}
            onClick={() => report.mutate()}
            className={btnPrimaryAuto}
          >
            <Flag className="size-3.5" aria-hidden="true" /> {report.isPending ? "Enviando…" : "Enviar reporte"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

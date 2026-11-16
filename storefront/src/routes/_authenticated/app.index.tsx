import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, Clock, ExternalLink, LayoutGrid, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { classesApi, learningApi, subscriptionsApi } from "@/lib/api/endpoints";
import { leccionesQueCuentan, progresoDelModulo } from "@/lib/learning/progreso";
import {
  claveDia,
  diaCorto,
  diaMes,
  diaRelativo,
  duracionMin,
  horaDeClase,
  lunesDe,
  partesDeClave,
  sumarDias,
  conProfe,
} from "@/lib/domain/clases-fecha";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Cargando,
  EstadoError,
  PageHeader,
  SeccionTitulo,
  Vacio,
  btnChip,
  btnPrimaryAuto,
  btnSecondaryAuto,
  cardPlain,
  cardPrimary,
  eyebrow,
  focusRing,
  rowLine,
  tag,
} from "@/components/app/AppUi";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Mi dashboard — FreaknEnglish" }] }),
  component: DashboardPage,
});

/** Inicial del día en la tira semanal (domingo = 0). La miércoles es X para no repetir la M. */
const INICIAL_DIA = ["D", "L", "M", "X", "J", "V", "S"];

const daysLeeftOk = (d: number | null) => d != null && d <= 5 && d >= 0;

/** Una clase vale como programada si está agendada o solo movida de día. */
const activa = (c: any) => c.status === "scheduled" || c.status === "rescheduled";

function DashboardPage() {
  const { user } = useAuth();
  // Link de Meet/Zoom que el profe asignó al estudiante (NO es el board).
  const meetUrl = (user as any)?.meetingUrl as string | undefined;
  const zona = user?.timezone;
  const qc = useQueryClient();
  const subQ = useQuery({ queryKey: ["me", "subscription"], queryFn: () => subscriptionsApi.mine(), staleTime: 0 });
  const firstName = user?.fullName.split(" ")[0] ?? "estudiante";

  const allQ = useQuery({ queryKey: ["classes"], queryFn: () => classesApi.list() });
  const nextQ = useQuery({ queryKey: ["classes", "upcoming"], queryFn: () => classesApi.upcoming() });
  const modsQ = useQuery({ queryKey: ["learning", "modules", user?.level ?? "beginner"], queryFn: () => learningApi.modules(user?.level ?? "beginner"), enabled: !!user });
  const progQ = useQuery({ queryKey: ["learning", "progress"], queryFn: () => learningApi.progress() });

  const confirmM = useMutation({
    mutationFn: (id: string) => classesApi.confirm(id),
    onSuccess: () => { toast.success("¡Asistencia confirmada!"); qc.invalidateQueries({ queryKey: ["classes"] }); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo confirmar"),
  });

  const all = (allQ.data ?? []) as any[];
  const next = nextQ.data as any;
  const doneIds = useMemo(() => new Set(progQ.data?.completedLessonIds ?? []), [progQ.data]);

  if (!user) return null;
  // Cinturón: si un profe o un admin cae aquí (enlace viejo, marcador,
  // impersonación), NO se le muestra el cartel de "aún no tienes un plan" —
  // no tiene plan porque no es estudiante. El guard de `_authenticated` lo
  // manda a su portal; mientras tanto, esto evita el susto.
  if (!user.roles.includes("student")) return null;

  if (subQ.isLoading) return <Cargando>Cargando tu inicio…</Cargando>;
  if (subQ.isError) {
    return <EstadoError onRetry={() => void subQ.refetch()}>No pudimos cargar tu plan. Revisa tu conexión e inténtalo de nuevo.</EstadoError>;
  }

  const sub = subQ.data as any;
  const subStatus = sub?.status ?? null;
  const subActive = subStatus === "active";
  if (!subActive) {
    const vencida = subStatus === "past_due" || subStatus === "expired";
    const msg = vencida
      ? "Tu suscripción venció. Renueva tu plan para seguir tomando clases."
      : subStatus === "pending"
        ? "Tu pago está en proceso. Te avisaremos apenas se confirme."
        : "Aún no tienes un plan activo. Elige uno para empezar tus clases 1‑a‑1.";
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrowText={`Hola, ${firstName}`} title="Tu cuenta está lista" highlight="lista" />
        <section aria-labelledby="estado-plan" className={cn(cardPrimary, "max-w-2xl bg-brand-yellow-soft p-6 md:p-8")}>
          <p className={eyebrow}>Estado de tu suscripción</p>
          <h2 id="estado-plan" className="mt-2 font-display text-[22px] font-extrabold uppercase leading-[1.08] tracking-[-0.01em] text-brand-ink md:text-[26px]">
            {msg}
          </h2>
          <p className="mt-3 text-sm text-brand-ink/80">
            Cuando tu plan esté activo se desbloquean tu calendario, tus clases 1‑a‑1 y el módulo de aprendizaje.
          </p>
          {subStatus === "pending" ? null : (
            <a href="/checkout" className={cn(btnPrimaryAuto, "mt-6")}>
              {vencida ? "Renovar mi plan" : "Elegir un plan"}
            </a>
          )}
        </section>
      </div>
    );
  }

  // Las reprogramadas cuentan igual: son clases de verdad, solo que movidas.
  const hoyClave = claveDia(new Date(), zona);
  const today = all.find((c) => claveDia(c.startsAt, zona) === hoyClave && activa(c));
  const completed = all.filter((c) => c.status === "validated").length;
  const todayPending = today && !today.studentConfirmedAt;
  // Si hoy hay una clase sin confirmar, esa es la protagonista; si no, la próxima.
  const hero = todayPending ? today : (next ?? null);

  // Semana en curso (lunes a domingo): el domingo y el sábado solo se pintan si hay clase.
  const lunes = lunesDe(hoyClave);
  const semanaDias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const proximas = all
    .filter(activa)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const enSemana = proximas.filter((c) => semanaDias.includes(claveDia(c.startsAt, zona)));
  const despues = proximas.filter((c) => claveDia(c.startsAt, zona) > semanaDias[6]).slice(0, 3);
  const clasesPorDia = new Set(all.filter(activa).map((c) => claveDia(c.startsAt, zona)));
  const diasTira = semanaDias.filter((k, i) => i < 5 || clasesPorDia.has(k));
  const heroDia = hero ? claveDia(hero.startsAt, zona) : null;
  const movidas = proximas.filter((c) => c.status === "rescheduled");
  const porReprogramar = all.filter((c) => c.status === "pending_reschedule");

  // Siguiente módulo con actividades pendientes (el primero que no está bloqueado).
  const mods = (modsQ.data ?? []) as any[];
  const modActual = mods.find((m) => !m.locked && !progresoDelModulo(m.lessons ?? [], doneIds).complete);
  const progActual = modActual ? progresoDelModulo(modActual.lessons ?? [], doneIds) : null;
  const lessons = mods.flatMap((m: any) => leccionesQueCuentan(m.lessons ?? []));
  const pct = lessons.length ? Math.round((lessons.filter((l: any) => doneIds.has(l.id)).length / lessons.length) * 100) : 0;

  const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
  const diasPlan = sub?.plan?.daysPerWeek as number | undefined;
  const planEyebrow = [
    diasPlan ? `Plan ${diasPlan} ${diasPlan === 1 ? "día" : "días"} / semana` : sub?.plan?.name ? `Plan ${sub.plan.name}` : null,
    completed > 0 ? `${completed} ${completed === 1 ? "clase tomada" : "clases tomadas"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrowText={planEyebrow || undefined} title={`Hola, ${firstName}`} highlight={firstName} />

      {/* Avisos: amarillo = atención. Van antes de la clase solo si piden algo. */}
      {daysLeeftOk(daysLeft) ? (
        <section aria-label="Tu plan vence pronto" className={cn(cardPlain, "bg-brand-yellow-soft p-5 md:p-6")}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[15px] font-bold text-brand-ink">
                Tu plan vence {daysLeft === 0 ? "hoy" : daysLeft === 1 ? "mañana" : `en ${daysLeft} días`}
                {end ? ` (${end.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })})` : ""}
              </div>
              <p className="mt-1 text-sm text-brand-ink/80">
                Renueva ahora y tu nuevo mes empieza justo cuando termine el actual — sin perder tu horario ni tu profesor.
              </p>
            </div>
            <a href="/checkout" className={cn(btnPrimaryAuto, "w-auto")}>
              Renovar ahora
            </a>
          </div>
        </section>
      ) : null}

      {user.scheduleAssignmentStatus === "manual_pending" ? (
        <section aria-label="Estamos coordinando tu profesor" className={cn(cardPlain, "bg-brand-yellow-soft p-5 md:p-6")}>
          <p className={eyebrow}>Estamos coordinando tu profesor</p>
          <p className="mt-2 max-w-xl text-sm text-brand-ink/90">
            Tu cupo está garantizado. Nuestro equipo te contacta en menos de 24&nbsp;h hábiles para
            coordinar tu profesor y el inicio de tus clases. Mientras tanto, puedes avanzar en tus módulos.
          </p>
          <p className="mt-2 max-w-xl text-sm font-bold text-brand-ink">
            Tranquilo: tu mes empieza a contar el día que te asignemos profe, no antes. No pierdes
            ni un día de clase por la espera.
          </p>
        </section>
      ) : null}

      {movidas.length > 0 ? (
        <section aria-label="Cambios en tus clases" className="flex flex-col gap-2">
          {movidas.slice(0, 3).map((c) => (
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

      {porReprogramar.length > 0 ? (
        <section aria-label="Clases por reprogramar" className="flex items-start gap-3 text-sm leading-snug">
          <span className={cn(tag, "mt-0.5 shrink-0")}>Por reprogramar</span>
          <span>
            {porReprogramar.length === 1 ? "Una de tus clases está" : `${porReprogramar.length} de tus clases están`} por reprogramar.
            Te avisamos apenas tenga nueva fecha.
          </span>
        </section>
      ) : null}

      {/* La clase que viene: lo primero que quiere saber quien abre el inicio. */}
      {allQ.isLoading || nextQ.isLoading ? (
        <Cargando>Cargando tu próxima clase…</Cargando>
      ) : allQ.isError && nextQ.isError ? (
        <EstadoError onRetry={() => { void allQ.refetch(); void nextQ.refetch(); }}>
          No pudimos cargar tus clases. Revisa tu conexión e inténtalo de nuevo.
        </EstadoError>
      ) : hero ? (
        <section aria-labelledby="prox" className={cn(cardPrimary, "bg-brand-yellow-soft p-4 md:p-6")}>
          <div className="flex items-center gap-2.5">
            <Avatar nombre={hero.teacher?.fullName} />
            <span className="text-sm font-bold text-brand-ink">
              {hero.teacher?.fullName ? conProfe(hero.teacher.fullName) : "Tu profe"}
            </span>
          </div>
          <p id="prox" className={cn(eyebrow, "mt-4 !text-brand-ink/80")}>
            {todayPending ? "Hoy tienes clase" : "Tu próxima clase"}
          </p>
          <p className="mt-1.5 font-display text-[26px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-brand-ink md:text-[32px]">
            {diaRelativo(hero.startsAt, zona) ? `${diaRelativo(hero.startsAt, zona)} · ` : ""}
            {diaCorto(hero.startsAt, zona)}, <span className="normal-case">{horaDeClase(hero.startsAt, zona)}</span>
          </p>
          <p className="mt-1.5 text-sm text-brand-ink/80">
            {duracionMin(hero)} min{hero.topic ? ` · ${hero.topic}` : " · Sesión 1-on-1"}
          </p>

          <div className="mt-4 flex flex-col gap-2.5 sm:max-w-md">
            {/* OJO con los dos campos: `user.meetingUrl` es el Meet/Zoom que
                configura el profe, y `class.meetingUrl` es el board del aula
                (`/boards/<id>`). Aquí se usaba el segundo con la etiqueta del
                primero, así que "Entrar a la clase" abría el board. Mismo
                criterio que el calendario. */}
            {meetUrl ? (
              <a href={meetUrl} target="_blank" rel="noreferrer" className={btnPrimaryAuto}>
                <Video className="size-4" aria-hidden="true" /> Entrar a la clase <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : (
              <div
                role="status"
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 border-dashed border-brand-ink/60 bg-white px-5 text-center text-sm font-bold text-brand-ink/80"
              >
                <Clock className="size-4 shrink-0" aria-hidden="true" /> Tu profe aún no configura el link de la clase
              </div>
            )}
            {hero.meetingUrl ? (
              <Link to={hero.meetingUrl as never} className={btnSecondaryAuto}>
                <LayoutGrid className="size-4" aria-hidden="true" /> Ver board
              </Link>
            ) : null}
            {todayPending ? (
              <button
                type="button"
                onClick={() => confirmM.mutate(today.id)}
                disabled={confirmM.isPending}
                className={btnSecondaryAuto}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {confirmM.isPending ? "Confirmando…" : "Sí, tomé mi clase hoy"}
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <Vacio
          titulo="Aún no tienes clase agendada"
          accion={<Link to="/app/calendar" className={btnChip}>Ver mi calendario</Link>}
        >
          Cuando haya una clase programada, aparecerá aquí con su día, su hora y el botón para entrar.
        </Vacio>
      )}

      {/* Esta semana */}
      <section aria-labelledby="semana" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <SeccionTitulo id="semana">Esta semana</SeccionTitulo>
          <Link to="/app/calendar" className={cn("inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brand-ink underline underline-offset-2 hover:text-brand-ink-soft", focusRing)}>
            Ver calendario <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {allQ.isLoading ? (
          <Cargando>Cargando tu semana…</Cargando>
        ) : allQ.isError ? (
          <EstadoError onRetry={() => void allQ.refetch()}>No pudimos cargar tus clases de la semana.</EstadoError>
        ) : (
          <>
            <div
              role="img"
              aria-label={
                enSemana.length
                  ? `Clases esta semana: ${enSemana.map((c) => diaCorto(c.startsAt, zona)).join(", ")}`
                  : "Sin clases esta semana"
              }
              className="flex justify-between px-3.5 md:max-w-md"
            >
              {diasTira.map((k) => {
                const dow = partesDeClave(k).dow;
                const tiene = clasesPorDia.has(k);
                const esProxima = k === heroDia;
                return (
                  <span key={k} className="flex flex-col items-center gap-1.5 text-xs font-bold text-brand-ink">
                    {INICIAL_DIA[dow]}
                    <i
                      className={cn(
                        "block size-4 rounded-full border-2 border-brand-ink",
                        esProxima ? "bg-brand-yellow shadow-[0_0_0_2px_var(--brand-ink)]" : tiene ? "bg-brand-ink" : "bg-white",
                      )}
                    />
                    {k === hoyClave ? <span className="sr-only">hoy</span> : null}
                  </span>
                );
              })}
            </div>

            {enSemana.length === 0 ? (
              <p className="text-sm text-brand-ink/80">No tienes más clases programadas esta semana.</p>
            ) : (
              <ul>
                {enSemana.map((c) => (
                  <FilaClase key={c.id} c={c} zona={zona} esHoy={claveDia(c.startsAt, zona) === hoyClave} />
                ))}
              </ul>
            )}

            {despues.length > 0 ? (
              <>
                <p className={cn(eyebrow, "mt-2")}>Más adelante</p>
                <ul>
                  {despues.map((c) => (
                    <FilaClase key={c.id} c={c} zona={zona} esHoy={false} />
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>

      {/* Sigue aprendiendo */}
      <Link
        to="/app/learning"
        className={cn(cardPlain, "shadow-hard flex items-center justify-between gap-4 p-4 no-underline [--hard-x:4px] press-hard", focusRing)}
      >
        <span className="min-w-0">
          <span className={cn(eyebrow, "block")}>Sigue aprendiendo</span>
          <span className="mt-1 block text-[15px] font-bold text-brand-ink">
            {modsQ.isLoading
              ? "Cargando tus módulos…"
              : modActual && progActual
                ? `${modActual.title} · ${progActual.done} de ${progActual.total} ${progActual.total === 1 ? "actividad" : "actividades"}`
                : mods.length > 0
                  ? `Nivel ${user.level ?? "beginner"} al día · ${pct}% completado`
                  : "Ir a tus módulos"}
          </span>
          {!modsQ.isLoading && lessons.length > 0 ? (
            <span className="mt-1 block text-xs text-brand-ink/70">{pct}% del nivel completado</span>
          ) : null}
        </span>
        <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Una clase en la lista de la semana: día, tema y hora. Hoy va en amarillo. */
function FilaClase({ c, zona, esHoy }: { c: any; zona?: string | null; esHoy: boolean }) {
  const dia = diaCorto(c.startsAt, zona).split(" ");
  return (
    <li
      className={cn(
        "grid grid-cols-[56px_1fr_auto] items-center gap-2.5 py-2.5",
        rowLine,
        esHoy ? "bg-brand-yellow-soft px-2" : "",
      )}
    >
      <span className="font-display text-[13px] font-extrabold uppercase leading-[1.05] text-brand-ink">
        {dia[0]}
        <small className="block font-sans text-[11px] font-medium normal-case text-brand-ink/70">{diaMes(c.startsAt, zona)}</small>
      </span>
      <span className="min-w-0 text-sm font-bold text-brand-ink">
        {c.topic ?? "Sesión 1-on-1"}
        {esHoy ? <span className={cn(tag, "ml-2 align-middle")}>Hoy</span> : null}
        {c.status === "rescheduled" ? <span className={cn(tag, "ml-2 align-middle")}>Movida</span> : null}
        {c.studentConfirmedAt ? (
          <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-semibold text-brand-ink/70">
            <Check className="size-3" aria-hidden="true" /> Confirmada
          </span>
        ) : null}
      </span>
      <span className="text-[13px] text-brand-ink/80">
        {horaDeClase(c.startsAt, zona)} · {duracionMin(c)} min
      </span>
    </li>
  );
}

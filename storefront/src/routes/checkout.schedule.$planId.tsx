import { useEffect, useMemo, useRef, useState } from "react";
import { ZONA_BOGOTA, etiquetaDeZona, nombreDeZona, zonaDe } from "@/lib/domain/zona-horaria";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { ActivePlanScreen, useActivePlanGate } from "@/components/site/ActivePlanGate";
import { plansApi, scheduleApi, type SlotRef } from "@/lib/api/endpoints";
import { SchedulePickerGrid } from "@/components/schedule/SchedulePickerGrid";
import { useRenovacion } from "@/lib/domain/renovacion";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useZonaDelNavegador } from "@/lib/domain/zona-navegador";
import { copAcobrar } from "@/lib/domain/plans";
import { useRastrearUnaVez } from "@/lib/meta-pixel";
import { SugerenciasDeHorario } from "@/components/schedule/SugerenciasDeHorario";

export const Route = createFileRoute("/checkout/schedule/$planId")({
  head: () => ({ meta: [{ title: "Elige tu horario — FreaknEnglish" }] }),
  // La selección viaja en la URL: volver atrás desde las sugerencias la
  // restaura, y recargar no la pierde. `paso=coordinacion` es la pantalla de
  // "tu horario necesita coordinación".
  //
  // `.catch` en cada campo: un valor raro (un enlace viejo, una URL mal
  // copiada) se ignora en vez de romper. Sin él, `?paso=otra` devolvía la página
  // de error del servidor en lugar de la rejilla.
  validateSearch: z.object({
    slots: z.string().optional().catch(undefined),
    paso: z.enum(["coordinacion"]).optional().catch(undefined),
  }),
  component: SchedulePicker,
});

/**
 * Cuánto vale una respuesta de disponibilidad. Corto a propósito: el cupo de un
 * profe cambia cuando otro compra, pero un minuto alcanza para que la pantalla
 * de coordinación reutilice la respuesta del botón "Continuar".
 */
const VIGENCIA_SUGERENCIAS_MS = 60_000;

export const encodeSlots = (slots: SlotRef[]) => slots.map((s) => `${s.weekday}-${s.hour}`).join(",");
export const decodeSlots = (raw: string | undefined): SlotRef[] =>
  (raw ?? "")
    .split(",")
    .map((p) => p.split("-").map(Number))
    .filter((a) => a.length === 2 && Number.isInteger(a[0]) && Number.isInteger(a[1]))
    .map(([weekday, hour]) => ({ weekday, hour }));

function SchedulePicker() {
  const { planId } = Route.useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  // Aquí todavía no hay cuenta: sin preguntarle al navegador, la rejilla caía
  // siempre en hora de Colombia y ni siquiera lo avisaba. Alguien en Madrid
  // elegía "18:00" creyendo que eran las suyas y reservaba sus 11:00.
  const zonaNavegador = useZonaDelNavegador();
  const zonaPropia = zonaDe(user?.timezone ?? zonaNavegador);
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<SlotRef[]>(() => decodeSlots(search.slots));
  const [confirmando, setConfirmando] = useState(false);
  const preloaded = useRef(false);
  const gate = useActivePlanGate();

  // Quitar los enlaces al selector no basta mientras la ruta siga accesible:
  // se llega por marcador, por el botón de atrás y por los correos viejos de
  // renovación. Quien renueva se va derecho a pagar.
  const { esRenovacion, cargando: cargandoRenovacion } = useRenovacion();
  useEffect(() => {
    if (!cargandoRenovacion && esRenovacion) {
      nav({ to: "/checkout/$planId", params: { planId }, replace: true });
    }
  }, [esRenovacion, cargandoRenovacion, planId, nav]);

  const configQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const plansQ = useQuery({ queryKey: ["plans"], queryFn: () => plansApi.list() });
  const mineQ = useQuery({ queryKey: ["schedule", "mine"], queryFn: () => scheduleApi.mine(), enabled: !!user });

  const plan = useMemo(
    () => (plansQ.data?.plans ?? []).find((p: any) => p.id === planId),
    [plansQ.data, planId],
  );
  const cfg = configQ.data;
  const need = plan?.daysPerWeek ?? 0;

  // Quien ya tuvo horario (cambia de plan, vuelve tras vencerse) arranca con el
  // suyo marcado. Antes se filtraba por disponibilidad; ahora la disponibilidad
  // se decide al confirmar, así que se precarga tal cual.
  useEffect(() => {
    if (preloaded.current || !user || !mineQ.data || !plan || selected.length > 0) return;
    preloaded.current = true;
    const old = (mineQ.data.slots ?? []).map((s) => ({ weekday: s.weekday, hour: s.hour }));
    if (old.length > 0) setSelected(old.slice(0, need || old.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mineQ.data, plan]);

  // Lo que se consulta al confirmar: si hay profe para lo elegido y, si no, las
  // alternativas. Una sola consulta, no una por clic como antes.
  const pedidas = useMemo(() => decodeSlots(search.slots), [search.slots]);
  const claveSugerencias = ["schedule", "sugerencias", !!user, planId, search.slots ?? ""] as const;
  const sugerenciasQ = useQuery({
    queryKey: claveSugerencias,
    queryFn: () => scheduleApi.sugerencias(pedidas, planId, !!user),
    enabled: search.paso === "coordinacion" && pedidas.length > 0,
    // La misma vigencia que al confirmar: la pantalla de coordinación usa la
    // respuesta que ya trajo el botón en vez de volver a pedirla.
    staleTime: VIGENCIA_SUGERENCIAS_MS,
  });

  // Al recargar la pantalla de coordinación puede que ya haya cupo: entonces
  // no hay nada que coordinar y se va al pago.
  useEffect(() => {
    if (search.paso === "coordinacion" && sugerenciasQ.data?.assignable) {
      nav({ to: "/checkout/$planId", params: { planId }, search: { slots: search.slots } as any, replace: true });
    }
  }, [search.paso, search.slots, sugerenciasQ.data, planId, nav]);

  // Eligió un plan: es el "agregar al carrito" de una tienda. Se mide aquí y no
  // en el clic porque a este paso se llega por dos lados —los precios del inicio
  // y la página de planes— y así no se escapa ninguno. Las renovaciones no
  // pasan por aquí: no son clientes nuevos eligiendo plan.
  useRastrearUnaVez(
    "AddToCart",
    () => ({
      content_type: "product",
      content_ids: [planId],
      content_name: plan?.name,
      value: plan ? copAcobrar(plan, plansQ.data?.trm?.valueCop ?? 0) : undefined,
      currency: "COP",
    }),
    !!plan && !gate.blocked && !cargandoRenovacion && !esRenovacion,
  );

  // Plan activo lejos de renovación: no puede comprar otro plan — se avisa
  // desde el inicio y se sugiere cerrar sesión.
  if (gate.blocked) return <ActivePlanScreen end={gate.end} />;

  if (configQ.isLoading || plansQ.isLoading) {
    return <main className="min-h-screen bg-brand-cream grid place-items-center text-sm text-brand-ink/60">Cargando…</main>;
  }
  if (!plan || !cfg) {
    return (
      <main className="min-h-screen bg-brand-cream grid place-items-center px-5">
        <div className="rounded-3xl border border-brand-line bg-white p-8 text-center shadow-soft">
          <p className="text-sm text-brand-ink/70">Plan no encontrado.</p>
          <Link to="/checkout" className="mt-4 inline-flex h-11 items-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white">Ver planes</Link>
        </div>
      </main>
    );
  }

  const complete = selected.length === need;
  const enCoordinacion = search.paso === "coordinacion" && pedidas.length > 0;

  function irAPagar(franjas: SlotRef[]) {
    nav({ to: "/checkout/$planId", params: { planId }, search: { slots: encodeSlots(franjas) } as any });
  }

  /**
   * Confirmar el horario ideal. Si hay profe libre pasa directo al pago, sin
   * pantallas de más; si no, a la de coordinación con las alternativas.
   */
  async function confirmar() {
    if (!complete || confirmando) return;
    setConfirmando(true);
    const slots = encodeSlots(selected);
    try {
      const r = await qc.fetchQuery({
        queryKey: ["schedule", "sugerencias", !!user, planId, slots],
        queryFn: () => scheduleApi.sugerencias(selected, planId, !!user),
        staleTime: VIGENCIA_SUGERENCIAS_MS,
      });
      if (r.assignable) irAPagar(selected);
      else nav({ to: "/checkout/schedule/$planId", params: { planId }, search: { slots, paso: "coordinacion" } });
    } catch {
      // Si la consulta falla no se frena la venta: el pago vuelve a mirar la
      // disponibilidad y avisa si su horario necesita coordinación.
      irAPagar(selected);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Inicio"><Logo className="h-8 w-auto" /></Link>
          <Link to="/checkout" className="text-sm font-medium text-brand-ink/60 hover:text-brand-ink">← Cambiar de plan</Link>
        </div>

        <header className="mt-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-ink/60">Paso 2 de 3 · Tu horario</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink md:text-[46px]">
              {enCoordinacion ? "Tu horario" : `Elige tus ${need} clases de la semana`}
            </h1>
            <p className="mt-1 text-[15px] text-brand-ink/65">
              {enCoordinacion
                ? "Revisamos la disponibilidad de los profes para lo que elegiste."
                : `Clases de ${cfg.durationMin} min. Elige el horario que mejor te quede: este será tu horario fijo semanal.`}
            </p>
          </div>
          {!enCoordinacion ? (
            <div className="shadow-hard border-2 border-brand-ink bg-white px-5 py-3 text-center [--hard-x:4px]">
              <div className="font-display text-3xl font-extrabold text-brand-ink">{selected.length}/{need}</div>
              <div className="text-[11px] uppercase tracking-wide text-brand-ink/55">franjas elegidas</div>
            </div>
          ) : null}
        </header>

        {/* Aviso de zona: la grilla es hora de COLOMBIA, y quien está fuera
            piensa en la suya. Sin decirlo, una alumna en San Francisco eligió
            "9:00" creyendo que eran sus 9:00. La segunda frase no es adorno:
            es lo que evita el reclamo de noviembre, cuando su país cambie la
            hora y Colombia no. */}
        {zonaPropia !== ZONA_BOGOTA ? (
          <div className="mt-4 border-2 border-brand-ink bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
            Las horas se muestran en <b>tu zona horaria</b> ({nombreDeZona(zonaPropia)},{" "}
            {etiquetaDeZona(zonaPropia)}). Los días son días de Colombia.
            <span className="mt-1 block text-xs text-brand-ink/70">
              Tu hora local puede cambiar cuando tu país cambie de horario; la hora en Colombia
              es siempre la misma.
            </span>
          </div>
        ) : null}
        {enCoordinacion ? (
          sugerenciasQ.isLoading || sugerenciasQ.data?.assignable ? (
            <p className="mt-8 inline-flex items-center gap-2 text-sm text-brand-ink/60">
              <Loader2 className="size-4 animate-spin" /> Revisando la disponibilidad…
            </p>
          ) : (
            <SugerenciasDeHorario
              pedidas={pedidas}
              // Si la consulta falló, sin alternativas: igual puede seguir con el suyo.
              sugerencias={sugerenciasQ.data?.sugerencias ?? []}
              zona={zonaPropia}
              onSeguirConElMio={() => irAPagar(pedidas)}
              onElegir={irAPagar}
              onVolver={() =>
                nav({ to: "/checkout/schedule/$planId", params: { planId }, search: { slots: search.slots } })
              }
            />
          )
        ) : (
          <>
            {/* Sin pistas de disponibilidad a propósito: primero elige el horario
                que de verdad le sirve, y la disponibilidad se mira al confirmar. */}
            <div className="mt-4">
              <SchedulePickerGrid cfg={cfg} need={need} selected={selected} onChange={setSelected} zona={zonaPropia} />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={confirmar}
                disabled={!complete || confirmando}
                className="shadow-hard press-hard inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-ink px-8 font-display text-[14px] font-bold uppercase tracking-[0.04em] text-brand-cream disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none [--hard-x:5px]"
              >
                {confirmando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Revisando…
                  </>
                ) : (
                  <>
                    Continuar <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}


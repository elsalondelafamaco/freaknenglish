import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles, Zap } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { ActivePlanScreen, useActivePlanGate } from "@/components/site/ActivePlanGate";
import { plansApi, scheduleApi, type SlotRef } from "@/lib/api/endpoints";
import { SchedulePickerGrid } from "@/components/schedule/SchedulePickerGrid";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/checkout/schedule/$planId")({
  head: () => ({ meta: [{ title: "Elige tu horario — FreaknEnglish" }] }),
  component: SchedulePicker,
});

const key = (s: SlotRef) => `${s.weekday}:${s.hour}`;
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
  const [selected, setSelected] = useState<SlotRef[]>([]);
  const preloaded = useRef(false);
  const [renewalNotice, setRenewalNotice] = useState(false);
  const gate = useActivePlanGate();

  const configQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const plansQ = useQuery({ queryKey: ["plans"], queryFn: () => plansApi.list() });
  const mineQ = useQuery({ queryKey: ["schedule", "mine"], queryFn: () => scheduleApi.mine(), enabled: !!user });

  const plan = useMemo(
    () => (plansQ.data?.plans ?? []).find((p: any) => p.id === planId),
    [plansQ.data, planId],
  );
  const cfg = configQ.data;
  const need = plan?.daysPerWeek ?? 0;

  // Hints en vivo según la selección (autenticado ⇒ ignora slots propios: renovación).
  const selKey = selected.map(key).sort().join("|");
  const hintsQ = useQuery({
    queryKey: ["schedule", "hints", !!user, planId, selKey],
    queryFn: () =>
      user ? scheduleApi.availabilityMine(selected, planId) : scheduleApi.availability(selected, planId),
    enabled: !!cfg,
    placeholderData: (prev) => prev,
  });
  const autoMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const h of hintsQ.data?.hints ?? []) m.set(`${h.weekday}:${h.hour}`, h.auto);
    return m;
  }, [hintsQ.data]);

  // Renovación: preseleccionar el horario anterior si sigue disponible (AC-14/15).
  useEffect(() => {
    if (preloaded.current || !user || !mineQ.data || !hintsQ.data || selected.length > 0) return;
    const old = (mineQ.data.slots ?? []).map((s) => ({ weekday: s.weekday, hour: s.hour }));
    if (old.length === 0) { preloaded.current = true; return; }
    const avail = old.filter((s) => autoMap.get(key(s)));
    setSelected(avail.slice(0, need || avail.length));
    if (avail.length < old.length) setRenewalNotice(true);
    preloaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mineQ.data, hintsQ.data]);

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
  const assignable = hintsQ.data?.assignable ?? true;
  // Sin franjas automáticas no hay diferencia que explicar: se oculta la leyenda.
  const hasAutoSlots = (hintsQ.data?.hints ?? []).some((h) => h.auto);

  function continueToPay() {
    if (!complete) return;
    nav({ to: "/checkout/$planId", params: { planId }, search: { slots: encodeSlots(selected) } as any });
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
              Elige tus {need} clases de la semana
            </h1>
            <p className="mt-1 text-[15px] text-brand-ink/65">
              Clases de {cfg.durationMin} min. Este será tu horario fijo semanal.
            </p>
          </div>
          <div className="shadow-hard border-2 border-brand-ink bg-white px-5 py-3 text-center [--hard-x:4px]">
            <div className="font-display text-3xl font-extrabold text-brand-ink">{selected.length}/{need}</div>
            <div className="text-[11px] uppercase tracking-wide text-brand-ink/55">franjas elegidas</div>
          </div>
        </header>

        {renewalNotice ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Parte de tu horario anterior ya no está disponible. Elige nuevas franjas para completar tu plan.
          </div>
        ) : null}

        {hasAutoSlots ? (
          <div className="mt-3 flex items-center gap-4 text-xs text-brand-ink/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex size-4 items-center justify-center rounded bg-brand-yellow/70"><Zap className="size-3 text-brand-ink" /></span>
              Disponibilidad inmediata
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-4 rounded border border-brand-line bg-white" />
              Disponible con coordinación
            </span>
          </div>
        ) : null}

        <div className="mt-4">
          <SchedulePickerGrid
            cfg={cfg}
            need={need}
            selected={selected}
            onChange={setSelected}
            autoMap={autoMap}
          />
        </div>

        {complete && !assignable ? (
          <div className="mt-4 flex items-start gap-3 border-2 border-brand-ink bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <p>
              Ese horario está muy solicitado 💛 Completa tu compra con total tranquilidad: nuestro equipo te
              contacta en menos de 24&nbsp;h hábiles para coordinar tu profesor y el inicio de tus clases.
              <strong> Tu cupo queda garantizado.</strong>
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            onClick={continueToPay}
            disabled={!complete}
            className="shadow-hard press-hard inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-ink px-8 font-display text-[14px] font-bold uppercase tracking-[0.04em] text-brand-cream disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none [--hard-x:5px]"
          >
            Continuar al pago <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </main>
  );
}


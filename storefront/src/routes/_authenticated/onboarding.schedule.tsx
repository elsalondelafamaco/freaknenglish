import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { scheduleApi, subscriptionsApi, type SlotRef } from "@/lib/api/endpoints";
import { SchedulePickerGrid, slotKey } from "@/components/schedule/SchedulePickerGrid";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_authenticated/onboarding/schedule")({
  head: () => ({ meta: [{ title: "Elige tu horario — FreaknEnglish" }] }),
  component: OnboardingSchedule,
});

/**
 * Selección de horario desde la app (post-pago o reasignación).
 *
 * Usa exactamente la misma grilla y las mismas reglas que el checkout
 * (`SchedulePickerGrid`): ventana de días/horas del admin, máximo por día y
 * cantidad exacta del plan. Antes esta pantalla pintaba una grilla propia sin
 * `maxPerDay` ni ventana, así que dejaba elegir varias clases el mismo día y
 * el backend rechazaba la selección recién al enviarla.
 */
function OnboardingSchedule() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SlotRef[]>([]);

  const configQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const sub = useQuery({ queryKey: ["me", "sub"], queryFn: () => subscriptionsApi.mine() });
  const need = (sub.data as any)?.plan?.daysPerWeek ?? 0;

  // Mismos hints que el checkout: marcan las franjas con profe libre.
  const selKey = selected.map(slotKey).sort().join("|");
  const hintsQ = useQuery({
    queryKey: ["schedule", "hints", "mine", selKey],
    queryFn: () => scheduleApi.availabilityMine(selected),
    enabled: !!configQ.data,
    placeholderData: (prev) => prev,
  });
  const autoMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const h of hintsQ.data?.hints ?? []) m.set(`${h.weekday}:${h.hour}`, h.auto);
    return m;
  }, [hintsQ.data]);

  const submit = useMutation({
    mutationFn: () => scheduleApi.submit(selected),
    onSuccess: (r) => {
      refresh();
      if (r.status === "auto_assigned") {
        toast.success(`¡Listo! Tu profesor es ${r.teacher?.fullName ?? "asignado"}.`);
      } else {
        toast.info(
          "Recibimos tu preferencia. Nos coordinaremos contigo en las próximas 48 horas para iniciar con las clases.",
        );
      }
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al enviar horario"),
  });

  const cfg = configQ.data;
  const complete = need > 0 && selected.length === need;
  const assignable = hintsQ.data?.assignable ?? true;
  const hasAutoSlots = (hintsQ.data?.hints ?? []).some((h) => h.auto);

  return (
    <div className="mx-auto max-w-5xl py-8">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-ink">
            {need > 0 ? `Elige tus ${need} clases de la semana` : "Elige tu horario"}
          </h1>
          <p className="mt-1 text-[15px] text-brand-ink/65">
            {cfg ? `Clases de ${cfg.durationMin} min. ` : ""}Este será tu horario fijo semanal.
          </p>
        </div>
        <div className="rounded-2xl border border-brand-line bg-white px-4 py-3 text-center">
          <div className="text-2xl font-bold text-brand-ink">
            {selected.length}/{need || "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-brand-ink/55">franjas elegidas</div>
        </div>
      </header>

      {hasAutoSlots ? (
        <div className="mt-3 flex items-center gap-4 text-xs text-brand-ink/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex size-4 items-center justify-center rounded bg-brand-yellow/70">
              <Zap className="size-3 text-brand-ink" />
            </span>
            Disponibilidad inmediata
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-4 rounded border border-brand-line bg-white" />
            Disponible con coordinación
          </span>
        </div>
      ) : null}

      {configQ.isLoading || !cfg ? (
        <p className="mt-6 text-sm text-brand-ink/60">Cargando disponibilidad…</p>
      ) : (
        <div className="mt-4">
          <SchedulePickerGrid
            cfg={cfg}
            need={need}
            selected={selected}
            onChange={setSelected}
            autoMap={autoMap}
          />
        </div>
      )}

      {complete && !assignable ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <p>
            Ese horario está muy solicitado 💛 Guarda tu selección con tranquilidad: nuestro equipo te
            contacta en menos de 24&nbsp;h hábiles para coordinar tu profesor y el inicio de tus clases.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => submit.mutate()}
          disabled={!complete || submit.isPending}
          className="inline-flex h-12 items-center rounded-full bg-brand-ink px-8 text-sm font-semibold text-white transition hover:bg-brand-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submit.isPending ? "Enviando…" : "Confirmar horario"}
        </button>
      </div>
    </div>
  );
}

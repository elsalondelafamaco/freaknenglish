import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { scheduleApi, subscriptionsApi, type SlotRef } from "@/lib/api/endpoints";
import { SchedulePickerGrid, slotKey } from "@/components/schedule/SchedulePickerGrid";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ZONA_BOGOTA, etiquetaDeZona, nombreDeZona, zonaDe } from "@/lib/domain/zona-horaria";
import { useZonaDelNavegador } from "@/lib/domain/zona-navegador";
import { Cargando, PageHeader, btnPrimaryAuto, cardPlain, eyebrow } from "@/components/app/AppUi";
import { cn } from "@/lib/utils";

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
  const { refresh, user } = useAuth();
  // El respaldo del navegador cubre la primera carga de una cuenta que todavía
  // no tiene zona guardada: se captura sola, pero tarda un viaje al servidor.
  const zonaNavegador = useZonaDelNavegador();
  const zonaPropia = zonaDe(user?.timezone ?? zonaNavegador);
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
      <PageHeader
        eyebrowText={cfg ? `Clases de ${cfg.durationMin} min` : undefined}
        title={need > 0 ? `Elige tus ${need} clases de la semana` : "Elige tu horario"}
        highlight={need > 0 ? "clases" : "horario"}
        aside={
          <div className={cn(cardPlain, "px-4 py-3 text-center")} role="status" aria-live="polite">
            <div className="font-display text-2xl font-extrabold text-brand-ink">
              {selected.length}/{need || "—"}
            </div>
            <div className={eyebrow}>franjas elegidas</div>
          </div>
        }
      >
        Este será tu horario fijo semanal.
      </PageHeader>

      {hasAutoSlots ? (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-brand-ink/80">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex size-4 items-center justify-center border-[1.5px] border-brand-ink bg-brand-yellow">
              <Zap className="size-3 text-brand-ink" aria-hidden="true" />
            </span>
            Disponibilidad inmediata
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-4 border-[1.5px] border-brand-ink bg-white" />
            Disponible con coordinación
          </span>
        </div>
      ) : null}

      {/* La grilla es hora de COLOMBIA, y quien está fuera piensa en la suya.
          Sin decirlo, una alumna en San Francisco eligió "9:00" creyendo que
          eran sus 9:00. La segunda frase no es adorno: evita el reclamo de
          noviembre, cuando su país cambie la hora y Colombia no. */}
      {zonaPropia !== ZONA_BOGOTA ? (
        <div className={cn(cardPlain, "mt-4 bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink")}>
          Las horas se muestran en <b>tu zona horaria</b> ({nombreDeZona(zonaPropia)},{" "}
          {etiquetaDeZona(zonaPropia)}). Los días son días de Colombia.
          <span className="mt-1 block text-xs text-brand-ink/80">
            Tu hora local puede cambiar cuando tu país cambie de horario; la hora en Colombia es
            siempre la misma.
          </span>
        </div>
      ) : null}

      {configQ.isLoading || !cfg ? (
        <div className="mt-6"><Cargando>Cargando disponibilidad…</Cargando></div>
      ) : (
        <div className="mt-4">
          <SchedulePickerGrid
            cfg={cfg}
            need={need}
            selected={selected}
            onChange={setSelected}
            autoMap={autoMap}
            zona={zonaPropia}
          />
        </div>
      )}

      {complete && !assignable ? (
        <div className={cn(cardPlain, "mt-4 flex items-start gap-3 bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink")}>
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Ese horario está muy solicitado. Guarda tu selección con tranquilidad: nuestro equipo te
            contacta en menos de 24&nbsp;h hábiles para coordinar tu profesor y el inicio de tus clases.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => submit.mutate()}
          disabled={!complete || submit.isPending}
          className={cn(btnPrimaryAuto, "sm:min-w-56")}
        >
          {submit.isPending ? "Enviando…" : "Confirmar horario"}
        </button>
      </div>
    </div>
  );
}

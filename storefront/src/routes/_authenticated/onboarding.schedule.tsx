import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { scheduleApi, subscriptionsApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding/schedule")({
  head: () => ({ meta: [{ title: "Elige tu horario — Freakn English" }] }),
  component: OnboardingSchedule,
});

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function OnboardingSchedule() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Array<{ weekday: number; hour: number }>>([]);

  const grid = useQuery({ queryKey: ["schedule", "grid"], queryFn: scheduleApi.grid });
  const sub = useQuery({ queryKey: ["me", "sub"], queryFn: () => subscriptionsApi.mine() });
  const daysPerWeek = (sub.data as any)?.plan?.daysPerWeek ?? 3;

  const submit = useMutation({
    mutationFn: () => scheduleApi.submit(selected),
    onSuccess: (r) => {
      refresh();
      if (r.status === "auto_assigned") {
        toast.success(`¡Listo! Tu profesor es ${r.teacher?.fullName ?? "asignado"}.`);
        navigate({ to: "/app" });
      } else {
        toast.info(
          "Recibimos tu preferencia. Nos coordinaremos contigo en las próximas 48 horas para iniciar con las clases.",
        );
        navigate({ to: "/app" });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al enviar horario"),
  });

  const toggle = (weekday: number, hour: number) => {
    setSelected((prev) => {
      const exists = prev.find((b) => b.weekday === weekday && b.hour === hour);
      if (exists) return prev.filter((b) => !(b.weekday === weekday && b.hour === hour));
      if (prev.length >= daysPerWeek) {
        toast.error(`Solo puedes seleccionar ${daysPerWeek} bloques.`);
        return prev;
      }
      return [...prev, { weekday, hour }];
    });
  };

  const hours: number[] = grid.data?.hours ?? [];
  const gridMap = grid.data?.grid ?? {};

  return (
    <div className="mx-auto max-w-4xl py-8">
      <h1 className="text-3xl font-bold text-brand-ink">Elige tus {daysPerWeek} horarios semanales</h1>
      <p className="mt-2 text-brand-ink/65">
        Selecciona exactamente {daysPerWeek} bloques (día × hora). Buscaremos un profesor disponible; si no lo hay, te contactaremos.
      </p>

      {grid.isLoading ? (
        <p className="mt-6">Cargando disponibilidad…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-brand-line bg-white p-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Hora</th>
                {DAYS.map((d, i) => (
                  <th key={i} className="p-2 text-center">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h}>
                  <td className="p-2 font-medium">{String(h).padStart(2, "0")}:00</td>
                  {DAYS.map((_, wd) => {
                    const count = gridMap[`${wd}:${h}`] ?? 0;
                    const isSelected = !!selected.find((b) => b.weekday === wd && b.hour === h);
                    const disabled = count === 0;
                    return (
                      <td key={wd} className="p-1 text-center">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => toggle(wd, h)}
                          className={`h-9 w-full rounded-lg border text-xs transition ${
                            disabled
                              ? "cursor-not-allowed border-brand-line/40 bg-brand-cream/30 text-brand-ink/30"
                              : isSelected
                                ? "border-brand-ink bg-brand-ink text-white"
                                : "border-brand-line hover:border-brand-ink"
                          }`}
                          title={disabled ? "Sin profesores" : `${count} profesor(es)`}
                        >
                          {isSelected ? "✓" : disabled ? "—" : count}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-brand-ink/70">
          Seleccionados: <b>{selected.length}</b> / {daysPerWeek}
        </p>
        <button
          type="button"
          onClick={() => submit.mutate()}
          disabled={selected.length !== daysPerWeek || submit.isPending}
          className="rounded-full bg-brand-ink px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {submit.isPending ? "Enviando…" : "Confirmar horario"}
        </button>
      </div>
    </div>
  );
}
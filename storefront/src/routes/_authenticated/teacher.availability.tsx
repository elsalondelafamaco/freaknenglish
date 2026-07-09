import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/availability")({
  head: () => ({ meta: [{ title: "Mi disponibilidad — Freakn for Teachers" }] }),
  component: TeacherAvailability,
});

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7..21

function key(w: number, h: number) {
  return `${w}:${h}`;
}

function TeacherAvailability() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["teacher", "availability"], queryFn: teachersApi.myAvailability });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!q.data) return;
    const s = new Set<string>();
    for (const slot of q.data) {
      const start = parseInt(slot.startsAt.split(":")[0] ?? "0", 10);
      const end = parseInt(slot.endsAt.split(":")[0] ?? "0", 10);
      for (let h = start; h < end; h++) s.add(key(slot.weekday, h));
    }
    setSelected(s);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      // Convertir horas seleccionadas → slots por hora individual.
      const slots: Array<{ weekday: number; startsAt: string; endsAt: string }> = [];
      for (const k of selected) {
        const [w, h] = k.split(":").map(Number);
        slots.push({
          weekday: w,
          startsAt: `${String(h).padStart(2, "0")}:00`,
          endsAt: `${String(h + 1).padStart(2, "0")}:00`,
        });
      }
      return teachersApi.saveMyAvailability(slots);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["teacher", "availability"] });
      qc.invalidateQueries({ queryKey: ["schedule", "grid"] });
      const n = r.reassigned.length;
      toast.success(
        n > 0
          ? `Disponibilidad guardada. ${n} estudiante(s) asignados automáticamente.`
          : "Disponibilidad guardada.",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al guardar"),
  });

  function toggle(w: number, h: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(w, h);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-5xl py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink">Mi disponibilidad</h1>
          <p className="text-sm text-brand-ink/65">
            Marca los bloques en los que puedes dar clase. Al guardar, los estudiantes
            en lista de espera cuyos horarios queden cubiertos se te asignarán
            automáticamente.
          </p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {save.isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {q.isLoading ? (
        <p className="text-sm">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-line bg-white p-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Hora</th>
                {DAYS.map((d, i) => (
                  <th key={i} className="p-2 text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h) => (
                <tr key={h}>
                  <td className="p-2 font-medium">{String(h).padStart(2, "0")}:00</td>
                  {DAYS.map((_, wd) => {
                    const isOn = selected.has(key(wd, h));
                    return (
                      <td key={wd} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(wd, h)}
                          className={`h-9 w-full rounded-lg border text-xs transition ${
                            isOn
                              ? "border-brand-ink bg-brand-ink text-white"
                              : "border-brand-line hover:border-brand-ink"
                          }`}
                        >
                          {isOn ? "✓" : ""}
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
    </div>
  );
}

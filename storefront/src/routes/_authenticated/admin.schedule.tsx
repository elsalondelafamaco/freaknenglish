import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, scheduleApi } from "@/lib/api/endpoints";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/schedule")({
  head: () => ({ meta: [{ title: "Solicitudes de horario — Admin" }] }),
  component: AdminSchedulePage,
});

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function AdminSchedulePage() {
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ["admin", "schedule", "pending"], queryFn: scheduleApi.adminPending });
  const teachers = useQuery({
    queryKey: ["admin", "users", "teachers"],
    queryFn: () => adminApi.users().then((rows) => rows.filter((u: any) => u.role === "teacher")),
  });

  const [assigning, setAssigning] = useState<Record<string, string>>({});
  const assign = useMutation({
    mutationFn: ({ studentId, teacherId }: { studentId: string; teacherId: string }) =>
      scheduleApi.adminAssign(studentId, teacherId),
    onSuccess: () => {
      toast.success("Profesor asignado");
      qc.invalidateQueries({ queryKey: ["admin", "schedule", "pending"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-brand-ink">Solicitudes de horario</h1>
        <p className="mt-1 text-sm text-brand-ink/65">
          Estudiantes sin profesor auto-asignado. Asigna manualmente y coordina el horario.
        </p>
      </header>

      <div className="rounded-2xl border border-brand-line bg-white p-4">
        {pending.isLoading ? (
          <p>Cargando…</p>
        ) : (pending.data ?? []).length === 0 ? (
          <p className="text-sm text-brand-ink/60">No hay solicitudes pendientes.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">Estudiante</th>
                <th className="p-2">Plan</th>
                <th className="p-2">Preferencia</th>
                <th className="p-2">Asignar profesor</th>
              </tr>
            </thead>
            <tbody>
              {(pending.data ?? []).map((s: any) => (
                <tr key={s.id} className="border-t border-brand-line">
                  <td className="p-2">
                    <div className="font-medium">{s.fullName}</div>
                    <div className="text-xs text-brand-ink/60">{s.email} · {s.phone ?? "—"}</div>
                  </td>
                  <td className="p-2">{s.subscription?.plan?.name ?? "—"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {(s.schedulePreferences ?? []).map((b: any, i: number) => (
                        <span key={i} className="rounded bg-brand-cream/60 px-2 py-0.5 text-xs">
                          {DAYS[b.weekday]} {String(b.hour).padStart(2, "0")}:00
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <select
                        className="rounded border border-brand-line px-2 py-1 text-xs"
                        value={assigning[s.id] ?? ""}
                        onChange={(e) => setAssigning((p) => ({ ...p, [s.id]: e.target.value }))}
                      >
                        <option value="">Selecciona profesor…</option>
                        {(teachers.data ?? []).map((t: any) => (
                          <option key={t.id} value={t.id}>{t.fullName}</option>
                        ))}
                      </select>
                      <button
                        disabled={!assigning[s.id] || assign.isPending}
                        onClick={() => assign.mutate({ studentId: s.id, teacherId: assigning[s.id]! })}
                        className="rounded-full bg-brand-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Asignar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
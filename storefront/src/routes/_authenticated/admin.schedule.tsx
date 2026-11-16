import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, scheduleApi } from "@/lib/api/endpoints";
import { rowHasRole } from "@/lib/roles";
import { horaEn12 } from "@/lib/domain/zona-horaria";
import { useState } from "react";
import { toast } from "sonner";
import { Cargando, EstadoError, PageHeader, Vacio } from "@/components/app/AppUi";
import { Seccion, btnRowInk, inputBase, td, th } from "@/components/teacher/TeacherUi";
import { ChipEstado } from "@/components/admin/AdminUi";

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
    // `rowHasRole` y no `u.role === "teacher"`: un admin que además da clases
    // también debe aparecer para asignarle estudiantes.
    queryFn: () => adminApi.users().then((rows) => rows.filter((u: any) => rowHasRole(u, "teacher"))),
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

  const total = pending.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrowText="Admin · Hoy" title="Solicitudes de horario" highlight="Solicitudes">
        Estudiantes sin profesor auto-asignado. Asigna uno manualmente y coordina el horario.
      </PageHeader>

      <Seccion
        id="pendientes"
        titulo="Pendientes"
        aside={total > 0 ? <ChipEstado atencion>{total} por asignar</ChipEstado> : undefined}
      >
        {pending.isLoading ? (
          <div className="p-4 pt-0"><Cargando>Cargando solicitudes…</Cargando></div>
        ) : pending.isError ? (
          <div className="p-4 pt-0"><EstadoError onRetry={() => void pending.refetch()}>No pudimos cargar las solicitudes.</EstadoError></div>
        ) : total === 0 ? (
          <div className="p-4 pt-0"><Vacio titulo="Todo asignado">No hay solicitudes pendientes.</Vacio></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Estudiante</th>
                  <th className={th}>Plan</th>
                  <th className={th}>Preferencia</th>
                  <th className={th}>Asignar profesor</th>
                </tr>
              </thead>
              <tbody>
                {(pending.data ?? []).map((s: any) => (
                  <tr key={s.id} className="align-top">
                    <td className={td}>
                      <div className="font-bold">{s.fullName}</div>
                      <div className="text-xs text-brand-ink/70">{s.email} · {s.phone ?? "—"}</div>
                    </td>
                    <td className={td}>{s.subscription?.plan?.name ?? "—"}</td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1.5">
                        {(s.schedulePreferences ?? []).map((b: any, i: number) => (
                          <ChipEstado key={i}>
                            {DAYS[b.weekday]} {horaEn12(b.hour)}
                          </ChipEstado>
                        ))}
                      </div>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Profesor para ${s.fullName}`}
                          className={`${inputBase} w-auto min-w-48`}
                          value={assigning[s.id] ?? ""}
                          onChange={(e) => setAssigning((p) => ({ ...p, [s.id]: e.target.value }))}
                        >
                          <option value="">Selecciona profesor…</option>
                          {(teachers.data ?? []).map((t: any) => (
                            <option key={t.id} value={t.id}>{t.fullName}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!assigning[s.id] || assign.isPending}
                          onClick={() => assign.mutate({ studentId: s.id, teacherId: assigning[s.id]! })}
                          aria-label={`Asignar profesor a ${s.fullName}`}
                          className={btnRowInk}
                        >
                          Asignar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

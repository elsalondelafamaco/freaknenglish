import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listStudentsOfTeacher } from "@/lib/domain/classes";

export const Route = createFileRoute("/_authenticated/teacher/students")({
  head: () => ({ meta: [{ title: "Estudiantes — Freakn for Teachers" }] }),
  component: TeacherStudents,
});

function TeacherStudents() {
  const { user } = useAuth();
  const rows = useMemo(() => listStudentsOfTeacher(user?.id ?? ""), [user?.id]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Tus estudiantes</h1>
        <p className="mt-1 text-brand-ink/70">
          Seguimiento de progreso, nivel actual y próxima clase.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          Aún no tienes estudiantes asignados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-cream/40 text-xs uppercase tracking-wide text-brand-ink/60">
              <tr>
                <th className="px-4 py-3">Estudiante</th>
                <th className="px-4 py-3">Nivel</th>
                <th className="px-4 py-3">Clases</th>
                <th className="px-4 py-3">Próxima</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {rows.map((r) => (
                <tr key={r.student.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-ink">{r.student.fullName}</div>
                    <div className="text-xs text-brand-ink/60">{r.student.email}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.student.level ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="text-brand-ink">{r.completed}/{r.totalClasses}</div>
                    {r.missed > 0 ? (
                      <div className="text-[11px] text-red-700">{r.missed} no asistió</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-brand-ink/70">
                    {r.nextClass
                      ? new Date(r.nextClass.startsAt).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/teacher/students/$studentId"
                      params={{ studentId: r.student.id }}
                      className="text-sm font-semibold text-brand-ink hover:underline"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
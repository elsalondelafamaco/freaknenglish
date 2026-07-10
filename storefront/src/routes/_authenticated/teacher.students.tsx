import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/students")({
  head: () => ({ meta: [{ title: "Estudiantes — Freakn for Teachers" }] }),
  component: TeacherStudents,
});

function TeacherStudents() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher", "students"],
    queryFn: () => teachersApi.students(),
  });
  const rows = (data ?? []) as Array<any>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Tus estudiantes</h1>
        <p className="mt-1 text-brand-ink/70">
          Seguimiento de progreso, nivel actual y próxima clase.
        </p>
      </header>

      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          Cargando estudiantes…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          No se pudieron cargar los estudiantes: {(error as Error).message}
        </div>
      ) : rows.length === 0 ? (
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
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-ink">{s.fullName}</div>
                    <div className="text-xs text-brand-ink/60">{s.email}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{s.englishLevel ?? s.level ?? "—"}</td>
                  <td className="px-4 py-3 text-brand-ink">
                    {s._count?.classesAsStudent ?? 0}
                  </td>
                  <td className="px-4 py-3 text-brand-ink/70">{s.email}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/teacher/students/$studentId"
                      params={{ studentId: s.id }}
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
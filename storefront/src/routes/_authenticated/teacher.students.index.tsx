import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { teachersApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, Vacio, focusRing, tagNeutral } from "@/components/app/AppUi";
import { td, th } from "@/components/teacher/TeacherUi";

export const Route = createFileRoute("/_authenticated/teacher/students/")({
  head: () => ({ meta: [{ title: "Estudiantes — Freakn for Teachers" }] }),
  component: TeacherStudents,
});

function TeacherStudents() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["teacher", "students"],
    queryFn: () => teachersApi.students(),
  });
  const rows = (data ?? []) as Array<any>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tus estudiantes" highlight="estudiantes">
        Seguimiento de progreso, nivel actual y próxima clase.
      </PageHeader>

      {isLoading ? (
        <Cargando>Cargando estudiantes…</Cargando>
      ) : error ? (
        <EstadoError onRetry={() => void refetch()}>
          No se pudieron cargar los estudiantes: {(error as Error).message}
        </EstadoError>
      ) : rows.length === 0 ? (
        <Vacio titulo="Aún no hay estudiantes">Aún no tienes estudiantes asignados. Cuando te asignen uno, aparecerá aquí.</Vacio>
      ) : (
        <div className="shadow-hard overflow-hidden border-2 border-brand-ink bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr>
                  <th className={th}>Estudiante</th>
                  <th className={th}>Nivel</th>
                  <th className={th}>Clases</th>
                  <th className={th}><span className="sr-only">Ver perfil</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className={td}>
                      <div className="font-bold">{s.fullName}</div>
                      <div className="text-xs text-brand-ink/70">{s.email}</div>
                    </td>
                    <td className={td}>
                      <span className={cn(tagNeutral, "capitalize")}>{s.englishLevel ?? s.level ?? "—"}</span>
                    </td>
                    <td className={td}>{s._count?.classesAsStudent ?? 0}</td>
                    <td className={cn(td, "text-right")}>
                      <Link
                        to="/teacher/students/$studentId"
                        params={{ studentId: s.id }}
                        aria-label={`Ver a ${s.fullName}`}
                        className={cn("inline-flex min-h-9 items-center rounded-full px-2 text-sm font-bold underline underline-offset-2", focusRing)}
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { boardsApi, teachersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { diaMes, horaDeClase } from "@/lib/domain/clases-fecha";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, Vacio, btnPrimaryAuto, cardPlain, focusRing } from "@/components/app/AppUi";
import { btnRowInk, inputBase } from "@/components/teacher/TeacherUi";

export const Route = createFileRoute("/_authenticated/boards/")({
  head: () => ({ meta: [{ title: "Boards colaborativos" }] }),
  component: BoardsIndex,
});

function BoardsIndex() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");

  const isStudent = !!user?.roles.includes("student");
  const isAdmin = !!user?.roles.includes("admin");
  const isTeacher = !!user?.roles.includes("teacher");

  const listQ = useQuery({ queryKey: ["boards"], queryFn: () => boardsApi.list() });
  const aulasQ = useQuery({
    queryKey: ["boards", "health"],
    queryFn: () => boardsApi.health(),
    enabled: isAdmin,
  });
  const fusionar = useMutation({
    mutationFn: () => boardsApi.repairHealth(),
    onSuccess: (r) => {
      toast.success(`${r.aulasFusionadas} aula(s) fusionada(s) de ${r.estudiantes} estudiante(s)`);
      qc.invalidateQueries({ queryKey: ["boards"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo fusionar"),
  });
  const studentsQ = useQuery({
    queryKey: ["teacher", "students"],
    queryFn: () => teachersApi.students(),
    enabled: isTeacher || isAdmin,
  });

  const createM = useMutation({
    mutationFn: (v: { name: string; studentId: string }) => boardsApi.create(v.name, v.studentId),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      toast.success("Board creado");
      nav({ to: "/boards/$boardId", params: { boardId: b.id } });
    },
    onError: (e: any) => {
      console.error("[boards.create]", e);
      toast.error(
        e?.status === 401
          ? "Sesión expirada. Vuelve a iniciar sesión."
          : e?.message?.includes("Failed to fetch")
            ? "No se pudo conectar al backend. Verifica que esté corriendo."
            : e?.message ?? "No se pudo crear el board",
      );
    },
  });

  const students = (studentsQ.data ?? []) as any[];

  function ownerOf(b: any) {
    const m = (b.members ?? []).find((x: any) => x.role === "owner");
    return m?.user?.fullName ?? "—";
  }
  function studentOf(b: any) {
    const m = (b.members ?? []).find((x: any) => x.user?.role === "student");
    return m?.user?.fullName ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Boards"
        highlight="Boards"
        aside={
          isTeacher || isAdmin ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!studentId) return toast.error("Selecciona un estudiante.");
                createM.mutate({ name: name.trim(), studentId });
                setName("");
              }}
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                aria-label="Estudiante del board"
                className={cn(inputBase, "sm:w-auto")}
                required
              >
                <option value="">Estudiante…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.fullName}</option>
                ))}
              </select>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Nombre del board (opcional)"
                placeholder="Nombre (opcional)"
                className={cn(inputBase, "sm:w-auto")}
              />
              <button type="submit" disabled={createM.isPending || !studentId} className={btnPrimaryAuto}>
                <Plus className="size-4" aria-hidden="true" /> {createM.isPending ? "Creando…" : "Crear board"}
              </button>
            </form>
          ) : null
        }
      >
        {isStudent
          ? "Aulas colaborativas creadas por tu profesor."
          : isAdmin
            ? "Todos los boards de la plataforma."
            : "Crea un aula colaborativa asociada a un estudiante."}
      </PageHeader>

      {/* Un aula por estudiante: al reasignar profesor se MUDA. Las que quedan
          duplicadas son de antes de ese cambio, y se fusionan sin perder
          páginas. Mientras queden, no se puede poner la restricción en base que
          impediría que vuelva a pasar. */}
      {isAdmin && (aulasQ.data?.duplicadas.length ?? 0) > 0 ? (
        <div role="alert" className={cn(cardPlain, "flex flex-col gap-3 bg-brand-yellow-soft p-4 sm:flex-row sm:items-center sm:justify-between")}>
          <p className="text-sm text-brand-ink">
            <b>{aulasQ.data!.duplicadas.length}</b> estudiante(s) con el aula duplicada:{" "}
            {aulasQ.data!.duplicadas.slice(0, 3).map((d) => d.nombre).join(", ")}
            {aulasQ.data!.duplicadas.length > 3 ? "…" : ""}. Al fusionar se conservan todas las
            páginas.
          </p>
          <button
            onClick={() => fusionar.mutate()}
            disabled={fusionar.isPending}
            type="button"
            className={cn(btnRowInk, "shrink-0")}
          >
            {fusionar.isPending ? "Fusionando…" : "Fusionar duplicadas"}
          </button>
        </div>
      ) : null}

      {listQ.isLoading ? (
        <Cargando>Cargando tus boards…</Cargando>
      ) : listQ.isError ? (
        <EstadoError onRetry={() => void listQ.refetch()}>No pudimos cargar los boards. Revisa tu conexión e inténtalo de nuevo.</EstadoError>
      ) : (listQ.data ?? []).length === 0 ? (
        <Vacio titulo="Aún no hay boards">
          {isStudent ? "Tu profesor aún no ha creado aulas." : "Aún no hay boards. Crea el primero."}
        </Vacio>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(listQ.data ?? []).map((b: any) => {
            const st = studentOf(b);
            return (
              <li key={b.id}>
                <Link
                  to="/boards/$boardId"
                  params={{ boardId: b.id }}
                  className={cn("shadow-hard block border-2 border-brand-ink bg-white p-4 no-underline [--hard-x:4px] press-hard", focusRing)}
                >
                  <div className="flex items-center gap-2 font-display text-[16px] font-extrabold uppercase leading-tight text-brand-ink">
                    <LayoutGrid className="size-4 shrink-0" aria-hidden="true" /> {b.name}
                  </div>
                  {isAdmin ? (
                    <div className="mt-1.5 text-xs text-brand-ink/80">
                      Profe: {ownerOf(b)}{st ? ` · Estudiante: ${st}` : ""}
                    </div>
                  ) : st && (isTeacher) ? (
                    <div className="mt-1.5 text-xs text-brand-ink/80">Estudiante: {st}</div>
                  ) : null}
                  <div className="mt-1 text-xs text-brand-ink/70">
                    Actualizado {diaMes(b.updatedAt, user?.timezone)}, {horaDeClase(b.updatedAt, user?.timezone)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

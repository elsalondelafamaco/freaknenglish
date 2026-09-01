import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { boardsApi, teachersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-ink">Boards</h1>
          <p className="text-xs text-brand-ink/55">
            {isStudent
              ? "Aulas colaborativas creadas por tu profesor."
              : isAdmin
                ? "Todos los boards de la plataforma."
                : "Crea un aula colaborativa asociada a un estudiante."}
          </p>
        </div>

        {isTeacher || isAdmin ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!studentId) return toast.error("Selecciona un estudiante.");
              createM.mutate({ name: name.trim(), studentId });
              setName("");
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="rounded-full border border-brand-line bg-white px-4 py-2 text-sm"
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
              placeholder="Nombre (opcional)"
              className="rounded-full border border-brand-line bg-white px-4 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={createM.isPending || !studentId}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              <Plus className="size-3.5" /> Crear
            </button>
          </form>
        ) : null}
      </header>

      {/* Un aula por estudiante: al reasignar profesor se MUDA. Las que quedan
          duplicadas son de antes de ese cambio, y se fusionan sin perder
          páginas. Mientras queden, no se puede poner la restricción en base que
          impediría que vuelva a pasar. */}
      {isAdmin && (aulasQ.data?.duplicadas.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900">
            <b>{aulasQ.data!.duplicadas.length}</b> estudiante(s) con el aula duplicada:{" "}
            {aulasQ.data!.duplicadas.slice(0, 3).map((d) => d.nombre).join(", ")}
            {aulasQ.data!.duplicadas.length > 3 ? "…" : ""}. Al fusionar se conservan todas las
            páginas.
          </p>
          <button
            onClick={() => fusionar.mutate()}
            disabled={fusionar.isPending}
            className="shrink-0 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink/90 disabled:opacity-50"
          >
            {fusionar.isPending ? "Fusionando…" : "Fusionar duplicadas"}
          </button>
        </div>
      ) : null}

      {listQ.isLoading ? (
        <p className="text-sm text-brand-ink/60">Cargando…</p>
      ) : (listQ.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-10 text-center">
          <LayoutGrid className="mx-auto mb-3 size-8 text-brand-ink/40" />
          <p className="text-sm text-brand-ink/60">
            {isStudent ? "Tu profesor aún no ha creado aulas." : "Aún no hay boards. Crea el primero."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(listQ.data ?? []).map((b: any) => {
            const st = studentOf(b);
            return (
              <li key={b.id}>
                <Link
                  to="/boards/$boardId"
                  params={{ boardId: b.id }}
                  className="block rounded-2xl border border-brand-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5"
                >
                  <div className="text-sm font-semibold text-brand-ink">{b.name}</div>
                  {isAdmin ? (
                    <div className="mt-1 text-xs text-brand-ink/55">
                      Profe: {ownerOf(b)}{st ? ` · Estudiante: ${st}` : ""}
                    </div>
                  ) : st && (isTeacher) ? (
                    <div className="mt-1 text-xs text-brand-ink/55">Estudiante: {st}</div>
                  ) : null}
                  <div className="mt-1 text-xs text-brand-ink/45">
                    Actualizado {new Date(b.updatedAt).toLocaleString()}
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

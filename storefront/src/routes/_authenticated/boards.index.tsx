import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { boardsApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/boards/")({
  head: () => ({ meta: [{ title: "Boards colaborativos" }] }),
  component: BoardsIndex,
});

function BoardsIndex() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const listQ = useQuery({ queryKey: ["boards"], queryFn: () => boardsApi.list() });

  const createM = useMutation({
    mutationFn: async (n: string) => {
      const b = await boardsApi.create(n);
      await boardsApi.createPage(b.id, { title: "Página 1" });
      return b;
    },
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-ink">Boards</h1>
          <p className="text-xs text-brand-ink/55">
            Documentos colaborativos en tiempo real con tu profesor o estudiantes.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createM.mutate(name.trim());
            setName("");
          }}
          className="flex items-center gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del board"
            className="rounded-full border border-brand-line bg-white px-4 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={createM.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Plus className="size-3.5" /> Crear
          </button>
        </form>
      </header>

      {listQ.isLoading ? (
        <p className="text-sm text-brand-ink/60">Cargando…</p>
      ) : (listQ.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-10 text-center">
          <LayoutGrid className="mx-auto mb-3 size-8 text-brand-ink/40" />
          <p className="text-sm text-brand-ink/60">Aún no tienes boards. Crea el primero.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(listQ.data ?? []).map((b: any) => (
            <li key={b.id}>
              <Link
                to="/boards/$boardId"
                params={{ boardId: b.id }}
                className="block rounded-2xl border border-brand-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5"
              >
                <div className="text-sm font-semibold text-brand-ink">{b.name}</div>
                <div className="mt-1 text-xs text-brand-ink/55">
                  Actualizado {new Date(b.updatedAt).toLocaleString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
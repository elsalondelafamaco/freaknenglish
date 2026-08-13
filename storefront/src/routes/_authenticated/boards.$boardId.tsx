import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { boardsApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  head: () => ({ meta: [{ title: "Board" }] }),
  component: BoardLayout,
});

function BoardLayout() {
  const { boardId } = useParams({ from: "/_authenticated/boards/$boardId" });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const boardQ = useQuery({ queryKey: ["board", boardId], queryFn: () => boardsApi.get(boardId) });
  const pagesQ = useQuery({ queryKey: ["board", boardId, "pages"], queryFn: () => boardsApi.listPages(boardId) });
  const pages = useMemo(() => (pagesQ.data ?? []).slice().sort((a, b) => a.position - b.position), [pagesQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["board", boardId, "pages"] });
  const createPageM = useMutation({
    mutationFn: () => boardsApi.createPage(boardId, { title: `Página ${pages.length + 1}` }),
    onSuccess: (p: any) => {
      invalidate();
      nav({ to: "/boards/$boardId/pages/$pageId", params: { boardId, pageId: p.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo crear la página"),
  });
  const renameM = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => boardsApi.renamePage(id, title),
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo renombrar"),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => boardsApi.deletePage(id),
    onSuccess: () => { invalidate(); setConfirmDeleteId(null); toast.success("Página eliminada"); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const params = useParams({ strict: false }) as { pageId?: string };
  useEffect(() => {
    if (!params.pageId && pages.length > 0) {
      nav({ to: "/boards/$boardId/pages/$pageId", params: { boardId, pageId: pages[0].id }, replace: true });
    }
  }, [params.pageId, pages, boardId, nav]);

  function startEdit(p: { id: string; title: string }) {
    setEditingId(p.id);
    setEditTitle(p.title);
    setConfirmDeleteId(null);
  }
  function commitEdit() {
    if (editingId && editTitle.trim()) renameM.mutate({ id: editingId, title: editTitle.trim() });
    else setEditingId(null);
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-3 lg:h-[calc(100vh-8rem)] lg:flex-row lg:gap-4">
      {/* Panel de páginas: barra horizontal en mobile, sidebar en desktop */}
      <aside className="shrink-0 rounded-2xl border border-brand-line bg-white p-3 lg:w-64 lg:overflow-y-auto lg:p-4">
        <header className="mb-2 flex items-center justify-between gap-2 lg:mb-3 lg:block">
          <div className="min-w-0">
            <Link to="/boards" className="text-xs text-brand-ink/55 hover:text-brand-ink">← Boards</Link>
            <h2 className="truncate text-sm font-semibold text-brand-ink lg:mt-1">{boardQ.data?.name ?? "…"}</h2>
          </div>
          <button
            onClick={() => createPageM.mutate()}
            disabled={createPageM.isPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white shadow-soft disabled:opacity-60 lg:mt-3 lg:w-full lg:justify-center"
          >
            <Plus className="size-3.5" /> <span className="hidden sm:inline">Nueva página</span><span className="sm:hidden">Página</span>
          </button>
        </header>

        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 lg:space-y-1">
          {pages.map((p) => (
            <li key={p.id} className="group flex shrink-0 items-center gap-1 lg:shrink">
              {editingId === p.id ? (
                <span className="flex items-center gap-1 rounded-lg border border-brand-ink/30 bg-white px-1 py-0.5">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingId(null); }}
                    className="w-28 bg-transparent px-1 py-1 text-sm text-brand-ink focus:outline-none lg:w-32"
                  />
                  <button onClick={commitEdit} className="rounded p-1 text-brand-success hover:bg-brand-cream/40" aria-label="Guardar"><Check className="size-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="rounded p-1 text-brand-ink/40 hover:bg-brand-cream/40" aria-label="Cancelar"><X className="size-3.5" /></button>
                </span>
              ) : confirmDeleteId === p.id ? (
                <span className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1">
                  <span className="text-xs text-red-700">¿Eliminar?</span>
                  <button onClick={() => deleteM.mutate(p.id)} disabled={deleteM.isPending} className="rounded p-1 text-red-600 hover:bg-red-100" aria-label="Confirmar"><Check className="size-3.5" /></button>
                  <button onClick={() => setConfirmDeleteId(null)} className="rounded p-1 text-brand-ink/40 hover:bg-white" aria-label="Cancelar"><X className="size-3.5" /></button>
                </span>
              ) : (
                <>
                  <Link
                    to="/boards/$boardId/pages/$pageId"
                    params={{ boardId, pageId: p.id }}
                    className="max-w-[10rem] flex-1 truncate whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-brand-ink/85 hover:bg-brand-cream/40 aria-[current=page]:bg-brand-cream aria-[current=page]:font-semibold lg:max-w-none"
                    activeProps={{ "aria-current": "page" } as any}
                  >
                    {p.title}
                  </Link>
                  <button
                    onClick={() => startEdit(p)}
                    className="rounded p-1 text-brand-ink/40 hover:bg-brand-cream/40 hover:text-brand-ink lg:opacity-0 lg:group-hover:opacity-100"
                    aria-label="Renombrar"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    onClick={() => { setConfirmDeleteId(p.id); setEditingId(null); }}
                    className="rounded p-1 text-red-500/70 hover:bg-red-50 hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {pages.length === 0 && !pagesQ.isLoading ? (
          <p className="mt-2 text-xs text-brand-ink/50">Sin páginas todavía.</p>
        ) : null}
      </aside>

      {/* `overflow-auto` SOLO en lg, que es donde el contenedor tiene alto fijo
          (`lg:h-[calc(100vh-8rem)]`) y esta sección scrollea de verdad. Por
          debajo de lg no hay tope de alto: la sección crecía con el contenido y
          nunca scrolleaba, pero al tener `overflow-auto` seguía siendo el
          contenedor de scroll del `sticky` de la barra de herramientas — que
          por eso no se pegaba, mientras la que scrolleaba era la ventana. */}
      <section className="min-w-0 flex-1 rounded-2xl border border-brand-line bg-white p-3 md:p-6 lg:overflow-auto">
        <Outlet />
      </section>
    </div>
  );
}

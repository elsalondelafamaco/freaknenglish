import { useEffect, useMemo } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { boardsApi } from "@/lib/api/endpoints";
import { InviteDialog } from "@/components/board/InviteDialog";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  head: () => ({ meta: [{ title: "Board" }] }),
  component: BoardLayout,
});

function BoardLayout() {
  const { boardId } = useParams({ from: "/_authenticated/boards/$boardId" });
  const qc = useQueryClient();
  const nav = useNavigate();

  const boardQ = useQuery({ queryKey: ["board", boardId], queryFn: () => boardsApi.get(boardId) });
  const pagesQ = useQuery({
    queryKey: ["board", boardId, "pages"],
    queryFn: () => boardsApi.listPages(boardId),
  });
  const pages = useMemo(() => (pagesQ.data ?? []).slice().sort((a, b) => a.position - b.position), [pagesQ.data]);

  const createPageM = useMutation({
    mutationFn: () => boardsApi.createPage(boardId, { title: `Página ${pages.length + 1}` }),
    onSuccess: (p: any) => {
      qc.invalidateQueries({ queryKey: ["board", boardId, "pages"] });
      nav({ to: "/boards/$boardId/pages/$pageId", params: { boardId, pageId: p.id } });
    },
  });
  const renameM = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => boardsApi.renamePage(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId, "pages"] }),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => boardsApi.deletePage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", boardId, "pages"] });
      toast.success("Página eliminada");
    },
  });

  // Auto-open first page if none selected
  const params = useParams({ strict: false }) as { pageId?: string };
  useEffect(() => {
    if (!params.pageId && pages.length > 0) {
      nav({
        to: "/boards/$boardId/pages/$pageId",
        params: { boardId, pageId: pages[0].id },
        replace: true,
      });
    }
  }, [params.pageId, pages, boardId, nav]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <aside className="w-64 shrink-0 rounded-2xl border border-brand-line bg-white p-4">
        <header className="mb-3">
          <Link to="/boards" className="text-xs text-brand-ink/55 hover:text-brand-ink">
            ← Boards
          </Link>
          <h2 className="mt-1 truncate text-sm font-semibold text-brand-ink">
            {boardQ.data?.name ?? "…"}
          </h2>
          <div className="mt-2"><InviteDialog boardId={boardId} /></div>
        </header>
        <button
          onClick={() => createPageM.mutate()}
          disabled={createPageM.isPending}
          className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white shadow-soft disabled:opacity-60"
        >
          <Plus className="size-3.5" /> Nueva página
        </button>
        <ul className="space-y-1">
          {pages.map((p) => (
            <li key={p.id} className="group flex items-center gap-1">
              <Link
                to="/boards/$boardId/pages/$pageId"
                params={{ boardId, pageId: p.id }}
                className="flex-1 truncate rounded-lg px-2 py-1.5 text-sm text-brand-ink/85 hover:bg-brand-cream/40 aria-[current=page]:bg-brand-cream aria-[current=page]:font-semibold"
                activeProps={{ "aria-current": "page" } as any}
              >
                {p.title}
              </Link>
              <button
                onClick={() => {
                  const title = prompt("Renombrar página", p.title);
                  if (title && title.trim()) renameM.mutate({ id: p.id, title: title.trim() });
                }}
                className="rounded p-1 text-brand-ink/40 opacity-0 hover:bg-brand-cream/40 hover:text-brand-ink group-hover:opacity-100"
                aria-label="Renombrar"
              >
                <Pencil className="size-3" />
              </button>
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar "${p.title}"?`)) deleteM.mutate(p.id);
                }}
                className="rounded p-1 text-red-500/70 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                aria-label="Eliminar"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        {pages.length === 0 && !pagesQ.isLoading ? (
          <p className="mt-2 text-xs text-brand-ink/50">Sin páginas todavía.</p>
        ) : null}
      </aside>
      <section className="min-w-0 flex-1 overflow-auto rounded-2xl border border-brand-line bg-white p-6">
        <Outlet />
      </section>
    </div>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { notificationsApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  head: () => ({ meta: [{ title: "Notificaciones" }] }),
});

function NotificationsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", "list", "full"],
    queryFn: () => notificationsApi.list({ limit: 100 }),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-ink">Notificaciones</h1>
        <button
          onClick={() => markAll.mutate()}
          className="rounded-xl bg-brand-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Marcar todas como leídas
        </button>
      </div>
      {q.isLoading ? (
        <div className="text-brand-ink/60">Cargando…</div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-brand-line bg-white p-8 text-center text-brand-ink/60">
          Todavía no tienes notificaciones.
        </div>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((n) => {
            const Body = (
              <div
                className={cn(
                  "rounded-2xl border border-brand-line px-4 py-3",
                  n.readAt ? "bg-white" : "bg-brand-cream/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-brand-ink">{n.title ?? n.subject}</div>
                  <div className="text-xs text-brand-ink/60">{new Date(n.createdAt).toLocaleString("es-CO")}</div>
                </div>
                {n.body ? <div className="mt-1 text-sm text-brand-ink/80">{n.body}</div> : null}
                <div className="mt-1 text-[10px] uppercase tracking-wide text-brand-ink/50">{n.type}</div>
              </div>
            );
            const onClick = () => { if (!n.readAt) markRead.mutate(n.id); };
            return (
              <li key={n.id}>
                {n.linkUrl ? (
                  <Link to={n.linkUrl as never} onClick={onClick} className="block">{Body}</Link>
                ) : (
                  <button onClick={onClick} className="block w-full text-left">{Body}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, Vacio, btnChip, eyebrow, focusRing } from "@/components/app/AppUi";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  head: () => ({ meta: [{ title: "Notificaciones" }] }),
});

const TIPO: Record<string, string> = {
  system: "Sistema",
  payment: "Pagos",
  class: "Clases",
  teacher: "Asignaciones",
  learning: "Aprendizaje",
};

// El cascarón (menú lateral, encabezado) ya lo pone el layout `_authenticated`;
// envolver esta pantalla en otro AppShell dibujaba el menú dos veces.
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
  const sinLeer = (q.data ?? []).filter((n) => !n.readAt).length;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrowText={q.data ? (sinLeer > 0 ? `${sinLeer} sin leer` : "Estás al día") : undefined}
        title="Tus notificaciones"
        highlight="notificaciones"
        aside={
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || sinLeer === 0}
            className={btnChip}
          >
            Marcar todas como leídas
          </button>
        }
      />

      {q.isLoading ? (
        <Cargando>Cargando tus notificaciones…</Cargando>
      ) : q.isError ? (
        <EstadoError onRetry={() => void q.refetch()}>
          No pudimos cargar tus notificaciones. Revisa tu conexión e inténtalo de nuevo.
        </EstadoError>
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vacio titulo="Todo en calma">Todavía no tienes notificaciones.</Vacio>
      ) : (
        <ul className="space-y-2">
          {q.data!.map((n) => {
            // Sin leer = amarillo: es lo único que pide atención.
            const Body = (
              <div
                className={cn(
                  "border-2 border-brand-ink px-4 py-3",
                  n.readAt ? "bg-white" : "bg-brand-yellow-soft",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-bold text-brand-ink">
                    {n.title ?? n.subject}
                    {!n.readAt ? <span className="sr-only"> (sin leer)</span> : null}
                  </div>
                  <div className="shrink-0 text-xs text-brand-ink/70">{new Date(n.createdAt).toLocaleString("es-CO")}</div>
                </div>
                {n.body ? <div className="mt-1 text-sm text-brand-ink/90">{n.body}</div> : null}
                <div className={cn(eyebrow, "mt-1.5 !tracking-[0.1em]")}>{TIPO[n.type] ?? n.type}</div>
              </div>
            );
            const onClick = () => { if (!n.readAt) markRead.mutate(n.id); };
            return (
              <li key={n.id}>
                {n.linkUrl ? (
                  <Link to={n.linkUrl as never} onClick={onClick} className={cn("block no-underline", focusRing)}>{Body}</Link>
                ) : (
                  <button type="button" onClick={onClick} className={cn("block w-full text-left", focusRing)}>{Body}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

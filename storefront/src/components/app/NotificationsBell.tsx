import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { notificationsApi, type InAppNotification } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

const ICON_BY_TYPE: Record<InAppNotification["type"], string> = {
  system: "🔔",
  payment: "💳",
  class: "📅",
  teacher: "👩‍🏫",
  learning: "📚",
};

const TYPE_LABEL: Record<string, string> = {
  system: "Sistema",
  payment: "Pagos",
  class: "Clases",
  teacher: "Asignaciones",
  learning: "Aprendizaje",
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

/**
 * `haciaArriba`: el panel se abre por encima de la campana en vez de por
 * debajo. Hace falta donde la campana queda pegada al borde inferior de la
 * pantalla —el sidebar colapsado la manda al fondo—, porque el panel mide unos
 * 26rem y se salía de la ventana sin nada que lo rescatara: el `<aside>` es
 * `fixed inset-y-0` y no tiene scroll.
 */
export function NotificationsBell({ haciaArriba = false }: { haciaArriba?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const qc = useQueryClient();
  const countQ = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 60_000,
  });
  const listQ = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.list({ limit: 50 }),
    enabled: open,
  });
  const filtered = typeFilter ? (listQ.data ?? []).filter((n) => n.type === typeFilter) : (listQ.data ?? []).slice(0, 15);
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = countQ.data?.count ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-brand-ink hover:bg-brand-cream/50"
        aria-label="Notificaciones"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 lg:left-0 lg:right-auto z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-brand-line bg-white p-2 shadow-lg ${
              haciaArriba ? "bottom-full mb-2" : "mt-2"
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <div className="text-sm font-semibold text-brand-ink">Notificaciones</div>
              {unread > 0 ? (
                <button
                  className="text-xs text-brand-ink/60 hover:text-brand-ink"
                  onClick={() => markAll.mutate()}
                >
                  Marcar todas
                </button>
              ) : null}
            </div>
            {/* Filtro por tipo (útil para el admin: ej. solo Asignaciones) */}
            <div className="flex flex-wrap gap-1 px-2 pb-1">
              {["", "teacher", "class", "payment", "system"].map((tp) => (
                <button
                  key={tp || "all"}
                  onClick={() => setTypeFilter(tp)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold transition",
                    typeFilter === tp
                      ? "bg-brand-ink text-white"
                      : "bg-brand-cream/50 text-brand-ink/60 hover:bg-brand-cream",
                  )}
                >
                  {tp ? TYPE_LABEL[tp] : "Todas"}
                </button>
              ))}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {listQ.isLoading ? (
                <div className="p-4 text-center text-xs text-brand-ink/60">Cargando…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-xs text-brand-ink/60">Sin notificaciones</div>
              ) : (
                filtered.map((n) => {
                  const inner = (
                    <div
                      className={cn(
                        "flex gap-2 rounded-xl px-3 py-2 text-sm",
                        n.readAt ? "text-brand-ink/70" : "bg-brand-cream/40 text-brand-ink",
                      )}
                    >
                      <div className="text-lg leading-none">{ICON_BY_TYPE[n.type] ?? "🔔"}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{n.title ?? n.subject}</div>
                        {n.body ? <div className="truncate text-xs opacity-80">{n.body}</div> : null}
                        <div className="mt-0.5 text-[10px] uppercase tracking-wide opacity-60">
                          {timeAgo(n.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                  const onClick = () => {
                    if (!n.readAt) markRead.mutate(n.id);
                    setOpen(false);
                  };
                  return n.linkUrl ? (
                    <Link
                      key={n.id}
                      to={n.linkUrl as never}
                      onClick={onClick}
                      className="block hover:bg-brand-cream/30 rounded-xl"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      key={n.id}
                      onClick={onClick}
                      className="block w-full text-left hover:bg-brand-cream/30 rounded-xl"
                    >
                      {inner}
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-brand-line pt-2">
              <Link
                to="/notifications"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-center text-xs font-medium text-brand-ink hover:bg-brand-cream/40"
              >
                Ver todas
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
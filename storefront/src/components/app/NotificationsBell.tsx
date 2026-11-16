import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, BookOpen, CalendarDays, CreditCard, UserCheck, type LucideIcon } from "lucide-react";
import { focusRing } from "@/components/site/AuthShell";
import { notificationsApi, type InAppNotification } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

const ICON_BY_TYPE: Record<InAppNotification["type"], LucideIcon> = {
  system: Bell,
  payment: CreditCard,
  class: CalendarDays,
  teacher: UserCheck,
  learning: BookOpen,
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
        type="button"
        className={cn("relative inline-flex size-11 items-center justify-center rounded-full text-brand-ink hover:bg-brand-cream", focusRing)}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span aria-hidden="true" className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-brand-ink bg-brand-yellow px-1 text-[10px] font-bold text-brand-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`shadow-hard absolute right-0 lg:left-0 lg:right-auto z-50 w-80 max-w-[calc(100vw-1.5rem)] border-2 border-brand-ink bg-white p-2 [--hard-x:4px] ${
              haciaArriba ? "bottom-full mb-2" : "mt-2"
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <div className="font-display text-sm font-extrabold uppercase text-brand-ink">Notificaciones</div>
              {unread > 0 ? (
                <button
                  type="button"
                  className={cn("inline-flex min-h-11 items-center px-1 text-xs font-bold text-brand-ink underline underline-offset-2 hover:text-brand-ink-soft", focusRing)}
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
                  type="button"
                  onClick={() => setTypeFilter(tp)}
                  aria-pressed={typeFilter === tp}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full border-[1.5px] border-brand-ink px-3 text-[11px] font-bold transition",
                    typeFilter === tp
                      ? "bg-brand-ink text-brand-cream dark:text-white"
                      : "bg-white text-brand-ink hover:bg-brand-cream",
                    focusRing,
                  )}
                >
                  {tp ? TYPE_LABEL[tp] : "Todas"}
                </button>
              ))}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {listQ.isLoading ? (
                <div role="status" className="p-4 text-center text-xs text-brand-ink/70">Cargando…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-xs text-brand-ink/70">Sin notificaciones</div>
              ) : (
                filtered.map((n) => {
                  const Icono = ICON_BY_TYPE[n.type] ?? Bell;
                  const inner = (
                    <div
                      className={cn(
                        "flex gap-2.5 rounded-xl px-3 py-2.5 text-sm",
                        n.readAt ? "text-brand-ink/70" : "bg-brand-yellow-soft text-brand-ink",
                      )}
                    >
                      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
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
                      className={cn("block rounded-xl hover:bg-brand-cream", focusRing)}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      key={n.id}
                      onClick={onClick}
                      type="button"
                      className={cn("block w-full rounded-xl text-left hover:bg-brand-cream", focusRing)}
                    >
                      {inner}
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-brand-ink/15 pt-2">
              <Link
                to="/notifications"
                onClick={() => setOpen(false)}
                className={cn("flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-bold text-brand-ink underline underline-offset-2 hover:bg-brand-cream", focusRing)}
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
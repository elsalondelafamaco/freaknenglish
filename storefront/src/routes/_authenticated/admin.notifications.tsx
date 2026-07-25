import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Mail, Search, XCircle } from "lucide-react";
import { notificationsApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [{ title: "Notificaciones — Admin Freakn'" }] }),
  component: AdminNotifications,
});

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  sent: { label: "Enviada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  failed: { label: "Falló", cls: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  pending: { label: "Pendiente", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
};

function AdminNotifications() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [template, setTemplate] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data: templates } = useQuery({
    queryKey: ["admin", "notif-templates"],
    queryFn: () => notificationsApi.adminTemplates(),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "notifications", { q: qDebounced, template, status, page }],
    queryFn: () =>
      notificationsApi.adminAll({
        q: qDebounced || undefined,
        template: template || undefined,
        status: status || undefined,
        page,
        pageSize: 50,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Notificaciones</h1>
        <p className="mt-1 text-sm text-brand-ink/65">
          Rastreo completo de correos y avisos enviados a estudiantes y profesores.
        </p>
      </header>

      {/* Resumen por estado */}
      <div className="mt-5 flex flex-wrap gap-3">
        {["sent", "failed", "pending"].map((s) => {
          const meta = STATUS_META[s];
          const count = data?.byStatus?.[s] ?? 0;
          return (
            <button
              key={s}
              onClick={() => { setStatus(status === s ? "" : s); setPage(1); }}
              className={cn(
                "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                status === s ? "ring-2 ring-brand-ink ring-offset-1" : "",
                meta.cls,
              )}
            >
              {meta.label}: {count}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQDebounced(q.trim()); setPage(1); } }}
            onBlur={() => { setQDebounced(q.trim()); setPage(1); }}
            placeholder="Buscar por correo, nombre o asunto…"
            className="w-72 rounded-full border border-brand-line bg-white py-2 pl-9 pr-4 text-sm focus:border-brand-ink focus:outline-none"
          />
        </div>
        <select
          value={template}
          onChange={(e) => { setTemplate(e.target.value); setPage(1); }}
          className="rounded-full border border-brand-line bg-white px-3 py-2 text-sm"
        >
          <option value="">Todas las plantillas</option>
          {(templates ?? []).map((t) => (
            <option key={t.template} value={t.template}>
              {t.template} ({t.count})
            </option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-brand-line bg-white shadow-soft">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-brand-line text-left text-xs uppercase tracking-wide text-brand-ink/50">
              <th className="px-4 py-3">Destinatario</th>
              <th className="px-4 py-3">Asunto</th>
              <th className="px-4 py-3">Plantilla</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-ink/50">Cargando…</td></tr>
            ) : !data?.items.length ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-ink/50">Sin notificaciones con estos filtros.</td></tr>
            ) : (
              data.items.map((n) => {
                const meta = STATUS_META[n.status] ?? STATUS_META.pending;
                const StatusIcon = meta.icon;
                return (
                  <tr key={n.id} className="border-b border-brand-line/60 align-top last:border-0 hover:bg-brand-cream/20">
                    <td className="px-4 py-3">
                      <div className="font-medium text-brand-ink">{n.user?.fullName ?? "—"}</div>
                      <div className="text-xs text-brand-ink/60">{n.toEmail}</div>
                      {n.user?.role ? (
                        <span className="mt-0.5 inline-block rounded-full bg-brand-cream/70 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-ink/60">
                          {n.user.role}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-brand-ink/85">{n.subject}</td>
                    <td className="px-4 py-3"><code className="rounded bg-brand-cream/50 px-1.5 py-0.5 text-xs">{n.template}</code></td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-brand-ink/70">
                        <Mail className="size-3.5" /> {n.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", meta.cls)}>
                        <StatusIcon className="size-3.5" /> {meta.label}
                      </span>
                      {n.error ? <div className="mt-1 max-w-[200px] text-[11px] text-red-600">{n.error}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-ink/60">
                      {new Date(n.sentAt ?? n.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                      {n.readAt ? <div className="text-[10px] text-emerald-600">Leída in-app</div> : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {data && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-brand-ink/70">
          <span>
            {data.total} notificaciones · página {data.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex size-9 items-center justify-center rounded-full border border-brand-line bg-white transition hover:bg-brand-cream/40 disabled:opacity-40"
              aria-label="Anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex size-9 items-center justify-center rounded-full border border-brand-line bg-white transition hover:bg-brand-cream/40 disabled:opacity-40"
              aria-label="Siguiente"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

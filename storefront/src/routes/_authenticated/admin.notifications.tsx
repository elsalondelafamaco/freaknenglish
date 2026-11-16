import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Mail, Search, XCircle } from "lucide-react";
import { notificationsApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, Vacio } from "@/components/app/AppUi";
import { btnRow, inputBase, pillClass, td, th } from "@/components/teacher/TeacherUi";
import { ChipEstado } from "@/components/admin/AdminUi";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [{ title: "Notificaciones — Admin Freakn'" }] }),
  component: AdminNotifications,
});

// Fallida y pendiente piden atención (amarillo); enviada es lo normal (neutra).
const STATUS_META: Record<string, { label: string; atencion: boolean; icon: typeof CheckCircle2 }> = {
  sent: { label: "Enviada", atencion: false, icon: CheckCircle2 },
  failed: { label: "Falló", atencion: true, icon: XCircle },
  pending: { label: "Pendiente", atencion: true, icon: Clock },
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

  const { data, isLoading, isError, refetch } = useQuery({
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
    <div className="flex flex-col gap-6">
      <PageHeader eyebrowText="Admin · Operación" title="Notificaciones" highlight="Notificaciones">
        Rastreo completo de correos y avisos enviados a estudiantes y profesores.
      </PageHeader>

      {/* Resumen por estado: cada uno filtra la tabla */}
      <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {["sent", "failed", "pending"].map((s) => {
          const meta = STATUS_META[s];
          const count = data?.byStatus?.[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => { setStatus(status === s ? "" : s); setPage(1); }}
              className={pillClass(status === s)}
            >
              {meta.label}: {count}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/70" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar notificaciones"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQDebounced(q.trim()); setPage(1); } }}
            onBlur={() => { setQDebounced(q.trim()); setPage(1); }}
            placeholder="Buscar por correo, nombre o asunto…"
            className={`${inputBase} w-72 max-w-full pl-9`}
          />
        </div>
        <select
          aria-label="Plantilla"
          value={template}
          onChange={(e) => { setTemplate(e.target.value); setPage(1); }}
          className={`${inputBase} w-auto`}
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
      {isError ? (
        <EstadoError onRetry={() => void refetch()}>No pudimos cargar las notificaciones.</EstadoError>
      ) : isLoading && !data ? (
        <Cargando>Cargando notificaciones…</Cargando>
      ) : !data?.items.length ? (
        <Vacio>Sin notificaciones con estos filtros.</Vacio>
      ) : (
        <div className="overflow-x-auto border-2 border-brand-ink bg-white">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Destinatario</th>
                <th className={th}>Asunto</th>
                <th className={th}>Plantilla</th>
                <th className={th}>Canal</th>
                <th className={th}>Estado</th>
                <th className={th}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((n) => {
                const meta = STATUS_META[n.status] ?? STATUS_META.pending;
                const StatusIcon = meta.icon;
                return (
                  <tr key={n.id} className="align-top">
                    <td className={td}>
                      <div className="font-bold">{n.user?.fullName ?? "—"}</div>
                      <div className="text-xs text-brand-ink/70">{n.toEmail}</div>
                      {n.user?.role ? <ChipEstado className="mt-1 uppercase">{n.user.role}</ChipEstado> : null}
                    </td>
                    <td className={cn(td, "max-w-[260px]")}>{n.subject}</td>
                    <td className={td}><code className="bg-brand-cream-soft px-1.5 py-0.5 text-xs">{n.template}</code></td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1 text-xs text-brand-ink/70">
                        <Mail className="size-3.5" aria-hidden="true" /> {n.channel}
                      </span>
                    </td>
                    <td className={td}>
                      <ChipEstado atencion={meta.atencion} className="gap-1">
                        <StatusIcon className="size-3.5" aria-hidden="true" /> {meta.label}
                      </ChipEstado>
                      {n.error ? <div className="mt-1 max-w-[200px] text-[11px] font-semibold text-red-800">{n.error}</div> : null}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-xs text-brand-ink/70")}>
                      {new Date(n.sentAt ?? n.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                      {n.readAt ? <div className="text-[11px] font-semibold text-brand-ink">Leída in-app</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {data && totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-brand-ink/80">
          <span>
            {data.total} notificaciones · página {data.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className={btnRow}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" aria-hidden="true" /> Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={btnRow}
              aria-label="Página siguiente"
            >
              Siguiente <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

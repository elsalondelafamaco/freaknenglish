import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [{ title: "Automaciones — Admin Freakn'" }] }),
  component: AdminNotifications,
});

function AdminNotifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "notifications"], queryFn: () => adminApi.notifications() });
  const runM = useMutation({
    mutationFn: () => adminApi.runAutomations(),
    onSuccess: () => { toast.success("Automaciones ejecutadas"); qc.invalidateQueries({ queryKey: ["admin", "notifications"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const items = (q.data ?? []) as any[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-brand-ink">Notificaciones</h2>
          <p className="mt-1 max-w-2xl text-sm text-brand-ink/65">
            Registro de emails y mensajes enviados por la plataforma (bienvenida, recordatorios de clase, encuestas y renovaciones).
          </p>
        </div>
        <button onClick={() => runM.mutate()} disabled={runM.isPending} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-ink px-4 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg disabled:opacity-60">
          <RefreshCcw className={`size-4 ${runM.isPending ? "animate-spin" : ""}`} />
          Ejecutar automaciones
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream/40 text-left text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
            <tr>
              <th className="px-4 py-3">Cuándo</th>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Destinatario</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-brand-ink/55">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-brand-ink/55">Sin notificaciones aún. Corre las automaciones para empezar.</td></tr>
            ) : (
              items.map((n) => (
                <tr key={n.id} className="border-t border-brand-line/70">
                  <td className="px-4 py-3 text-brand-ink/65">{new Date(n.createdAt).toLocaleString("es-CO")}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-ink">{n.template}</div>
                    <div className="text-xs text-brand-ink/55">{n.subject}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-ink/75">{n.toEmail}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {n.channel === "email" ? <Mail className="size-3" /> : <Send className="size-3" />}
                      {n.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={n.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: "bg-brand-cream text-brand-ink",
    sent: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-800",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-brand-line text-brand-ink/60"}`}>{status}</span>;
}

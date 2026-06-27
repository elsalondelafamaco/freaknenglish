import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, RefreshCcw, Send } from "lucide-react";
import {
  listNotifications,
  runAutomations,
  type NotificationRecord,
} from "@/lib/domain/notifications";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({ meta: [{ title: "Automaciones — Admin Freakn'" }] }),
  component: AdminNotifications,
});

function AdminNotifications() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<number | null>(null);

  const refresh = () => setItems(listNotifications());
  useEffect(() => {
    refresh();
  }, []);

  const onRun = async () => {
    setRunning(true);
    try {
      const newOnes = await runAutomations();
      setLastRun(newOnes);
      refresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-brand-ink">
            Notificaciones
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-brand-ink/65">
            Registro de emails y mensajes enviados por la plataforma (bienvenida,
            recordatorios de clase, encuestas y renovaciones).
          </p>
        </div>
        <button
          onClick={onRun}
          disabled={running}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-ink px-4 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg disabled:opacity-60"
        >
          <RefreshCcw className={`size-4 ${running ? "animate-spin" : ""}`} />
          Ejecutar automaciones
        </button>
      </div>

      {lastRun !== null ? (
        <div className="rounded-2xl border border-brand-line bg-brand-cream/30 px-4 py-3 text-sm text-brand-ink">
          Última ejecución envió <strong>{lastRun}</strong> notificaciones nuevas.
        </div>
      ) : null}

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
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-brand-ink/55">
                  Sin notificaciones aún. Corre las automaciones para empezar.
                </td>
              </tr>
            ) : (
              items.map((n) => (
                <tr key={n.id} className="border-t border-brand-line/70">
                  <td className="px-4 py-3 text-brand-ink/65">
                    {new Date(n.createdAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-ink">{n.template}</div>
                    <div className="text-xs text-brand-ink/55">{n.subject}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-ink/75">{n.to}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {n.channel === "email" ? <Mail className="size-3" /> : <Send className="size-3" />}
                      {n.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={n.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: NotificationRecord["status"] }) {
  const map: Record<NotificationRecord["status"], string> = {
    queued: "bg-brand-cream text-brand-ink",
    sent: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-800",
    skipped: "bg-brand-line text-brand-ink/60",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}
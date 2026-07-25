import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/cleanup")({
  head: () => ({ meta: [{ title: "Cleanup — Admin Freakn'" }] }),
  component: AdminCleanup,
});

const TARGETS: Array<{ id: string; label: string; countKey: string; hint: string }> = [
  { id: "students", label: "Estudiantes", countKey: "students", hint: "Borra usuarios estudiantes con todo lo suyo (clases, progreso, encuestas…). Nunca borra admins." },
  { id: "teachers", label: "Profesores", countKey: "teachers", hint: "Borra usuarios profesores, su disponibilidad y ausencias." },
  { id: "subscriptions", label: "Suscripciones", countKey: "subscriptions", hint: "Borra todas las suscripciones (los usuarios quedan sin plan)." },
  { id: "schedule", label: "Horarios", countKey: "slots", hint: "Borra slots de horario y resetea preferencias/asignaciones de estudiantes." },
  { id: "classes", label: "Clases", countKey: "classes", hint: "Borra todas las clases y sus notas." },
  { id: "payments", label: "Pagos", countKey: "payments", hint: "Borra paymentIntents y eventos de pago (histórico contable incluido)." },
  { id: "notifications", label: "Notificaciones", countKey: "notifications", hint: "Borra el historial de correos y avisos." },
  { id: "boards", label: "Boards", countKey: "boards", hint: "Borra todos los boards con su contenido." },
  { id: "surveys", label: "Encuestas NPS", countKey: "surveys", hint: "Borra todas las respuestas de encuestas." },
  { id: "payroll", label: "Nómina", countKey: "payrollRuns", hint: "Borra las corridas de nómina generadas." },
];

const CONFIRM_PHRASE = "BORRAR";

function AdminCleanup() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phrase, setPhrase] = useState("");

  const { data: counts } = useQuery({
    queryKey: ["admin", "cleanup-preview"],
    queryFn: () => adminApi.cleanupPreview(),
  });

  const run = useMutation({
    mutationFn: () => adminApi.cleanup(Array.from(selected)),
    onSuccess: (r) => {
      const detail = Object.entries(r.deleted)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      toast.success(`Limpieza completada — ${detail || "nada para borrar"}`);
      setSelected(new Set());
      setConfirmOpen(false);
      setPhrase("");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error en la limpieza"),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-brand-ink">
          <Trash2 className="size-7" /> Cleanup
        </h1>
        <p className="mt-1 text-sm text-brand-ink/65">
          Reset de datos para pruebas en producción. Selecciona qué borrar — tu usuario
          admin y los demás admins nunca se tocan.
        </p>
      </header>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <p>
          Esto borra datos <strong>de forma permanente</strong> en la base de datos actual.
          Úsalo solo para limpiar datos de prueba.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {TARGETS.map((t) => {
          const count = counts?.[t.countKey] ?? 0;
          const active = selected.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={cn(
                "rounded-2xl border p-4 text-left transition",
                active
                  ? "border-red-400 bg-red-50 ring-2 ring-red-300"
                  : "border-brand-line bg-white hover:border-brand-ink/30",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-brand-ink">{t.label}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold",
                    active ? "bg-red-600 text-white" : "bg-brand-cream/70 text-brand-ink/60",
                  )}
                >
                  {count}
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-ink/60">{t.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <button
          disabled={selected.size === 0}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-red-700 disabled:opacity-40"
        >
          <Trash2 className="size-4" /> Borrar seleccionado ({selected.size})
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setPhrase(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar borrado permanente</DialogTitle>
            <DialogDescription>
              Vas a borrar: {Array.from(selected).map((s) => TARGETS.find((t) => t.id === s)?.label ?? s).join(", ")}.
              Esta acción no se puede deshacer. Escribe <strong>{CONFIRM_PHRASE}</strong> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="w-full rounded-xl border border-brand-line px-4 py-2 text-sm focus:border-red-500 focus:outline-none"
          />
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              className="rounded-full border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-ink"
            >
              Cancelar
            </button>
            <button
              disabled={phrase !== CONFIRM_PHRASE || run.isPending}
              onClick={() => run.mutate()}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {run.isPending ? "Borrando…" : "Borrar definitivamente"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

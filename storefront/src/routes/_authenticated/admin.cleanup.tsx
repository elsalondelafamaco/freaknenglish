import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
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
import { PageHeader, focusRing } from "@/components/app/AppUi";

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
    <div className="flex flex-col gap-6">
      <PageHeader eyebrowText="Admin · Operación" title="Limpieza de datos" highlight="Limpieza">
        Reset de datos para pruebas en producción. Selecciona qué borrar: tu usuario admin y los demás admins nunca se tocan.
      </PageHeader>

      <div role="alert" className="flex items-start gap-2 border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>
          Esto borra datos <strong>de forma permanente</strong> en la base de datos actual. Úsalo solo para limpiar
          datos de prueba.
        </p>
      </div>

      <div role="group" aria-label="Qué borrar" className="grid gap-3 sm:grid-cols-2">
        {TARGETS.map((t) => {
          const count = counts?.[t.countKey] ?? 0;
          const active = selected.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(t.id)}
              className={cn(
                "border-2 border-brand-ink p-4 text-left transition-colors",
                active
                  ? "bg-brand-ink text-brand-cream"
                  : "bg-white text-brand-ink hover:bg-brand-cream-soft",
                focusRing,
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  {active ? <Check className="size-4" aria-hidden="true" /> : null} {t.label}
                </span>
                <span
                  className={cn(
                    "rounded-full border-[1.5px] px-2.5 py-0.5 text-[11px] font-bold",
                    active ? "border-brand-cream bg-brand-cream text-brand-ink" : "border-brand-ink bg-white text-brand-ink",
                  )}
                >
                  {count}
                </span>
              </div>
              <p className={cn("mt-1 text-xs", active ? "text-brand-cream/90" : "text-brand-ink/70")}>{t.hint}</p>
            </button>
          );
        })}
      </div>

      <div>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-full font-bold min-h-11 px-4 text-[13px] border-2 border-red-700 bg-red-700 text-white hover:bg-red-800 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
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
            className="w-full px-4 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
          />
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full font-bold min-h-11 px-4 text-[13px] border-2 border-brand-ink bg-white text-brand-ink hover:bg-brand-cream-soft hover:text-brand-ink disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
            >
              Cancelar
            </button>
            <button
              disabled={phrase !== CONFIRM_PHRASE || run.isPending}
              onClick={() => run.mutate()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full font-bold min-h-11 px-4 text-[13px] border-2 border-red-700 bg-red-700 text-white hover:bg-red-800 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
            >
              {run.isPending ? "Borrando…" : "Borrar definitivamente"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

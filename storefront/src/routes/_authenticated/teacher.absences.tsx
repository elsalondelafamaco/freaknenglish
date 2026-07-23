import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/absences")({
  head: () => ({ meta: [{ title: "Ausencias — Freakn for Teachers" }] }),
  component: AbsencesPage,
});

const REASONS = ["Vacaciones", "Cita médica", "Enfermedad", "Otro"];

function AbsencesPage() {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["teacher", "absences"], queryFn: () => teachersApi.absences() });
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState(REASONS[0]);

  const createM = useMutation({
    mutationFn: () => teachersApi.createAbsence(new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), reason),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["teacher", "absences"] });
      const n = r?.affected?.length ?? 0;
      toast.success(n > 0 ? `Ausencia registrada. Avisamos al admin: ${n} clase(s) por reasignar.` : "Ausencia registrada. Avisamos al admin.");
      setStartsAt(""); setEndsAt("");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => teachersApi.deleteAbsence(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teacher", "absences"] }); toast.success("Ausencia eliminada"); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const valid = startsAt && endsAt && new Date(endsAt) > new Date(startsAt);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-brand-ink/65">Portal de profesores</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Ausencias</h1>
        <p className="mt-2 max-w-xl text-brand-ink/70">
          Bloquea días u horas por vacaciones, cita médica o enfermedad. El administrador recibe un aviso para gestionar reemplazos.
        </p>
      </header>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Registrar ausencia</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); if (valid) createM.mutate(); else toast.error("Revisa las fechas"); }}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <label className="text-sm">
            <span className="text-brand-ink/70">Desde</span>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2" required />
          </label>
          <label className="text-sm">
            <span className="text-brand-ink/70">Hasta</span>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2" required />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-brand-ink/70">Motivo</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2">
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={createM.isPending || !valid}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60">
              <CalendarOff className="size-4" /> Registrar ausencia
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Tus ausencias</h2>
        {listQ.isLoading ? (
          <p className="mt-3 text-sm text-brand-ink/60">Cargando…</p>
        ) : (listQ.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-brand-ink/65">No tienes ausencias registradas.</p>
        ) : (
          <ul className="mt-4 divide-y divide-brand-line">
            {(listQ.data ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  <div className="font-semibold text-brand-ink">
                    {new Date(a.startsAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} →{" "}
                    {new Date(a.endsAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  <div className="text-xs text-brand-ink/55">{a.reason ?? "—"}</div>
                </div>
                <button onClick={() => delM.mutate(a.id)} disabled={delM.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-line px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
                  <Trash2 className="size-3.5" /> Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

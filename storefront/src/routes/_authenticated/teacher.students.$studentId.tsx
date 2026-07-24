import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/students/$studentId")({
  head: () => ({ meta: [{ title: "Estudiante — Freakn for Teachers" }] }),
  component: TeacherStudentDetail,
});

function TeacherStudentDetail() {
  const { studentId } = useParams({ from: "/_authenticated/teacher/students/$studentId" });
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const q = useQuery({ queryKey: ["teacher", "student", studentId], queryFn: () => teachersApi.studentDetail(studentId) });
  const student = q.data as any;
  const classes: any[] = student?.classesAsStudent ?? [];
  const notes: any[] = classes.flatMap((c) => c.notes ?? []);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teacher", "student", studentId] });
  const addM = useMutation({
    mutationFn: () => teachersApi.addNote(classes[0].id, body.trim()),
    onSuccess: () => { toast.success("Nota guardada"); setBody(""); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });
  const pinM = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => teachersApi.pinNote(v.id, v.pinned),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  if (q.isLoading) return <div className="text-sm text-brand-ink/60">Cargando…</div>;
  if (!student) {
    return (
      <div className="rounded-2xl border border-brand-line bg-white p-6 text-sm text-brand-ink/65">
        Estudiante no encontrado. <Link to="/teacher/students" className="font-semibold text-brand-ink hover:underline">Volver</Link>
      </div>
    );
  }

  const completed = classes.filter((c) => c.status === "validated").length;
  const missed = classes.filter((c) => c.status === "no_show").length;

  function saveNote() {
    if (!body.trim()) return;
    if (!classes[0]) return toast.error("Aún no hay clases con este alumno para asociar la nota.");
    addM.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/students" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/70 hover:text-brand-ink">
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      </div>

      <header className="flex flex-col gap-2 rounded-2xl border border-brand-line bg-white p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-ink">{student.fullName}</h1>
          <p className="text-sm text-brand-ink/65">{student.email}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-brand-ink/55">Nivel actual: {student.englishLevel ?? "sin nivelar"}</p>
        </div>
        <div className="flex gap-2">
          <Mini label="Clases" value={classes.length} />
          <Mini label="Validadas" value={completed} />
          <Mini label="No asistió" value={missed} tone={missed > 0 ? "warn" : undefined} />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-brand-ink">Historial de clases</h2>
          <div className="mt-3 max-h-[60vh] overflow-y-auto overflow-hidden rounded-2xl border border-brand-line bg-white">
            {classes.length === 0 ? (
              <div className="p-6 text-sm text-brand-ink/65">Sin clases aún.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-brand-cream/60 text-xs uppercase tracking-wide text-brand-ink/60 backdrop-blur">
                  <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Tema</th><th className="px-4 py-3">Estado</th></tr>
                </thead>
                <tbody className="divide-y divide-brand-line">
                  {classes.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 text-brand-ink/80">{new Date(c.startsAt).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-3">{c.topic ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-brand-ink/70">
                        {c.status === "validated" ? "validada" : c.status === "no_show" ? "no asistió" : c.status === "cancelled" ? "cancelada" : c.status === "rescheduled" ? "reprogramada" : "programada"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside>
          <h2 className="text-lg font-semibold text-brand-ink">Notas privadas</h2>
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-4">
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Progreso, observaciones, vocabulario a reforzar…" className="w-full rounded-xl border border-brand-line bg-white p-3 text-sm focus:border-brand-ink focus:outline-none" />
            <div className="flex justify-end">
              <button onClick={saveNote} disabled={!body.trim() || addM.isPending} className="rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50">
                Guardar nota
              </button>
            </div>

            <div className="mt-2 flex max-h-[45vh] flex-col gap-3 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <p className="text-xs text-brand-ink/55">Aún no hay notas guardadas.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className={`rounded-xl p-3 ${n.pinned ? "border border-brand-ink/20 bg-brand-yellow/20" : "bg-brand-cream/40"}`}>
                    <div className="flex items-center justify-between text-[10px] uppercase text-brand-ink/55">
                      <span>{new Date(n.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>
                      <button
                        onClick={() => pinM.mutate({ id: n.id, pinned: !n.pinned })}
                        title={n.pinned ? "Quitar fijado" : "Fijar nota"}
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${n.pinned ? "text-brand-ink" : "text-brand-ink/40 hover:text-brand-ink"}`}
                      >
                        {n.pinned ? <Pin className="size-3.5 fill-brand-ink/80" /> : <PinOff className="size-3.5" />}
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink">{n.notes}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-brand-line bg-white px-4 py-2 text-center">
      <div className={`text-xl font-bold ${tone === "warn" ? "text-red-700" : "text-brand-ink"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-brand-ink/55">{label}</div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Star } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  addClassNote,
  listClassesForTeacher,
  listNotesForStudent,
} from "@/lib/domain/classes";
import { readDb } from "@/lib/domain/repository";
import type { User } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/teacher/students/$studentId")({
  head: () => ({ meta: [{ title: "Estudiante — Freakn for Teachers" }] }),
  component: TeacherStudentDetail,
});

function TeacherStudentDetail() {
  const { studentId } = useParams({ from: "/_authenticated/teacher/students/$studentId" });
  const { user } = useAuth();
  const teacherId = user?.id ?? "";
  const [tick, setTick] = useState(0);
  const [body, setBody] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  const student = useMemo<User | null>(() => {
    const u = (readDb().users as Record<string, User>)[studentId];
    return u ?? null;
  }, [studentId]);

  const classes = useMemo(
    () =>
      listClassesForTeacher(teacherId)
        .filter((c) => c.studentId === studentId)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    [teacherId, studentId, tick],
  );
  const notes = useMemo(
    () => listNotesForStudent(studentId, teacherId),
    [studentId, teacherId, tick],
  );

  if (!student) {
    return (
      <div className="rounded-2xl border border-brand-line bg-white p-6 text-sm text-brand-ink/65">
        Estudiante no encontrado.{" "}
        <Link to="/teacher/students" className="font-semibold text-brand-ink hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  async function saveNote() {
    if (!body.trim()) return;
    // Nota se asocia a la próxima/última clase disponible del alumno con este profesor.
    const anyClass = classes[0];
    if (!anyClass) {
      alert("Aún no hay clases con este alumno para asociar la nota.");
      return;
    }
    try {
      await addClassNote({
        teacherId,
        studentId,
        classId: anyClass.id,
        body,
        rating: rating ?? undefined,
      });
      setBody("");
      setRating(null);
      setTick((v) => v + 1);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const completed = classes.filter((c) => c.status === "completed").length;
  const missed = classes.filter((c) => c.status === "missed").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/teacher/students"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/70 hover:text-brand-ink"
        >
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      </div>

      <header className="flex flex-col gap-2 rounded-2xl border border-brand-line bg-white p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-ink">
            {student.fullName}
          </h1>
          <p className="text-sm text-brand-ink/65">{student.email}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-brand-ink/55">
            Nivel actual: {student.level ?? "sin nivelar"}
          </p>
        </div>
        <div className="flex gap-2">
          <Mini label="Clases" value={classes.length} />
          <Mini label="Completadas" value={completed} />
          <Mini label="No asistió" value={missed} tone={missed > 0 ? "warn" : undefined} />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-brand-ink">Historial de clases</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-brand-line bg-white">
            {classes.length === 0 ? (
              <div className="p-6 text-sm text-brand-ink/65">Sin clases aún.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-brand-cream/40 text-xs uppercase tracking-wide text-brand-ink/60">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tema</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-line">
                  {classes.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 text-brand-ink/80">
                        {new Date(c.startsAt).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">{c.topic ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-brand-ink/70">
                        {c.status === "completed"
                          ? "completada"
                          : c.status === "missed"
                            ? "no asistió"
                            : c.status === "canceled"
                              ? "cancelada"
                              : "programada"}
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
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Progreso, observaciones, vocabulario a reforzar…"
              className="w-full rounded-xl border border-brand-line bg-white p-3 text-sm focus:border-brand-ink focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(rating === n ? null : n)}
                    aria-label={`${n} estrellas`}
                    className="text-brand-ink/40 hover:text-amber-500"
                  >
                    <Star
                      className={`size-4 ${
                        rating != null && n <= rating ? "fill-amber-400 text-amber-400" : ""
                      }`}
                    />
                  </button>
                ))}
              </div>
              <button
                onClick={saveNote}
                disabled={!body.trim()}
                className="rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50"
              >
                Guardar nota
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-3">
              {notes.length === 0 ? (
                <p className="text-xs text-brand-ink/55">Aún no hay notas guardadas.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="rounded-xl bg-brand-cream/40 p-3">
                    <div className="flex items-center justify-between text-[10px] uppercase text-brand-ink/55">
                      <span>
                        {new Date(n.createdAt).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      {n.rating ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-600">
                          {Array.from({ length: n.rating }).map((_, i) => (
                            <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink">{n.body}</p>
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

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-brand-line bg-white px-4 py-2 text-center">
      <div
        className={`text-xl font-bold ${tone === "warn" ? "text-red-700" : "text-brand-ink"}`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-brand-ink/55">{label}</div>
    </div>
  );
}
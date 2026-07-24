import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { learningApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/app/checkpoint/$checkpointId")({
  head: () => ({ meta: [{ title: "Checkpoint — FreaknEnglish" }] }),
  component: CheckpointPage,
});

const LABEL: Record<string, string> = { beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado" };

function CheckpointPage() {
  const { checkpointId } = Route.useParams();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{ score: number; passed: boolean } | null>(null);

  const chkQ = useQuery({ queryKey: ["learning", "checkpoint", checkpointId], queryFn: () => learningApi.checkpoint(checkpointId) });
  const chk = chkQ.data as any;

  const submitM = useMutation({
    mutationFn: () => learningApi.submitCheckpoint(checkpointId, answers),
    onSuccess: (res: any) => {
      setSubmitted({ score: res.score, passed: res.passed });
      qc.invalidateQueries({ queryKey: ["learning", "progress"] });
      qc.invalidateQueries({ queryKey: ["learning", "modules"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo enviar"),
  });

  if (chkQ.isLoading) return <div className="text-sm text-brand-ink/60">Cargando…</div>;
  if (!chk) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/app/learning" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/65 hover:text-brand-ink">
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <p className="text-sm text-brand-ink/65">Checkpoint no encontrado.</p>
      </div>
    );
  }

  const questions: Array<{ id: string; prompt: string; options: string[] }> = Array.isArray(chk.questions) ? chk.questions : [];

  return (
    <div className="flex flex-col gap-6">
      <Link to="/app/learning" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/65 hover:text-brand-ink">
        <ArrowLeft className="size-4" /> Volver
      </Link>

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Examen: {LABEL[chk.fromLevel] ?? chk.fromLevel} → {LABEL[chk.toLevel] ?? chk.toLevel}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Responde las {questions.length} preguntas. Necesitas {chk.passingScore}% para aprobar y subir de nivel.
        </p>
      </header>

      {submitted ? (
        <div className={`rounded-3xl border p-6 md:p-8 ${submitted.passed ? "border-brand-success/30 bg-brand-success/10" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-center gap-3">
            {submitted.passed ? <CheckCircle2 className="size-7 text-brand-success" /> : <XCircle className="size-7 text-red-600" />}
            <h2 className="text-2xl font-bold text-brand-ink">{submitted.passed ? "¡Aprobaste!" : "Casi lo logras"}</h2>
          </div>
          <p className="mt-2 text-sm text-brand-ink/70">
            Obtuviste {submitted.score}%.{" "}
            {submitted.passed ? `Desbloqueaste el nivel ${LABEL[chk.toLevel] ?? chk.toLevel}.` : "Refuerza con los módulos y vuelve a intentarlo cuando quieras."}
          </p>
          <div className="mt-5 flex gap-2">
            <Link to="/app/learning" className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft">Volver a aprendizaje</Link>
            {!submitted.passed ? (
              <button onClick={() => { setSubmitted(null); setAnswers({}); }} className="rounded-full border border-brand-ink/20 px-5 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40">Reintentar</button>
            ) : null}
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {questions.map((q, idx) => (
            <li key={q.id} className="rounded-3xl border border-brand-line bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">Pregunta {idx + 1}</div>
              <p className="mt-1 text-base font-semibold text-brand-ink">{q.prompt}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {q.options.map((opt, oi) => {
                  const selected = answers[q.id] === oi;
                  return (
                    <button key={oi} onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                      className={`rounded-2xl border px-4 py-2.5 text-left text-sm transition ${selected ? "border-brand-ink bg-brand-ink text-white" : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40"}`}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!submitted ? (
        <button onClick={() => submitM.mutate()} disabled={Object.keys(answers).length !== questions.length || submitM.isPending}
          className="self-start rounded-full bg-brand-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink-soft disabled:cursor-not-allowed disabled:opacity-50">
          {submitM.isPending ? "Enviando…" : "Enviar respuestas"}
        </button>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getCheckpoint, recordCheckpointAttempt } from "@/lib/domain/learning";
import type { Checkpoint } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/app/checkpoint/$checkpointId")({
  head: () => ({ meta: [{ title: "Checkpoint — Freakn English" }] }),
  loader: ({ params }): { chk: Checkpoint } => {
    const chk = getCheckpoint(params.checkpointId);
    if (!chk) throw notFound();
    return { chk };
  },
  component: CheckpointPage,
});

function CheckpointPage() {
  const { chk } = Route.useLoaderData() as { chk: Checkpoint };
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{
    score: number;
    passed: boolean;
  } | null>(null);

  if (!user) return null;

  function submit() {
    let score = 0;
    for (const q of chk.questions) {
      if (answers[q.id] === q.correctIndex) score++;
    }
    const passed = score >= chk.passScore;
    recordCheckpointAttempt({
      userId: user!.id,
      checkpointId: chk.id,
      score,
      passed,
    });
    setSubmitted({ score, passed });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/app/learning"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/65 hover:text-brand-ink"
      >
        <ArrowLeft className="size-4" /> Volver
      </Link>

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          {chk.title}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Responde las {chk.questions.length} preguntas. Necesitas {chk.passScore} correctas para
          aprobar.
        </p>
      </header>

      {submitted ? (
        <div
          className={`rounded-3xl border p-6 md:p-8 ${
            submitted.passed
              ? "border-brand-success/30 bg-brand-success/10"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex items-center gap-3">
            {submitted.passed ? (
              <CheckCircle2 className="size-7 text-brand-success" />
            ) : (
              <XCircle className="size-7 text-red-600" />
            )}
            <h2 className="text-2xl font-bold text-brand-ink">
              {submitted.passed ? "¡Aprobaste!" : "Casi lo logras"}
            </h2>
          </div>
          <p className="mt-2 text-sm text-brand-ink/70">
            Obtuviste {submitted.score}/{chk.questions.length}.{" "}
            {submitted.passed
              ? `Desbloqueaste el nivel ${chk.unlocksLevel}.`
              : "Refuerza con los módulos y vuelve a intentarlo cuando quieras."}
          </p>
          <div className="mt-5 flex gap-2">
            <Link
              to="/app/learning"
              className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft"
            >
              Volver a aprendizaje
            </Link>
            {!submitted.passed ? (
              <button
                onClick={() => {
                  setSubmitted(null);
                  setAnswers({});
                }}
                className="rounded-full border border-brand-ink/20 px-5 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40"
              >
                Reintentar
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {chk.questions.map((q, idx) => (
            <li
              key={q.id}
              className="rounded-3xl border border-brand-line bg-white p-5"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
                Pregunta {idx + 1}
              </div>
              <p className="mt-1 text-base font-semibold text-brand-ink">{q.prompt}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {q.options.map((opt, oi) => {
                  const selected = answers[q.id] === oi;
                  return (
                    <button
                      key={oi}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                      className={`rounded-2xl border px-4 py-2.5 text-left text-sm transition ${
                        selected
                          ? "border-brand-ink bg-brand-ink text-white"
                          : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40"
                      }`}
                    >
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
        <button
          onClick={submit}
          disabled={Object.keys(answers).length !== chk.questions.length}
          className="self-start rounded-full bg-brand-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enviar respuestas
        </button>
      ) : null}
    </div>
  );
}
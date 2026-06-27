import { useEffect, useState } from "react";
import { Lock, ShieldCheck, Star } from "lucide-react";
import { submitSatisfaction, type SurveyAnswers } from "@/lib/domain/survey";

/**
 * Encuesta NPS obligatoria cada 30 días para estudiantes.
 *
 * - No se puede cerrar (no hay X ni "después").
 * - 5 preguntas rápidas: NPS + 3 escalas 1–5 + comentario opcional.
 * - Aviso explícito de privacidad: el profesor no ve las respuestas.
 */
export function SatisfactionDialog({
  userId,
  onSubmitted,
}: {
  userId: string;
  onSubmitted: () => void;
}) {
  const [nps, setNps] = useState<number | null>(null);
  const [teacherScore, setTeacherScore] = useState<number | null>(null);
  const [contentScore, setContentScore] = useState<number | null>(null);
  const [platformScore, setPlatformScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while the dialog is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const ready =
    nps != null && teacherScore != null && contentScore != null && platformScore != null;

  function handleSubmit() {
    if (!ready) {
      setError("Por favor responde las 4 preguntas con escala antes de enviar.");
      return;
    }
    const answers: SurveyAnswers = {
      nps: nps!,
      teacherScore: teacherScore!,
      contentScore: contentScore!,
      platformScore: platformScore!,
      comment: comment.trim() || undefined,
    };
    submitSatisfaction({ userId, answers });
    setDone(true);
    setTimeout(onSubmitted, 1100);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="survey-title"
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-brand-ink/60 px-4 py-6 backdrop-blur-sm md:items-center"
    >
      <div className="w-full max-w-xl rounded-3xl border border-brand-line bg-white p-6 shadow-soft md:p-8">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-cream px-3 py-1 text-xs font-medium text-brand-ink">
          <Star className="size-3.5" /> Encuesta de calidad
        </div>
        <h2
          id="survey-title"
          className="mt-3 text-xl font-bold text-brand-ink md:text-2xl"
        >
          Ayúdanos a mejorar tu experiencia
        </h2>
        <p className="mt-1 text-sm text-brand-ink/70">
          Responde estas 5 preguntas rápidas para continuar. Te tomará menos de un minuto.
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-line bg-brand-cream/40 p-3 text-xs text-brand-ink/80">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" />
          <p>
            <strong>Tus respuestas son privadas.</strong> Tu profesor no podrá verlas. Sólo
            las usa el equipo de Freakn' para mejorar la calidad del programa.
          </p>
        </div>

        {done ? (
          <div className="mt-6 rounded-2xl bg-brand-cream/60 p-6 text-center">
            <div className="text-3xl">🙌</div>
            <p className="mt-2 font-semibold text-brand-ink">¡Gracias por tu feedback!</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            <Question
              n={1}
              label="¿Qué tan probable es que recomiendes Freakn' a un amigo?"
              hint="0 = nada probable · 10 = muy probable"
            >
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setNps(i)}
                    aria-pressed={nps === i}
                    aria-label={`Calificación ${i} de 10`}
                    className={`size-9 rounded-lg border text-sm font-semibold transition-all duration-150 ${
                      nps === i
                        ? "scale-105 border-brand-ink bg-brand-ink text-white shadow-soft"
                        : "border-brand-line bg-white text-brand-ink hover:border-brand-ink/40 hover:bg-brand-cream/50"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </Question>

            <Question n={2} label="¿Cómo calificas a tu profesor?">
              <ScaleFive value={teacherScore} onChange={setTeacherScore} />
            </Question>

            <Question n={3} label="¿Qué tan útil ha sido el contenido de aprendizaje?">
              <ScaleFive value={contentScore} onChange={setContentScore} />
            </Question>

            <Question n={4} label="¿Cómo calificas la experiencia con la plataforma?">
              <ScaleFive value={platformScore} onChange={setPlatformScore} />
            </Question>

            <Question
              n={5}
              label="¿Qué podríamos mejorar? (opcional)"
              hint="Comentario libre"
            >
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Cuéntanos cualquier detalle que te ayude…"
                className="w-full rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm text-brand-ink placeholder:text-brand-ink/40 focus:border-brand-ink focus:outline-none"
              />
            </Question>

            {error ? (
              <p className="text-xs font-medium text-red-600">{error}</p>
            ) : null}

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="inline-flex items-center gap-1.5 text-[11px] text-brand-ink/55">
                <Lock className="size-3" /> Tu profesor no verá ninguna respuesta.
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!ready}
                className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                Enviar respuestas
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Question({
  n,
  label,
  hint,
  children,
}: {
  n: number;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
        Pregunta {n} de 5
      </div>
      <div className="mt-1 text-sm font-semibold text-brand-ink">{label}</div>
      {hint ? <div className="text-[11px] text-brand-ink/55">{hint}</div> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ScaleFive({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  const labels = ["Muy mal", "Mal", "Regular", "Bien", "Excelente"];
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {labels.map((l, i) => {
        const n = i + 1;
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={selected}
            className={`rounded-xl border px-1 py-2 text-center transition-all duration-150 ${
              selected
                ? "scale-[1.02] border-brand-ink bg-brand-ink text-white shadow-soft"
                : "border-brand-line bg-white text-brand-ink hover:border-brand-ink/40 hover:bg-brand-cream/50"
            }`}
          >
            <div className="text-sm font-bold">{n}</div>
            <div className="text-[10px] opacity-80">{l}</div>
          </button>
        );
      })}
    </div>
  );
}
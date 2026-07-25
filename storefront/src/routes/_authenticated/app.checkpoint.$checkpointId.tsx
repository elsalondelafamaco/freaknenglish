import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Lock, RefreshCw, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { learningApi, type CheckpointSubmitResult, type CheckpointV2 } from "@/lib/api/endpoints";
import { QuestionBody, TYPE_LABEL, isAnswered, type PublicQuestion } from "@/components/app/checkpoint/QuestionRenderers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/checkpoint/$checkpointId")({
  head: () => ({ meta: [{ title: "Checkpoint — FreaknEnglish" }] }),
  component: CheckpointPage,
});

const LABEL: Record<string, string> = { beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado" };

function CheckpointPage() {
  const { checkpointId } = Route.useParams();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<CheckpointSubmitResult | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const chkQ = useQuery({
    queryKey: ["learning", "checkpoint", checkpointId],
    queryFn: () => learningApi.checkpoint(checkpointId),
  });
  const chk = chkQ.data as CheckpointV2 | undefined;
  const questions: PublicQuestion[] = chk?.questions ?? [];

  const submitM = useMutation({
    mutationFn: () => learningApi.submitCheckpoint(checkpointId, answers),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ["learning"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: any) => {
      // 403 con code = gating (intentos/cooldown): refresca el estado real.
      if (e?.status === 403) {
        toast.error(e?.message ?? "No puedes presentar el checkpoint ahora.");
        qc.invalidateQueries({ queryKey: ["learning", "checkpoint", checkpointId] });
      } else {
        toast.error(e?.message ?? "No pudimos enviar tus respuestas. Revisa tu conexión e intenta de nuevo.");
      }
    },
  });

  // ── Timer (si el checkpoint tiene límite de tiempo) ──────────────────
  const timeLimitMin = chk?.settings?.timeLimitMin ?? null;
  const startedAt = useRef<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!timeLimitMin || result || !chk?.myAttempts?.canAttempt) return;
    if (startedAt.current == null) startedAt.current = Date.now();
    const tick = () => {
      const left = Math.max(0, timeLimitMin * 60 - Math.floor((Date.now() - startedAt.current!) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !submitM.isPending) {
        toast.warning("Se acabó el tiempo — enviamos lo que llevabas.");
        submitM.mutate();
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLimitMin, result, chk?.myAttempts?.canAttempt]);

  const answeredCount = useMemo(
    () => questions.filter((q) => isAnswered(q, answers[q.id])).length,
    [questions, answers],
  );
  const missing = questions.filter((q) => !isAnswered(q, answers[q.id]));

  if (chkQ.isLoading) return <div className="text-sm text-brand-ink/60">Cargando checkpoint…</div>;
  if (chkQ.isError) {
    return (
      <ErrorShell>
        No pudimos cargar el checkpoint. Revisa tu conexión e{" "}
        <button onClick={() => chkQ.refetch()} className="font-semibold underline">intenta de nuevo</button>.
      </ErrorShell>
    );
  }
  if (!chk) return <ErrorShell>Checkpoint no encontrado.</ErrorShell>;

  const state = chk.myAttempts;

  // ── Bloqueado (ya aprobó / sin intentos / cooldown) ──────────────────
  if (!result && !state.canAttempt) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        <BackLink />
        <div className="rounded-3xl border border-brand-line bg-white p-8 text-center shadow-soft">
          {state.blockReason === "already_passed" ? (
            <>
              <Trophy className="mx-auto size-10 text-brand-yellow" />
              <h1 className="mt-3 text-2xl font-bold text-brand-ink">¡Ya aprobaste este checkpoint!</h1>
              <p className="mt-2 text-sm text-brand-ink/65">
                Lo lograste con {state.bestScore}%. Tu nivel {LABEL[chk.toLevel]} ya está desbloqueado.
              </p>
            </>
          ) : state.blockReason === "max_attempts" ? (
            <>
              <Lock className="mx-auto size-10 text-brand-ink/50" />
              <h1 className="mt-3 text-2xl font-bold text-brand-ink">Sin intentos disponibles</h1>
              <p className="mt-2 text-sm text-brand-ink/65">
                Usaste tus {state.attemptCount} intento(s). Habla con tu profesor para revisar el tema y pedirle
                al equipo que te habilite un intento más.
              </p>
            </>
          ) : (
            <>
              <Clock className="mx-auto size-10 text-brand-ink/50" />
              <h1 className="mt-3 text-2xl font-bold text-brand-ink">Aún no puedes reintentarlo</h1>
              <p className="mt-2 text-sm text-brand-ink/65">
                Podrás volver a presentarlo el{" "}
                <strong>{state.retryAt ? new Date(state.retryAt).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" }) : "—"}</strong>.
                Aprovecha para repasar los módulos.
              </p>
            </>
          )}
          {state.lastScore != null ? (
            <p className="mt-3 text-xs text-brand-ink/50">Último intento: {state.lastScore}% · Mejor: {state.bestScore}%</p>
          ) : null}
          <Link to="/app/learning" className="mt-5 inline-block rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft">
            Volver a aprendizaje
          </Link>
        </div>
      </div>
    );
  }

  // ── Resultados ───────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <BackLink />
        <div className={cn(
          "rounded-3xl border p-6 text-center md:p-8",
          result.passed ? "border-brand-success/30 bg-brand-success/10" : "border-amber-200 bg-amber-50",
        )}>
          {result.passed ? <CheckCircle2 className="mx-auto size-12 text-brand-success" /> : <XCircle className="mx-auto size-12 text-amber-600" />}
          <h1 className="mt-3 text-3xl font-bold text-brand-ink">{result.passed ? "¡Aprobaste! 🎉" : "Casi lo logras"}</h1>
          <div className="mt-3 text-5xl font-black text-brand-ink">{result.score}%</div>
          <p className="mt-1 text-sm text-brand-ink/65">
            {result.correct} de {result.total} correctas · necesitabas {result.passingScore}%
          </p>
          <p className="mt-3 text-sm text-brand-ink/75">
            {result.passed
              ? `Desbloqueaste el nivel ${LABEL[chk.toLevel]}. Tus nuevos módulos ya están disponibles.`
              : "Repasa los módulos del nivel y vuelve con toda. Tu profe puede ayudarte con los temas que fallaste."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/app/learning" className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft">
              Ir a aprendizaje
            </Link>
            {!result.passed && result.canRetry ? (
              <button
                onClick={() => { setResult(null); setAnswers({}); startedAt.current = null; chkQ.refetch(); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/20 bg-white px-5 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40"
              >
                <RefreshCw className="size-3.5" /> Reintentar
                {result.remainingAttempts != null ? ` (quedan ${result.remainingAttempts})` : ""}
              </button>
            ) : null}
            {!result.passed && !result.canRetry ? (
              <span className="rounded-full bg-white px-4 py-2 text-xs text-brand-ink/60">
                {result.blockReason === "cooldown" && result.retryAt
                  ? `Próximo intento: ${new Date(result.retryAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`
                  : "Sin intentos restantes"}
              </span>
            ) : null}
          </div>
        </div>

        {/* Corrección por pregunta (según settings.showAnswers) */}
        <div className="rounded-3xl border border-brand-line bg-white">
          <div className="border-b border-brand-line px-5 py-3 text-sm font-bold text-brand-ink">Revisión</div>
          <ul className="divide-y divide-brand-line/60">
            {questions.map((q, i) => {
              const fb = result.feedback.find((f) => f.id === q.id);
              if (!fb) return null;
              return (
                <li key={q.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-2.5">
                    {fb.correct
                      ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-success" />
                      : <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-brand-ink">{i + 1}. {q.prompt}</div>
                      <div className="mt-0.5 text-xs text-brand-ink/65">
                        Tu respuesta: <span className={fb.correct ? "font-semibold text-brand-success" : "font-semibold text-red-600"}>{fb.given}</span>
                      </div>
                      {!fb.correct && result.showAnswers && fb.expected ? (
                        <div className="text-xs text-brand-ink/65">Correcta: <span className="font-semibold">{fb.expected}</span></div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {!result.showAnswers ? (
            <p className="px-5 pb-4 pt-1 text-xs text-brand-ink/50">
              Este checkpoint no muestra las respuestas correctas — repasa con tu profe los temas donde fallaste.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Presentación del examen ──────────────────────────────────────────
  const progressPct = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-28">
      <BackLink />

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Checkpoint: {LABEL[chk.fromLevel]} → {LABEL[chk.toLevel]}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          {questions.length} preguntas · aprueba con {chk.passingScore}%
          {chk.settings.maxAttempts != null ? ` · ${state.remainingAttempts} intento(s) disponibles` : ""}
          {chk.settings.timeLimitMin ? ` · ${chk.settings.timeLimitMin} min` : ""}
        </p>
        {state.attemptCount > 0 ? (
          <p className="mt-1 text-xs text-brand-ink/50">
            Intentos previos: {state.attemptCount} · mejor puntaje: {state.bestScore}%
          </p>
        ) : null}
      </header>

      <ol className="flex flex-col gap-4">
        {questions.map((q, idx) => {
          const missingThis = showMissing && !isAnswered(q, answers[q.id]);
          return (
            <li key={q.id} className={cn(
              "rounded-3xl border bg-white p-5 transition",
              missingThis ? "border-red-300 ring-2 ring-red-100" : "border-brand-line",
            )}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/50">
                  Pregunta {idx + 1} · {TYPE_LABEL[q.type] ?? q.type}
                </span>
                {isAnswered(q, answers[q.id]) ? <CheckCircle2 className="size-4 text-brand-success" /> : null}
              </div>
              <p className="mt-1.5 text-base font-semibold text-brand-ink">{q.prompt}</p>
              {missingThis ? (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertTriangle className="size-3" /> Falta responder esta pregunta
                </p>
              ) : null}
              <div className="mt-3">
                <QuestionBody q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
              </div>
            </li>
          );
        })}
      </ol>

      {/* Barra fija: progreso + tiempo + enviar (desktop y mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-line bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-[11px] font-semibold text-brand-ink/60">
              <span>{answeredCount}/{questions.length} respondidas</span>
              {secondsLeft != null ? (
                <span className={cn("inline-flex items-center gap-1", secondsLeft <= 60 ? "text-red-600" : "")}>
                  <Clock className="size-3" />
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
              ) : null}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-cream">
              <div className="h-full rounded-full bg-brand-ink transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <button
            onClick={() => {
              if (missing.length > 0) {
                setShowMissing(true);
                toast.error(`Te faltan ${missing.length} pregunta(s) por responder.`);
                return;
              }
              submitM.mutate();
            }}
            disabled={submitM.isPending}
            className="shrink-0 rounded-full bg-brand-ink px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-ink-soft disabled:opacity-60"
          >
            {submitM.isPending ? "Enviando…" : "Enviar respuestas"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/app/learning" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/65 hover:text-brand-ink">
      <ArrowLeft className="size-4" /> Volver
    </Link>
  );
}

function ErrorShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="rounded-3xl border border-brand-line bg-white p-6 text-sm text-brand-ink/70">{children}</div>
    </div>
  );
}

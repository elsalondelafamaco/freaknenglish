import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Lock, RefreshCw, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { learningApi, type CheckpointSubmitResult, type CheckpointV2 } from "@/lib/api/endpoints";
import { QuestionBody, TYPE_LABEL, isAnswered, type PublicQuestion } from "@/components/app/checkpoint/QuestionRenderers";
import { cn } from "@/lib/utils";
import {
  Cargando,
  PageHeader,
  SeccionTitulo,
  Titulo,
  btnChip,
  btnPrimaryAuto,
  btnSecondaryAuto,
  cardPlain,
  cardPrimary,
  eyebrow,
  focusRing,
  rowLine,
} from "@/components/app/AppUi";

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
  // El envío por tiempo agotado ocurre UNA sola vez. Antes se guardaba con
  // `submitM.isPending`, pero el intervalo captura el `submitM` del render en
  // que se creó y ese flag nunca se actualizaba: si el envío fallaba (sin red,
  // 500), el timer reenviaba cada segundo — quemando los intentos del examen.
  const autoEnviado = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!timeLimitMin || result || !chk?.myAttempts?.canAttempt) return;
    if (startedAt.current == null) startedAt.current = Date.now();
    let iv: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const left = Math.max(0, timeLimitMin * 60 - Math.floor((Date.now() - startedAt.current!) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !autoEnviado.current) {
        autoEnviado.current = true;
        if (iv) clearInterval(iv);
        toast.warning("Se acabó el tiempo — enviamos lo que llevabas.");
        submitM.mutate();
      }
    };
    tick();
    iv = setInterval(tick, 1000);
    return () => {
      if (iv) clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLimitMin, result, chk?.myAttempts?.canAttempt]);

  const answeredCount = useMemo(
    () => questions.filter((q) => isAnswered(q, answers[q.id])).length,
    [questions, answers],
  );
  const missing = questions.filter((q) => !isAnswered(q, answers[q.id]));

  if (chkQ.isLoading) return <Cargando>Cargando checkpoint…</Cargando>;
  if (chkQ.isError) {
    return (
      <ErrorShell>
        No pudimos cargar el checkpoint. Revisa tu conexión e{" "}
        <button type="button" onClick={() => chkQ.refetch()} className={cn("inline-flex min-h-11 items-center font-bold underline underline-offset-2", focusRing)}>intenta de nuevo</button>.
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
        <div className={cn(cardPrimary, "p-8 text-center")}>
          {state.blockReason === "already_passed" ? (
            <>
              <Trophy className="mx-auto size-10 text-brand-ink" aria-hidden="true" />
              <Titulo className="mt-3 text-[26px] md:text-[30px]">¡Ya aprobaste este checkpoint!</Titulo>
              <p className="mt-2 text-sm text-brand-ink/80">
                Lo lograste con {state.bestScore}%. Tu nivel {LABEL[chk.toLevel]} ya está desbloqueado.
              </p>
            </>
          ) : state.blockReason === "max_attempts" ? (
            <>
              <Lock className="mx-auto size-10 text-brand-ink" aria-hidden="true" />
              <Titulo className="mt-3 text-[26px] md:text-[30px]">Sin intentos disponibles</Titulo>
              <p className="mt-2 text-sm text-brand-ink/80">
                Usaste tus {state.attemptCount} intento(s). Habla con tu profesor para revisar el tema y pedirle
                al equipo que te habilite un intento más.
              </p>
            </>
          ) : (
            <>
              <Clock className="mx-auto size-10 text-brand-ink" aria-hidden="true" />
              <Titulo className="mt-3 text-[26px] md:text-[30px]">Aún no puedes reintentarlo</Titulo>
              <p className="mt-2 text-sm text-brand-ink/80">
                Podrás volver a presentarlo el{" "}
                <strong>{state.retryAt ? new Date(state.retryAt).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" }) : "—"}</strong>.
                Aprovecha para repasar los módulos.
              </p>
            </>
          )}
          {state.lastScore != null ? (
            <p className="mt-3 text-xs text-brand-ink/70">Último intento: {state.lastScore}% · Mejor: {state.bestScore}%</p>
          ) : null}
          <Link to="/app/learning" className={cn(btnPrimaryAuto, "mt-5")}>
            Volver a aprender
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
        <div className={cn(cardPrimary, "p-6 text-center md:p-8", result.passed ? "" : "bg-brand-yellow-soft")}>
          {result.passed ? <CheckCircle2 className="mx-auto size-12 text-brand-ink" aria-hidden="true" /> : <XCircle className="mx-auto size-12 text-brand-ink" aria-hidden="true" />}
          <Titulo className="mt-3" highlight={result.passed ? "Aprobaste" : "lograste"}>{result.passed ? "¡Aprobaste!" : "Casi lo lograste"}</Titulo>
          <div className="mt-3 font-display text-6xl font-extrabold text-brand-ink">{result.score}%</div>
          <p className="mt-1 text-sm text-brand-ink/80">
            {result.correct} de {result.total} correctas · necesitabas {result.passingScore}%
          </p>
          <p className="mt-3 text-sm text-brand-ink/90">
            {result.passed
              ? `Desbloqueaste el nivel ${LABEL[chk.toLevel]}. Tus nuevos módulos ya están disponibles.`
              : "Repasa los módulos del nivel y vuelve con toda. Tu profe puede ayudarte con los temas que fallaste."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/app/learning" className={btnPrimaryAuto}>
              Ir a aprender
            </Link>
            {!result.passed && result.canRetry ? (
              <button
                type="button"
                onClick={() => { setResult(null); setAnswers({}); startedAt.current = null; chkQ.refetch(); }}
                className={btnSecondaryAuto}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" /> Reintentar
                {result.remainingAttempts != null ? ` (quedan ${result.remainingAttempts})` : ""}
              </button>
            ) : null}
            {!result.passed && !result.canRetry ? (
              <span className="inline-flex min-h-11 items-center rounded-full border-2 border-dashed border-brand-ink/60 bg-white px-4 text-xs font-bold text-brand-ink/80">
                {result.blockReason === "cooldown" && result.retryAt
                  ? `Próximo intento: ${new Date(result.retryAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`
                  : "Sin intentos restantes"}
              </span>
            ) : null}
          </div>
        </div>

        {/* Corrección por pregunta (según settings.showAnswers) */}
        <div className={cardPlain}>
          <SeccionTitulo className="px-5 py-3 text-[15px]">Revisión</SeccionTitulo>
          <ul>
            {questions.map((q, i) => {
              const fb = result.feedback.find((f) => f.id === q.id);
              if (!fb) return null;
              return (
                <li key={q.id} className={cn("px-5 py-3.5", rowLine)}>
                  <div className="flex items-start gap-2.5">
                    {fb.correct
                      ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-label="Correcta" />
                      : <XCircle className="mt-0.5 size-4 shrink-0 text-red-700" aria-label="Incorrecta" />}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-brand-ink">{i + 1}. {q.prompt}</div>
                      <div className="mt-0.5 text-xs text-brand-ink/80">
                        Tu respuesta: <span className={fb.correct ? "font-bold text-brand-ink" : "font-bold text-red-700"}>{fb.given}</span>
                      </div>
                      {!fb.correct && result.showAnswers && fb.expected ? (
                        <div className="text-xs text-brand-ink/80">Correcta: <span className="font-bold">{fb.expected}</span></div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {!result.showAnswers ? (
            <p className="px-5 pb-4 pt-1 text-xs text-brand-ink/70">
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

      <PageHeader
        eyebrowText={`${LABEL[chk.fromLevel]} → ${LABEL[chk.toLevel]}`}
        title="Tu checkpoint"
        highlight="checkpoint"
      >
        {questions.length} preguntas · aprueba con {chk.passingScore}%
        {chk.settings.maxAttempts != null ? ` · ${state.remainingAttempts} intento(s) disponibles` : ""}
        {chk.settings.timeLimitMin ? ` · ${chk.settings.timeLimitMin} min` : ""}
        {state.attemptCount > 0 ? (
          <span className="mt-1 block text-xs text-brand-ink/70">
            Intentos previos: {state.attemptCount} · mejor puntaje: {state.bestScore}%
          </span>
        ) : null}
      </PageHeader>

      <ol className="flex flex-col gap-4">
        {questions.map((q, idx) => {
          const missingThis = showMissing && !isAnswered(q, answers[q.id]);
          return (
            <li key={q.id} className={cn(
              "border-2 bg-white p-5 transition",
              missingThis ? "border-red-700" : "border-brand-ink",
            )}>
              <div className="flex items-center justify-between gap-2">
                <span className={eyebrow}>
                  Pregunta {idx + 1} · {TYPE_LABEL[q.type] ?? q.type}
                </span>
                {isAnswered(q, answers[q.id]) ? <CheckCircle2 className="size-4 text-brand-ink" aria-label="Respondida" /> : null}
              </div>
              <p className="mt-1.5 text-base font-bold text-brand-ink">{q.prompt}</p>
              {missingThis ? (
                <p role="alert" className="mt-1 flex items-center gap-1 text-xs font-bold text-red-700">
                  <AlertTriangle className="size-3" aria-hidden="true" /> Falta responder esta pregunta
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
      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-brand-ink bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-[11px] font-bold text-brand-ink/80">
              <span>{answeredCount}/{questions.length} respondidas</span>
              {secondsLeft != null ? (
                <span className={cn("inline-flex items-center gap-1", secondsLeft <= 60 ? "text-red-700" : "")}>
                  <Clock className="size-3" />
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
              ) : null}
            </div>
            <div
              role="progressbar"
              aria-label="Preguntas respondidas"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              className="mt-1 h-2.5 border-[1.5px] border-brand-ink bg-white"
            >
              <div className="h-full bg-brand-ink transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (missing.length > 0) {
                setShowMissing(true);
                toast.error(`Te faltan ${missing.length} pregunta(s) por responder.`);
                return;
              }
              submitM.mutate();
            }}
            disabled={submitM.isPending}
            className={cn(btnPrimaryAuto, "h-12 w-auto shrink-0 px-5 [--hard-x:4px]")}
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
    <Link to="/app/learning" className={cn("inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-ink underline-offset-2 hover:underline", focusRing)}>
      <ArrowLeft className="size-4" aria-hidden="true" /> Volver a aprender
    </Link>
  );
}

function ErrorShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div role="alert" className="border-2 border-red-700 bg-red-50 p-5 text-sm font-semibold text-red-800">{children}</div>
    </div>
  );
}

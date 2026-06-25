import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CHECKPOINTS,
  bestCheckpointAttempt,
  modulesByLevel,
  moduleProgress,
} from "@/lib/domain/learning";
import type { EnglishLevel } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/app/learning")({
  head: () => ({ meta: [{ title: "Aprendizaje — Freakn English" }] }),
  component: LearningIndex,
});

const LEVELS: { id: EnglishLevel; label: string }[] = [
  { id: "beginner", label: "Principiante" },
  { id: "intermediate", label: "Intermedio" },
  { id: "advanced", label: "Avanzado" },
];

function LearningIndex() {
  const { user } = useAuth();
  const [level, setLevel] = useState<EnglishLevel>(user?.level ?? "beginner");
  const mods = useMemo(() => modulesByLevel(level), [level]);

  if (!user) return null;

  // unlock logic
  const unlocked: Record<EnglishLevel, boolean> = {
    beginner: true,
    intermediate: !!bestCheckpointAttempt(user.id, "chk_beginner")?.passed,
    advanced: !!bestCheckpointAttempt(user.id, "chk_intermediate")?.passed,
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Aprendizaje
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Módulos curados por nivel. Completa todas las lecciones y supera el checkpoint para
          desbloquear el siguiente nivel.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => {
          const isUnlocked = unlocked[l.id];
          const active = level === l.id;
          return (
            <button
              key={l.id}
              disabled={!isUnlocked}
              onClick={() => setLevel(l.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-brand-ink text-white"
                  : isUnlocked
                    ? "border border-brand-line bg-white text-brand-ink hover:bg-brand-cream/50"
                    : "border border-brand-line bg-brand-cream/40 text-brand-ink/40"
              }`}
            >
              {!isUnlocked ? <Lock className="size-3.5" /> : null}
              {l.label}
            </button>
          );
        })}
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {mods.map((m) => {
          const prog = moduleProgress(user.id, m);
          return (
            <Link
              key={m.id}
              to="/app/learning/$moduleId"
              params={{ moduleId: m.id }}
              className="group rounded-3xl border border-brand-line bg-white p-6 transition hover:border-brand-ink/30 hover:shadow-soft"
            >
              <div className="flex items-start justify-between">
                <div className="text-3xl">{m.coverEmoji}</div>
                {prog.complete ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/15 px-2.5 py-1 text-[11px] font-medium text-brand-success">
                    <CheckCircle2 className="size-3.5" /> Completo
                  </span>
                ) : (
                  <span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-medium text-brand-ink/65">
                    {prog.done}/{prog.total} lecciones
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-lg font-bold text-brand-ink">{m.title}</h3>
              <p className="mt-1 text-sm text-brand-ink/65">{m.summary}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-brand-cream">
                <div
                  className="h-full rounded-full bg-brand-ink transition-all"
                  style={{ width: `${prog.pct}%` }}
                />
              </div>
            </Link>
          );
        })}
      </section>

      <CheckpointBanner level={level} userId={user.id} />
    </div>
  );
}

function CheckpointBanner({
  level,
  userId,
}: {
  level: EnglishLevel;
  userId: string;
}) {
  const chk = CHECKPOINTS.find((c) => c.level === level);
  if (!chk) return null;
  const best = bestCheckpointAttempt(userId, chk.id);
  const passed = !!best?.passed;

  return (
    <section className="rounded-3xl border border-brand-line bg-gradient-to-br from-brand-cream to-brand-cream-soft p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-brand-ink">
            <Sparkles className="size-3.5" /> Checkpoint de nivel
          </div>
          <h3 className="mt-3 text-xl font-bold tracking-tight text-brand-ink">{chk.title}</h3>
          <p className="mt-1 text-sm text-brand-ink/70">
            {passed
              ? `¡Aprobado con ${best!.score}/${chk.questions.length}!`
              : best
                ? `Mejor intento: ${best.score}/${chk.questions.length}. Necesitas ${chk.passScore}.`
                : `Responde ${chk.questions.length} preguntas. Necesitas ${chk.passScore} correctas.`}
          </p>
        </div>
        <Link
          to="/app/checkpoint/$checkpointId"
          params={{ checkpointId: chk.id }}
          className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
        >
          {passed ? "Volver a intentar" : "Hacer checkpoint"}
        </Link>
      </div>
    </section>
  );
}
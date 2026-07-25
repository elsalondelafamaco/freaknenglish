import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { learningApi } from "@/lib/api/endpoints";
import type { EnglishLevel, LearningModule } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/app/learning/")({
  head: () => ({ meta: [{ title: "Aprendizaje — FreaknEnglish" }] }),
  component: LearningIndex,
});

const LEVELS: { id: EnglishLevel; label: string }[] = [
  { id: "beginner", label: "Principiante" },
  { id: "intermediate", label: "Intermedio" },
  { id: "advanced", label: "Avanzado" },
];
const ORDER: Record<EnglishLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

function LearningIndex() {
  const { user } = useAuth();
  const [level, setLevel] = useState<EnglishLevel>(user?.level ?? "beginner");
  const modsQ = useQuery({
    queryKey: ["learning", "modules", level],
    queryFn: () => learningApi.modules(level),
  });
  const progressQ = useQuery({ queryKey: ["learning", "progress"], queryFn: () => learningApi.progress() });
  const mods = (modsQ.data ?? []) as LearningModule[];
  const doneIds = new Set(progressQ.data?.completedLessonIds ?? []);

  if (!user) return null;

  const userLevel = (user.level ?? "beginner") as EnglishLevel;
  const unlocked: Record<EnglishLevel, boolean> = {
    beginner: true,
    intermediate: ORDER[userLevel] >= 1,
    advanced: ORDER[userLevel] >= 2,
  };

  const moduleProgress = (m: LearningModule) => {
    const lessons = (m as any).lessons ?? [];
    const total = lessons.length || 1;
    const done = lessons.filter((l: any) => doneIds.has(l.id)).length;
    return { done, total: lessons.length, pct: Math.round((done / total) * 100), complete: lessons.length > 0 && done === lessons.length };
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Aprendizaje</h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Módulos curados por nivel. Completa todas las lecciones y supera el checkpoint para desbloquear el siguiente nivel.
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
                active ? "bg-brand-ink text-white" : isUnlocked ? "border border-brand-line bg-white text-brand-ink hover:bg-brand-cream/50" : "border border-brand-line bg-brand-cream/40 text-brand-ink/40"
              }`}
            >
              {!isUnlocked ? <Lock className="size-3.5" /> : null}
              {l.label}
            </button>
          );
        })}
      </div>

      {modsQ.isLoading ? (
        <p className="text-sm text-brand-ink/60">Cargando módulos…</p>
      ) : mods.length === 0 ? (
        <p className="text-sm text-brand-ink/60">Aún no hay módulos publicados para este nivel.</p>
      ) : null}

      {/* Los módulos se agrupan por unidad. Los que no tienen unidad asignada
          (contenido antiguo o creado a mano en el CMS) van en un grupo final. */}
      {groupByUnit(mods).map(([unit, group]) => (
        <section key={unit ?? "sin-unidad"} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-ink/70">
              {unit != null ? `Unidad ${unit}` : "Otros módulos"}
            </h2>
            <span className="text-xs text-brand-ink/45">{group.length} módulos</span>
            <span className="h-px flex-1 bg-brand-line" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {group.map((m: any) => {
              const prog = moduleProgress(m);
              const isCheckpoint = /checkpoint/i.test(m.id);
              return (
                <Link
                  key={m.id}
                  to="/app/learning/$moduleId"
                  params={{ moduleId: m.id }}
                  className={`group rounded-3xl border p-6 transition hover:shadow-soft ${
                    isCheckpoint
                      ? "border-brand-yellow bg-brand-yellow/10 hover:border-brand-ink/30"
                      : "border-brand-line bg-white hover:border-brand-ink/30"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{m.coverEmoji ?? (isCheckpoint ? "🏁" : "📘")}</div>
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
                  <p className="mt-1 text-sm text-brand-ink/65">{m.summary ?? m.description}</p>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-brand-cream">
                    <div className="h-full rounded-full bg-brand-ink transition-all" style={{ width: `${prog.pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <CheckpointBanner level={level} />
    </div>
  );
}

/** Agrupa módulos por `unit` conservando el orden de `position`. */
function groupByUnit(mods: any[]): Array<[number | null, any[]]> {
  const map = new Map<number | null, any[]>();
  for (const m of mods) {
    const u = typeof m.unit === "number" ? m.unit : null;
    if (!map.has(u)) map.set(u, []);
    map.get(u)!.push(m);
  }
  return [...map.entries()].sort((a, b) => {
    if (a[0] == null) return 1; // "Otros módulos" al final
    if (b[0] == null) return -1;
    return a[0] - b[0];
  });
}

function CheckpointBanner({ level }: { level: EnglishLevel }) {
  const chkQ = useQuery({ queryKey: ["learning", "level-checkpoint", level], queryFn: () => learningApi.levelCheckpoint(level) });
  const progressQ = useQuery({ queryKey: ["learning", "progress"], queryFn: () => learningApi.progress() });
  const chk = chkQ.data as any;
  if (chkQ.isLoading || !chk) return null;
  const qCount = Array.isArray(chk.questions) ? chk.questions.length : 0;
  const attempts = (progressQ.data?.attempts ?? []).filter((a: any) => a.checkpointId === chk.id);
  const best = attempts.sort((a: any, b: any) => b.score - a.score)[0];
  const passed = !!best?.passed;

  return (
    <section className="rounded-3xl border border-brand-line bg-gradient-to-br from-brand-cream to-brand-cream-soft p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-brand-ink">
            <Sparkles className="size-3.5" /> Checkpoint de nivel
          </div>
          <h3 className="mt-3 text-xl font-bold tracking-tight text-brand-ink">{chk.title ?? "Examen de nivel"}</h3>
          <p className="mt-1 text-sm text-brand-ink/70">
            {passed
              ? `¡Aprobado con ${best.score}%!`
              : best
                ? `Mejor intento: ${best.score}%. Necesitas ${chk.passingScore}%.`
                : `Responde ${qCount} preguntas. Necesitas ${chk.passingScore}% para aprobar.`}
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

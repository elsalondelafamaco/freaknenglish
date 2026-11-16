import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { learningApi } from "@/lib/api/endpoints";
import type { EnglishLevel, LearningModule } from "@/lib/domain/types";
import { progresoDelModulo } from "@/lib/learning/progreso";
import { cn } from "@/lib/utils";
import {
  Cargando,
  EstadoError,
  PageHeader,
  SeccionTitulo,
  Vacio,
  btnPrimaryAuto,
  cardPlain,
  cardPrimary,
  eyebrow,
  focusRing,
  rowLine,
} from "@/components/app/AppUi";

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

  const moduleProgress = (m: LearningModule) => progresoDelModulo((m as any).lessons ?? [], doneIds);

  // Avance del nivel y módulo por el que seguir (el primero abierto con algo pendiente).
  const totales = mods.reduce(
    (acc, m) => {
      const p = moduleProgress(m);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );
  const numeroDe = new Map(mods.map((m, i) => [m.id, i + 1]));
  const actual = mods.find((m: any) => !m.locked && !moduleProgress(m).complete) as any | undefined;
  const levelLabel = LEVELS.find((l) => l.id === level)?.label ?? level;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrowText={
          modsQ.isLoading || totales.total === 0
            ? `Nivel ${levelLabel.toLowerCase()}`
            : `Nivel ${levelLabel.toLowerCase()} · ${totales.done} de ${totales.total} ${totales.total === 1 ? "actividad" : "actividades"}`
        }
        title="Sigue aprendiendo"
        highlight="aprendiendo"
      >
        Módulos curados por nivel. Tu profe va habilitando el contenido a medida que avanzas.
      </PageHeader>

      <div role="group" aria-label="Nivel" className="flex flex-wrap gap-2">
        {LEVELS.map((l) => {
          const isUnlocked = unlocked[l.id];
          const active = level === l.id;
          return (
            <button
              key={l.id}
              type="button"
              disabled={!isUnlocked}
              aria-pressed={active}
              onClick={() => setLevel(l.id)}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition-colors",
                active
                  ? "border-brand-ink bg-brand-ink text-brand-cream dark:text-white"
                  : isUnlocked
                    ? "border-brand-ink bg-white text-brand-ink hover:bg-brand-cream"
                    : "cursor-not-allowed border-dashed border-brand-ink/50 bg-transparent text-brand-ink/70",
                focusRing,
              )}
            >
              {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {!isUnlocked ? <Lock className="size-3.5" aria-hidden="true" /> : null}
              {l.label}
              {!isUnlocked ? <span className="sr-only"> (bloqueado)</span> : null}
            </button>
          );
        })}
      </div>

      {modsQ.isLoading ? (
        <Cargando>Cargando módulos…</Cargando>
      ) : modsQ.isError ? (
        <EstadoError onRetry={() => void modsQ.refetch()}>
          No pudimos cargar los módulos. Revisa tu conexión e inténtalo de nuevo.
        </EstadoError>
      ) : mods.length === 0 ? (
        <Vacio titulo="Aún no hay módulos">Todavía no hay módulos publicados para este nivel.</Vacio>
      ) : null}

      {/* Seguir donde ibas */}
      {actual ? (
        <Link
          to="/app/learning/$moduleId"
          params={{ moduleId: actual.id }}
          className={cn(cardPrimary, "block p-4 no-underline press-hard md:p-5", focusRing)}
        >
          {(() => {
            const p = moduleProgress(actual);
            return (
              <>
                <p className={eyebrow}>
                  {actual.unit != null ? `Unidad ${actual.unit} · ` : ""}Módulo {numeroDe.get(actual.id)} · {p.done} de {p.total} {p.total === 1 ? "actividad" : "actividades"}
                </p>
                <p className="mt-1.5 font-display text-[24px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-brand-ink">
                  {actual.title}
                </p>
                <div
                  role="progressbar"
                  aria-label={`Avance de ${actual.title}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.pct}
                  className="mt-3 h-2.5 border-[1.5px] border-brand-ink bg-white"
                >
                  <div className="h-full bg-brand-ink" style={{ width: `${p.pct}%` }} />
                </div>
                <span className="mt-3 inline-flex items-center gap-1.5 font-display text-[13px] font-extrabold uppercase tracking-[0.04em] text-brand-ink">
                  {p.done > 0 ? "Continuar módulo" : "Empezar módulo"} <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              </>
            );
          })()}
        </Link>
      ) : null}

      {/* Los módulos se agrupan por unidad. Los que no tienen unidad asignada
          (contenido antiguo o creado a mano en el CMS) van en un grupo final. */}
      {groupByUnit(mods).map(([unit, group]) => (
        <section
          key={unit ?? "sin-unidad"}
          aria-labelledby={`unidad-${unit ?? "otros"}`}
          className={cardPlain}
        >
          <div className="flex items-baseline justify-between gap-3 px-4 py-3">
            <SeccionTitulo id={`unidad-${unit ?? "otros"}`} className="text-[15px]">
              {unit != null ? `Unidad ${unit}` : "Otros módulos"}
            </SeccionTitulo>
            <span className="text-xs font-semibold text-brand-ink/70">{group.length} {group.length === 1 ? "módulo" : "módulos"}</span>
          </div>
          <ul>
            {group.map((m: any) => {
              const prog = moduleProgress(m);
              const isCheckpoint = /checkpoint/i.test(m.id);
              // El backend marca el módulo bloqueado cuando TODAS sus lecciones
              // lo están. Antes esto se anulaba si alguna lección estaba en
              // "espera_desbloqueo" — y como TODA lección sin habilitar tiene
              // ese motivo, ningún módulo se veía bloqueado en el listado
              // aunque al entrar sí lo estuviera.
              const locked = !!m.locked;
              const esActual = actual?.id === m.id;

              const contenido = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-[34px] place-items-center rounded-full border-2 font-display text-[13px] font-extrabold",
                      locked
                        ? "border-dashed border-brand-ink/60 text-brand-ink/70"
                        : prog.complete
                          ? "border-brand-ink bg-brand-ink text-brand-cream dark:text-white"
                          : esActual
                            ? "border-brand-ink bg-brand-yellow text-brand-ink"
                            : "border-brand-ink text-brand-ink",
                    )}
                  >
                    {!locked && prog.complete ? <Check className="size-4" /> : isCheckpoint ? "CP" : numeroDe.get(m.id)}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-[15px]", esActual ? "font-extrabold" : "font-bold", locked ? "text-brand-ink/70" : "text-brand-ink")}>
                      {m.title}
                    </span>
                    {/* Genérico a propósito: al estudiante no le sirve saber si
                        lo frena un checkpoint o una habilitación pendiente. */}
                    <span className="mt-0.5 block text-xs font-medium text-brand-ink/70">
                      {locked ? "Tu profe habilita el contenido a medida que avanzas." : (m.summary ?? m.description)}
                    </span>
                  </span>
                  <span className={cn("flex items-center gap-1 text-right text-xs", esActual ? "font-bold text-brand-ink" : "text-brand-ink/70")}>
                    {locked ? (
                      <>
                        <Lock className="size-3.5" aria-hidden="true" /> Bloqueado
                      </>
                    ) : prog.complete ? (
                      "Completo"
                    ) : (
                      `${prog.done} de ${prog.total} ${prog.total === 1 ? "actividad" : "actividades"}`
                    )}
                  </span>
                </>
              );

              const clase = cn(
                "grid min-h-14 grid-cols-[42px_1fr_auto] items-center gap-2.5 px-3.5 py-2.5 text-brand-ink no-underline",
                rowLine,
                esActual ? "bg-brand-yellow-soft" : "",
              );

              // Un módulo bloqueado no navega: se queda como fila apagada.
              return (
                <li key={m.id}>
                  {locked ? (
                    <div className={clase} aria-disabled="true" title="Tu profe habilita el contenido a medida que avanzas">
                      {contenido}
                    </div>
                  ) : (
                    <Link
                      to="/app/learning/$moduleId"
                      params={{ moduleId: m.id }}
                      aria-current={esActual ? "step" : undefined}
                      className={cn(clase, "hover:bg-brand-cream", focusRing)}
                    >
                      {contenido}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
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
    <section aria-labelledby="checkpoint-nivel" className={cn(cardPlain, "p-5 md:p-6")}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md">
          <p className={eyebrow}>Checkpoint de nivel</p>
          <h2 id="checkpoint-nivel" className="mt-1.5 font-display text-[22px] font-extrabold uppercase leading-[1.05] tracking-[-0.01em] text-brand-ink">
            {chk.title ?? "Examen de nivel"}
          </h2>
          <p className="mt-2 text-sm text-brand-ink/80">
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
          className={cn(btnPrimaryAuto, "md:w-auto")}
        >
          {passed ? "Volver a intentar" : "Hacer checkpoint"}
        </Link>
      </div>
    </section>
  );
}

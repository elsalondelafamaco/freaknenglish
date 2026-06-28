import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  FileCode,
  PlayCircle,
  Presentation,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getModule,
  isLessonComplete,
  markLessonComplete,
  moduleProgress,
  unmarkLesson,
} from "@/lib/domain/learning";
import type { LearningModule, Lesson, LessonKind } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/app/learning/$moduleId")({
  head: ({ params }) => ({
    meta: [{ title: `Módulo ${params.moduleId} — Freakn English` }],
  }),
  loader: ({ params }): { mod: LearningModule } => {
    const mod = getModule(params.moduleId);
    if (!mod) throw notFound();
    return { mod };
  },
  component: ModuleDetail,
});

const KIND_ICON: Record<LessonKind, typeof PlayCircle> = {
  video: PlayCircle,
  pdf: FileText,
  slides: Presentation,
  download: Download,
  html: FileCode,
};

function ModuleDetail() {
  const { mod } = Route.useLoaderData() as { mod: LearningModule };
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string>(mod.lessons[0]?.id ?? "");
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  if (!user) return null;

  const active: Lesson | undefined = mod.lessons.find((l) => l.id === activeId);
  const prog = moduleProgress(user.id, mod);
  // re-read on tick (no-op, but forces use)
  void tick;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/app/learning"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/65 hover:text-brand-ink"
      >
        <ArrowLeft className="size-4" /> Volver a aprendizaje
      </Link>

      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-4xl">{mod.coverEmoji}</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
            {mod.title}
          </h1>
          <p className="mt-1 max-w-xl text-[15px] text-brand-ink/65">{mod.summary}</p>
        </div>
        <div className="rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-brand-ink/55">Progreso</div>
          <div className="text-xl font-bold text-brand-ink">{prog.pct}%</div>
          <div className="text-xs text-brand-ink/55">
            {prog.done}/{prog.total} lecciones
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="flex flex-col gap-4 rounded-3xl border border-brand-line bg-white p-5">
          {active ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-brand-ink">{active.title}</h2>
                <span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-brand-ink/65">
                  {active.kind} · {active.estMinutes} min
                </span>
              </div>
              <LessonViewer lesson={active} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => {
                    if (isLessonComplete(user.id, active.id)) unmarkLesson(user.id, active.id);
                    else markLessonComplete(user.id, active.id);
                    refresh();
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold ${
                    isLessonComplete(user.id, active.id)
                      ? "bg-brand-success/15 text-brand-success"
                      : "bg-brand-ink text-white hover:bg-brand-ink-soft"
                  }`}
                >
                  <CheckCircle2 className="size-4" />
                  {isLessonComplete(user.id, active.id)
                    ? "Lección completada"
                    : "Marcar como completada"}
                </button>
                {active.kind === "download" || active.kind === "pdf" ? (
                  <a
                    href={active.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/70 hover:text-brand-ink"
                  >
                    <Download className="size-4" /> Descargar recurso
                  </a>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-brand-ink/55">Este módulo no tiene lecciones aún.</p>
          )}
        </article>

        <aside className="rounded-3xl border border-brand-line bg-white p-3">
          <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-brand-ink/55">
            Lecciones
          </div>
          <ul className="flex flex-col">
            {mod.lessons.map((l) => {
              const Icon = KIND_ICON[l.kind];
              const done = isLessonComplete(user.id, l.id);
              const isActive = l.id === activeId;
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setActiveId(l.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                      isActive
                        ? "bg-brand-cream text-brand-ink"
                        : "text-brand-ink/75 hover:bg-brand-cream/50"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="size-4 text-brand-success" />
                    ) : (
                      <Circle className="size-4 text-brand-ink/35" />
                    )}
                    <Icon className="size-4 text-brand-ink/60" />
                    <span className="flex-1 font-medium">{l.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function LessonViewer({ lesson }: { lesson: Lesson }) {
  if (lesson.kind === "video" || lesson.kind === "slides") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-brand-line bg-brand-ink/5">
        <iframe
          src={lesson.url}
          title={lesson.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (lesson.kind === "pdf") {
    return (
      <div className="rounded-2xl border border-brand-line bg-brand-cream/40 p-8 text-center">
        <FileText className="mx-auto size-10 text-brand-ink/60" />
        <p className="mt-3 text-sm text-brand-ink/70">
          Documento PDF listo para leer o descargar.
        </p>
        <a
          href={lesson.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft"
        >
          Abrir PDF
        </a>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-brand-line bg-brand-cream/40 p-8 text-center">
      <Download className="mx-auto size-10 text-brand-ink/60" />
      <p className="mt-3 text-sm text-brand-ink/70">
        Recurso descargable. Úsalo offline para practicar entre clases.
      </p>
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { Eye, FileText, FilmIcon, Presentation, Download } from "lucide-react";
import { CHECKPOINTS, MODULES } from "@/lib/domain/learning";
import type { EnglishLevel, LessonKind } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/admin/content")({
  head: () => ({ meta: [{ title: "Contenido — Admin Freakn'" }] }),
  component: AdminCMS,
});

const LEVELS: EnglishLevel[] = ["beginner", "intermediate", "advanced"];

function AdminCMS() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-ink">Contenido</h2>
        <p className="mt-1 text-sm text-brand-ink/65">
          Catálogo de módulos, lecciones y checkpoints organizados por nivel.
        </p>
      </div>

      {LEVELS.map((level) => {
        const mods = MODULES.filter((m) => m.level === level).sort(
          (a, b) => a.order - b.order,
        );
        return (
          <section key={level}>
            <h2 className="text-lg font-semibold capitalize text-brand-ink">
              Nivel {level}{" "}
              <span className="text-xs font-normal text-brand-ink/55">
                · {mods.length} módulo(s)
              </span>
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {mods.map((m) => (
                <div key={m.id} className="rounded-2xl border border-brand-line bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{m.coverEmoji}</span>
                      <div>
                        <div className="font-semibold text-brand-ink">{m.title}</div>
                        <div className="text-xs text-brand-ink/55">
                          {m.lessons.length} lecciones
                          {m.checkpointId ? " · checkpoint" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-brand-ink/65">{m.summary}</p>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {m.lessons.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between rounded-lg bg-brand-cream/40 px-3 py-1.5 text-xs"
                      >
                        <span className="inline-flex items-center gap-1.5 text-brand-ink">
                          <KindIcon kind={l.kind} /> {l.title}
                        </span>
                        <span className="text-brand-ink/50">{l.estMinutes}min</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <h2 className="text-lg font-semibold text-brand-ink">Checkpoints</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {CHECKPOINTS.map((c) => (
            <div key={c.id} className="rounded-2xl border border-brand-line bg-white p-4">
              <div className="font-semibold text-brand-ink">{c.title}</div>
              <div className="mt-1 text-xs text-brand-ink/55">
                Nivel actual: <span className="capitalize">{c.level}</span> · Desbloquea:{" "}
                <span className="capitalize">{c.unlocksLevel}</span>
              </div>
              <div className="mt-2 text-xs text-brand-ink/70">
                {c.questions.length} preguntas · aprueba con {c.passScore}+
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KindIcon({ kind }: { kind: LessonKind }) {
  if (kind === "video") return <FilmIcon className="size-3.5 text-brand-ink/60" />;
  if (kind === "pdf") return <FileText className="size-3.5 text-brand-ink/60" />;
  if (kind === "slides") return <Presentation className="size-3.5 text-brand-ink/60" />;
  if (kind === "download") return <Download className="size-3.5 text-brand-ink/60" />;
  return <Eye className="size-3.5 text-brand-ink/60" />;
}
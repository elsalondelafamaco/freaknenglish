import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteLesson,
  deleteModule,
  listAllCheckpoints,
  listAllModules,
  saveLesson,
  saveModule,
} from "@/lib/domain/learning";
import type { EnglishLevel, LearningModule, Lesson, LessonKind } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/admin/content")({
  head: () => ({ meta: [{ title: "CMS — Admin" }] }),
  component: AdminContent,
});

const LEVELS: { id: EnglishLevel; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const LESSON_KINDS: LessonKind[] = ["video", "pdf", "slides", "download", "html"];

function AdminContent() {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingModule, setEditingModule] = useState<Partial<LearningModule> | null>(null);
  const [editingLesson, setEditingLesson] = useState<
    | { moduleId: string; lesson?: Lesson }
    | null
  >(null);

  const modules = useMemo(() => listAllModules(), [tick]);
  const checkpoints = useMemo(() => listAllCheckpoints(), [tick]);
  const bump = () => setTick((t) => t + 1);

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onDeleteModule(id: string) {
    if (!confirm("¿Eliminar módulo y todas sus lecciones?")) return;
    deleteModule(id);
    bump();
  }

  function onDeleteLesson(moduleId: string, lessonId: string) {
    if (!confirm("¿Eliminar lección?")) return;
    deleteLesson(moduleId, lessonId);
    bump();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-ink">Catálogo de aprendizaje</h2>
          <p className="text-xs text-brand-ink/55">
            Crea módulos por nivel y carga lecciones (video, PDF, slides, HTML
            enriquecido o archivos descargables).
          </p>
        </div>
        <button
          onClick={() =>
            setEditingModule({ level: "beginner", order: modules.length + 1 })
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
        >
          <Plus className="size-3.5" /> Crear módulo
        </button>
      </div>

      {LEVELS.map((lvl) => {
        const mods = modules.filter((m) => m.level === lvl.id);
        return (
          <section key={lvl.id} className="rounded-2xl border border-brand-line bg-white p-5">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-ink">{lvl.label}</h3>
              <span className="text-xs text-brand-ink/55">{mods.length} módulo(s)</span>
            </header>
            {mods.length === 0 ? (
              <p className="text-xs text-brand-ink/55">Sin módulos en este nivel.</p>
            ) : (
              <ul className="space-y-2">
                {mods.map((m) => {
                  const open = expanded.has(m.id);
                  return (
                    <li
                      key={m.id}
                      className="rounded-xl border border-brand-line bg-brand-cream/20"
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button onClick={() => toggle(m.id)} className="text-brand-ink/60">
                          {open ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                        <span className="text-xl">{m.coverEmoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-brand-ink">
                            {m.title}
                          </div>
                          <div className="truncate text-xs text-brand-ink/55">{m.summary}</div>
                        </div>
                        <span className="text-xs text-brand-ink/55">
                          {m.lessons.length} lecciones
                        </span>
                        <button
                          onClick={() => setEditingModule(m)}
                          className="rounded-full p-1.5 text-brand-ink/60 hover:bg-white hover:text-brand-ink"
                          aria-label="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteModule(m.id)}
                          className="rounded-full p-1.5 text-red-600 hover:bg-red-50"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {open ? (
                        <div className="border-t border-brand-line bg-white/60 px-3 py-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/55">
                              Lecciones
                            </span>
                            <button
                              onClick={() =>
                                setEditingLesson({ moduleId: m.id, lesson: undefined })
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-ink/80 hover:-translate-y-0.5"
                            >
                              <Plus className="size-3" /> Añadir lección
                            </button>
                          </div>
                          {m.lessons.length === 0 ? (
                            <p className="text-xs text-brand-ink/55">Sin lecciones.</p>
                          ) : (
                            <ul className="divide-y divide-brand-line/60 text-sm">
                              {m.lessons.map((l) => (
                                <li
                                  key={l.id}
                                  className="flex items-center gap-2 py-2"
                                >
                                  <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-ink/70">
                                    {l.kind}
                                  </span>
                                  <div className="min-w-0 flex-1 truncate text-brand-ink/85">
                                    {l.order}. {l.title}
                                  </div>
                                  <span className="text-xs text-brand-ink/55">
                                    {l.estMinutes ?? 0} min
                                  </span>
                                  <button
                                    onClick={() =>
                                      setEditingLesson({ moduleId: m.id, lesson: l })
                                    }
                                    className="rounded-full p-1.5 text-brand-ink/60 hover:bg-brand-cream/50 hover:text-brand-ink"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => onDeleteLesson(m.id, l.id)}
                                    className="rounded-full p-1.5 text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <section className="rounded-2xl border border-brand-line bg-white p-5">
        <h3 className="text-sm font-semibold text-brand-ink">Checkpoints de nivel</h3>
        <ul className="mt-3 space-y-1 text-sm text-brand-ink/75">
          {checkpoints.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>
                <strong className="capitalize">{c.level}</strong> → {c.title}
              </span>
              <span className="text-xs text-brand-ink/55">
                {c.questions.length} preguntas · pasa con {c.passScore}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {editingModule ? (
        <ModuleDialog
          initial={editingModule}
          onClose={() => setEditingModule(null)}
          onSaved={() => {
            setEditingModule(null);
            bump();
          }}
        />
      ) : null}
      {editingLesson ? (
        <LessonDialog
          moduleId={editingLesson.moduleId}
          lesson={editingLesson.lesson}
          onClose={() => setEditingLesson(null)}
          onSaved={() => {
            setEditingLesson(null);
            bump();
          }}
        />
      ) : null}
    </div>
  );
}

function ModuleDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<LearningModule>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [level, setLevel] = useState<EnglishLevel>(initial.level ?? "beginner");
  const [order, setOrder] = useState(initial.order ?? 1);
  const [emoji, setEmoji] = useState(initial.coverEmoji ?? "📘");
  const [checkpointId, setCheckpointId] = useState(initial.checkpointId ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveModule({
      id: initial.id,
      title,
      summary,
      level,
      order,
      coverEmoji: emoji,
      checkpointId: checkpointId || undefined,
    });
    onSaved();
  }

  return (
    <Modal title={initial.id ? "Editar módulo" : "Crear módulo"} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <Field label="Título">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="input"
          />
        </Field>
        <Field label="Resumen">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="input"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Nivel">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as EnglishLevel)}
              className="input"
            >
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orden">
            <input
              type="number"
              min={1}
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Emoji">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="input" />
          </Field>
        </div>
        <Field label="Checkpoint asociado (opcional)">
          <input
            value={checkpointId}
            onChange={(e) => setCheckpointId(e.target.value)}
            placeholder="ej: chk_beginner"
            className="input"
          />
        </Field>
        <Actions onClose={onClose} />
      </form>
    </Modal>
  );
}

function LessonDialog({
  moduleId,
  lesson,
  onClose,
  onSaved,
}: {
  moduleId: string;
  lesson?: Lesson;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [kind, setKind] = useState<LessonKind>((lesson?.kind ?? "video") as LessonKind);
  const [url, setUrl] = useState(lesson?.url ?? "");
  const [order, setOrder] = useState(lesson?.order ?? 1);
  const [estMinutes, setEstMinutes] = useState(lesson?.estMinutes ?? 5);
  const [contentHtml, setContentHtml] = useState(lesson?.contentHtml ?? "");
  const [notes, setNotes] = useState(lesson?.notes ?? "");
  const [attachments, setAttachments] = useState<
    { name: string; url: string; size?: number }[]
  >(lesson?.attachments ?? []);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // Mock: usamos data URLs para previsualización. En producción, el storefront
    // pide una signed URL a `POST /admin/uploads/sign` y sube el archivo a MinIO.
    const next: { name: string; url: string; size?: number }[] = [];
    for (const f of files) {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(f);
      });
      next.push({ name: f.name, url: dataUrl, size: f.size });
    }
    setAttachments((a) => [...a, ...next]);
    e.target.value = "";
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveLesson({
      id: lesson?.id,
      moduleId,
      title,
      kind,
      url: url || undefined,
      order,
      estMinutes,
      contentHtml: kind === "html" ? contentHtml : undefined,
      notes: notes || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    onSaved();
  }

  return (
    <Modal title={lesson ? "Editar lección" : "Nueva lección"} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipo">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as LessonKind)}
              className="input capitalize"
            >
              {LESSON_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orden">
            <input
              type="number"
              min={1}
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Duración (min)">
            <input
              type="number"
              min={0}
              value={estMinutes}
              onChange={(e) => setEstMinutes(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>
        {kind === "html" ? (
          <Field label="Contenido HTML">
            <textarea
              value={contentHtml}
              onChange={(e) => setContentHtml(e.target.value)}
              rows={8}
              placeholder="<h2>Lección</h2><p>...</p>"
              className="input font-mono text-xs"
            />
          </Field>
        ) : (
          <Field label="URL externa (YouTube embed, PDF, etc.)">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className="input" />
          </Field>
        )}
        <Field label="Notas para el estudiante (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="input"
          />
        </Field>
        <Field label="Archivos adjuntos">
          <input type="file" multiple onChange={onFiles} className="text-xs" />
          {attachments.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs">
              {attachments.map((a, i) => (
                <li key={i} className="flex items-center justify-between rounded bg-brand-cream/40 px-2 py-1">
                  <span className="truncate text-brand-ink/80">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                    className="text-red-600"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-[10px] text-brand-ink/45">
            En producción se suben a MinIO/S3 con signed URL; aquí quedan como
            data-URLs locales para previsualización.
          </p>
        </Field>
        <Actions onClose={onClose} />
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-brand-ink/55 hover:text-brand-ink"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-brand-ink/70">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Actions({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/30"
      >
        Cancelar
      </button>
      <button
        type="submit"
        className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
      >
        Guardar
      </button>
    </div>
  );
}
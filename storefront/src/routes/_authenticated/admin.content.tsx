import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";

type Level = "beginner" | "intermediate" | "advanced";
type LessonKind = "video" | "pdf" | "slides" | "download" | "html";

interface BELesson {
  id: string;
  moduleId: string;
  title: string;
  kind: LessonKind;
  position: number;
  durationMin?: number | null;
  videoUrl?: string | null;
  pdfUrl?: string | null;
  slidesUrl?: string | null;
  contentHtml?: string | null;
  notes?: string | null;
  /** Compuerta: bloquea el contenido posterior hasta superarla. */
  isCheckpoint?: boolean;
}
// Checkpoints v2: pregunta editable de cualquier tipo (ver backend
// checkpoint-questions.ts). Los campos aplican según `type`.
interface BECheckpointQuestion {
  id: string;
  type?: "single" | "multi" | "truefalse" | "fill" | "order" | "match" | "dragwords";
  prompt: string;
  options?: string[];
  correctIndex?: number;
  correctIndexes?: number[];
  correct?: boolean;
  accepted?: string[];
  items?: string[];
  pairs?: Array<{ left: string; right: string }>;
  text?: string;
  words?: string[];
  extraWords?: string[];
}
interface BECheckpointSettings {
  allowRetryAfterPass?: boolean;
  maxAttempts?: number | null;
  cooldownHours?: number | null;
  shuffleQuestions?: boolean;
  showAnswers?: boolean;
  timeLimitMin?: number | null;
}
interface BECheckpoint {
  id: string;
  moduleId: string;
  fromLevel: Level;
  toLevel: Level;
  passingScore: number;
  questions: BECheckpointQuestion[];
  settings?: BECheckpointSettings;
}
interface BEModule {
  id: string;
  level: Level;
  title: string;
  summary?: string | null;
  position: number;
  /** Unidad dentro del nivel; agrupa los módulos en el catálogo del estudiante. */
  unit?: number | null;
  lessons: BELesson[];
  checkpoints?: BECheckpoint[];
}

export const Route = createFileRoute("/_authenticated/admin/content")({
  head: () => ({ meta: [{ title: "CMS — Admin" }] }),
  component: AdminContent,
});

const LEVELS: { id: Level; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];
const LESSON_KINDS: LessonKind[] = ["video", "pdf", "slides", "download", "html"];

function AdminContent() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingModule, setEditingModule] = useState<Partial<BEModule> | null>(null);
  const [editingLesson, setEditingLesson] = useState<
    { moduleId: string; lesson?: BELesson } | null
  >(null);
  const [editingCheckpoint, setEditingCheckpoint] = useState<
    { moduleId: string; level: Level; checkpoint?: BECheckpoint } | null
  >(null);

  const modulesQ = useQuery({
    queryKey: ["admin", "content"],
    queryFn: () => adminApi.content() as unknown as Promise<BEModule[]>,
  });
  const modules = modulesQ.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "content"] });

  const updateModule = useMutation({
    mutationFn: (v: { id: string; position?: number; title?: string; summary?: string; level?: Level }) =>
      adminApi.updateModule(v.id, v),
    onSuccess: invalidate,
  });
  const deleteModuleM = useMutation({
    mutationFn: (id: string) => adminApi.deleteModule(id),
    onSuccess: () => {
      invalidate();
      toast.success("Módulo eliminado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const deleteLessonM = useMutation({
    mutationFn: (id: string) => adminApi.deleteLesson(id),
    onSuccess: () => {
      invalidate();
      toast.success("Lección eliminada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const deleteCheckpointM = useMutation({
    mutationFn: (id: string) => adminApi.deleteCheckpoint(id),
    onSuccess: () => {
      invalidate();
      toast.success("Checkpoint eliminado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveModule(mod: BEModule, dir: -1 | 1) {
    const siblings = modules.filter((m) => m.level === mod.level).sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((m) => m.id === mod.id);
    const j = idx + dir;
    if (j < 0 || j >= siblings.length) return;
    const other = siblings[j];
    updateModule.mutate({ id: mod.id, position: other.position });
    updateModule.mutate({ id: other.id, position: mod.position });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-ink">Catálogo de aprendizaje</h2>
          <p className="text-xs text-brand-ink/55">
            Crea módulos por nivel y sus lecciones (video, PDF, slides, HTML,
            descargable). Cambios sincronizados con el backend.
          </p>
        </div>
        <button
          onClick={() =>
            setEditingModule({ level: "beginner", position: modules.length + 1 })
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
        >
          <Plus className="size-3.5" /> Crear módulo
        </button>
      </div>

      {modulesQ.isLoading ? <p className="text-sm text-brand-ink/60">Cargando…</p> : null}

      {LEVELS.map((lvl) => {
        const mods = modules
          .filter((m) => m.level === lvl.id)
          .sort((a, b) => a.position - b.position);
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
                {mods.map((m, i) => {
                  const open = expanded.has(m.id);
                  return (
                    <li key={m.id} className="rounded-xl border border-brand-line bg-brand-cream/20">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button onClick={() => toggle(m.id)} className="text-brand-ink/60">
                          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                        <div className="flex flex-col">
                          <button
                            onClick={() => moveModule(m, -1)}
                            disabled={i === 0}
                            className="rounded p-0.5 text-brand-ink/50 hover:bg-white disabled:opacity-30"
                            aria-label="Subir"
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            onClick={() => moveModule(m, 1)}
                            disabled={i === mods.length - 1}
                            className="rounded p-0.5 text-brand-ink/50 hover:bg-white disabled:opacity-30"
                            aria-label="Bajar"
                          >
                            <ArrowDown className="size-3" />
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {/* La unidad es lo que agrupa el catálogo del estudiante;
                                si falta, el módulo queda suelto y conviene verlo. */}
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                m.unit != null
                                  ? "bg-brand-yellow/50 text-brand-ink"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                              title={m.unit != null ? `Unidad ${m.unit}` : "Sin unidad: queda fuera de los grupos"}
                            >
                              {m.unit != null ? `U${m.unit}` : "sin unidad"}
                            </span>
                            <span className="truncate text-sm font-semibold text-brand-ink">{m.title}</span>
                          </div>
                          <div className="truncate text-xs text-brand-ink/55">{m.summary}</div>
                        </div>
                        <span className="text-xs text-brand-ink/55">{m.lessons.length} lecciones</span>
                        <button
                          onClick={() => setEditingModule(m)}
                          className="rounded-full p-1.5 text-brand-ink/60 hover:bg-white hover:text-brand-ink"
                          aria-label="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("¿Eliminar módulo y todas sus lecciones?"))
                              deleteModuleM.mutate(m.id);
                          }}
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
                              onClick={() => setEditingLesson({ moduleId: m.id })}
                              className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-ink/80 hover:-translate-y-0.5"
                            >
                              <Plus className="size-3" /> Añadir lección
                            </button>
                          </div>
                          <LessonList
                            lessons={[...m.lessons].sort((a, b) => a.position - b.position)}
                            onEdit={(l) => setEditingLesson({ moduleId: m.id, lesson: l })}
                            onDelete={(id) => {
                              if (confirm("¿Eliminar lección?")) deleteLessonM.mutate(id);
                            }}
                            onMove={(l, dir) => {
                              const sorted = [...m.lessons].sort((a, b) => a.position - b.position);
                              const idx = sorted.findIndex((x) => x.id === l.id);
                              const j = idx + dir;
                              if (j < 0 || j >= sorted.length) return;
                              const other = sorted[j];
                              adminApi
                                .updateLesson(l.id, { position: other.position })
                                .then(() => adminApi.updateLesson(other.id, { position: l.position }))
                                .then(invalidate);
                            }}
                          />
                          <div className="mt-4 border-t border-brand-line pt-3">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wide text-brand-ink/55">Checkpoint (examen de nivel)</span>
                              <button
                                onClick={() => setEditingCheckpoint({ moduleId: m.id, level: m.level, checkpoint: m.checkpoints?.[0] })}
                                className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-ink/80 hover:-translate-y-0.5"
                              >
                                <Plus className="size-3" /> {m.checkpoints?.[0] ? "Editar checkpoint" : "Crear checkpoint"}
                              </button>
                            </div>
                            {m.checkpoints?.[0] ? (
                              <div className="flex items-center justify-between rounded-lg border border-brand-line bg-white px-3 py-2 text-xs">
                                <span className="text-brand-ink/80">
                                  {m.checkpoints[0].fromLevel} → {m.checkpoints[0].toLevel} · {Array.isArray(m.checkpoints[0].questions) ? m.checkpoints[0].questions.length : 0} preguntas · pasa {m.checkpoints[0].passingScore}%
                                </span>
                                <button
                                  onClick={() => { if (confirm("¿Eliminar checkpoint?")) deleteCheckpointM.mutate(m.checkpoints![0].id); }}
                                  className="rounded-full p-1 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-brand-ink/55">Sin checkpoint. Al aprobarlo, el estudiante sube de nivel.</p>
                            )}
                          </div>
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

      {editingModule ? (
        <ModuleDialog
          initial={editingModule}
          onClose={() => setEditingModule(null)}
          onSaved={() => {
            setEditingModule(null);
            invalidate();
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
            invalidate();
          }}
        />
      ) : null}
      {editingCheckpoint ? (
        <CheckpointDialog
          moduleId={editingCheckpoint.moduleId}
          level={editingCheckpoint.level}
          checkpoint={editingCheckpoint.checkpoint}
          onClose={() => setEditingCheckpoint(null)}
          onSaved={() => {
            setEditingCheckpoint(null);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function LessonList({
  lessons,
  onEdit,
  onDelete,
  onMove,
}: {
  lessons: BELesson[];
  onEdit: (l: BELesson) => void;
  onDelete: (id: string) => void;
  onMove: (l: BELesson, dir: -1 | 1) => void;
}) {
  if (lessons.length === 0) return <p className="text-xs text-brand-ink/55">Sin lecciones.</p>;
  return (
    <ul className="divide-y divide-brand-line/60 text-sm">
      {lessons.map((l, i) => (
        <li key={l.id} className="flex items-center gap-2 py-2">
          <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-ink/70">
            {l.kind}
          </span>
          <div className="min-w-0 flex-1 truncate text-brand-ink/85">
            {l.position}. {l.title}
          </div>
          <span className="text-xs text-brand-ink/55">{l.durationMin ?? 0} min</span>
          <button
            onClick={() => onMove(l, -1)}
            disabled={i === 0}
            className="rounded p-1 text-brand-ink/50 hover:bg-brand-cream/40 disabled:opacity-30"
          >
            <ArrowUp className="size-3" />
          </button>
          <button
            onClick={() => onMove(l, 1)}
            disabled={i === lessons.length - 1}
            className="rounded p-1 text-brand-ink/50 hover:bg-brand-cream/40 disabled:opacity-30"
          >
            <ArrowDown className="size-3" />
          </button>
          <button
            onClick={() => onEdit(l)}
            className="rounded-full p-1.5 text-brand-ink/60 hover:bg-brand-cream/50 hover:text-brand-ink"
          >
            <Pencil className="size-3.5" />
          </button>
          <button onClick={() => onDelete(l.id)} className="rounded-full p-1.5 text-red-600 hover:bg-red-50">
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ModuleDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<BEModule>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [level, setLevel] = useState<Level>((initial.level ?? "beginner") as Level);
  const [position, setPosition] = useState(initial.position ?? 1);
  // Unidad dentro del nivel: es lo que agrupa los módulos en el catálogo del
  // estudiante. Vacío = queda fuera de toda unidad.
  const [unit, setUnit] = useState<string>(initial.unit != null ? String(initial.unit) : "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      if (initial.id) {
        await adminApi.updateModule(initial.id, { title, summary, level, position, unit: unit.trim() === "" ? null : Number(unit) });
      } else {
        await adminApi.createModule({ title, summary, level, position, unit: unit.trim() === "" ? null : Number(unit) });
      }
      toast.success("Módulo guardado");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={initial.id ? "Editar módulo" : "Crear módulo"} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input" />
        </Field>
        <Field label="Resumen">
          <textarea value={summary ?? ""} onChange={(e) => setSummary(e.target.value)} rows={2} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nivel">
            <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="input">
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Posición">
            <input
              type="number"
              min={1}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>
        <Field label="Unidad">
          <input
            type="number"
            min={1}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="1"
            className="input"
          />
          <p className="mt-1 text-[11px] text-brand-ink/55">
            Agrupa los módulos dentro del nivel en el catálogo del estudiante. Déjalo vacío para
            que quede suelto, fuera de cualquier unidad.
          </p>
        </Field>
        <Actions onClose={onClose} pending={pending} />
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
  lesson?: BELesson;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [kind, setKind] = useState<LessonKind>((lesson?.kind ?? "video") as LessonKind);
  const [position, setPosition] = useState(lesson?.position ?? 1);
  const [durationMin, setDurationMin] = useState(lesson?.durationMin ?? 5);
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? "");
  const [pdfUrl, setPdfUrl] = useState(lesson?.pdfUrl ?? "");
  const [slidesUrl, setSlidesUrl] = useState(lesson?.slidesUrl ?? "");
  const [contentHtml, setContentHtml] = useState(lesson?.contentHtml ?? "");
  const [notes, setNotes] = useState(lesson?.notes ?? "");
  const [isCheckpoint, setIsCheckpoint] = useState<boolean>(!!(lesson as any)?.isCheckpoint);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const body: any = {
        moduleId,
        title,
        kind,
        position,
        durationMin,
        videoUrl: videoUrl || null,
        pdfUrl: pdfUrl || null,
        slidesUrl: slidesUrl || null,
        contentHtml: kind === "html" ? contentHtml || null : null,
        notes: notes || null,
        isCheckpoint,
      };
      if (lesson?.id) await adminApi.updateLesson(lesson.id, body);
      else await adminApi.createLesson(body);
      toast.success("Lección guardada");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={lesson ? "Editar lección" : "Nueva lección"} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as LessonKind)} className="input capitalize">
              {LESSON_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Posición">
            <input
              type="number"
              min={1}
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Duración (min)">
            <input
              type="number"
              min={0}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>

        {/* Compuerta: la posición define desde dónde bloquea. */}
        <label className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm transition ${
          isCheckpoint ? "border-brand-yellow bg-brand-yellow/10" : "border-brand-line bg-brand-cream/20"
        }`}>
          <input
            type="checkbox"
            checked={isCheckpoint}
            onChange={(e) => setIsCheckpoint(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold text-brand-ink">🏁 Esta lección es un checkpoint</span>
            <span className="mt-0.5 block text-xs text-brand-ink/65">
              Actúa como compuerta: todo lo que venga después (en este módulo y en los módulos
              siguientes) queda bloqueado hasta que el estudiante lo supere. Además no se abre
              hasta que su profesor se lo habilite. Usa la <b>posición</b> para decidir dónde cae
              — p. ej. posición 3 lo deja después de las dos primeras lecciones.
            </span>
          </span>
        </label>
        {kind === "video" ? (
          <Field label="URL del video (YouTube embed, etc.)">
            <input value={videoUrl ?? ""} onChange={(e) => setVideoUrl(e.target.value)} className="input" />
          </Field>
        ) : null}
        {kind === "pdf" || kind === "download" ? (
          <Field label="URL del PDF / archivo">
            <input value={pdfUrl ?? ""} onChange={(e) => setPdfUrl(e.target.value)} className="input" />
          </Field>
        ) : null}
        {kind === "slides" ? (
          <Field label="URL de las diapositivas">
            <input value={slidesUrl ?? ""} onChange={(e) => setSlidesUrl(e.target.value)} className="input" />
          </Field>
        ) : null}
        {kind === "html" ? (
          <Field label="Contenido HTML">
            <textarea
              value={contentHtml ?? ""}
              onChange={(e) => setContentHtml(e.target.value)}
              rows={8}
              placeholder="<h2>Lección</h2><p>...</p>"
              className="input font-mono text-xs"
            />
          </Field>
        ) : null}
        <Field label="Notas para el estudiante (opcional)">
          <textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" />
        </Field>
        <Actions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-brand-ink/55 hover:text-brand-ink">
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

function Actions({ onClose, pending }: { onClose: () => void; pending?: boolean }) {
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
        disabled={pending}
        className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

function nextLevel(l: Level): Level {
  return l === "beginner" ? "intermediate" : l === "intermediate" ? "advanced" : "advanced";
}

function CheckpointDialog({
  moduleId,
  level,
  checkpoint,
  onClose,
  onSaved,
}: {
  moduleId: string;
  level: Level;
  checkpoint?: BECheckpoint;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fromLevel, setFromLevel] = useState<Level>((checkpoint?.fromLevel ?? level) as Level);
  const [toLevel, setToLevel] = useState<Level>((checkpoint?.toLevel ?? nextLevel(level)) as Level);
  const [passingScore, setPassingScore] = useState<number>(checkpoint?.passingScore ?? 70);
  const [settings, setSettings] = useState<BECheckpointSettings>({
    allowRetryAfterPass: checkpoint?.settings?.allowRetryAfterPass ?? false,
    maxAttempts: checkpoint?.settings?.maxAttempts ?? null,
    cooldownHours: checkpoint?.settings?.cooldownHours ?? null,
    shuffleQuestions: checkpoint?.settings?.shuffleQuestions ?? false,
    showAnswers: checkpoint?.settings?.showAnswers ?? true,
    timeLimitMin: checkpoint?.settings?.timeLimitMin ?? null,
  });
  const [questions, setQuestions] = useState<BECheckpointQuestion[]>(
    checkpoint?.questions?.length
      ? checkpoint.questions.map((q) => JSON.parse(JSON.stringify(q)))
      : [newQuestion("single")],
  );
  const [pending, setPending] = useState(false);

  function patchQ(i: number, patch: Partial<BECheckpointQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // La validación fuerte por tipo la hace el backend (validateQuestion) y
    // devuelve el mensaje exacto; aquí solo lo mínimo.
    for (const q of questions) {
      if (!q.prompt.trim()) return toast.error("Cada pregunta necesita enunciado");
    }
    setPending(true);
    try {
      await adminApi.saveCheckpoint({ id: checkpoint?.id, moduleId, fromLevel, toLevel, passingScore, questions, settings });
      toast.success("Checkpoint guardado");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={checkpoint ? "Editar checkpoint" : "Crear checkpoint"} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Desde nivel">
            <select value={fromLevel} onChange={(e) => setFromLevel(e.target.value as Level)} className="input">
              {LEVELS.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}
            </select>
          </Field>
          <Field label="Sube a nivel">
            <select value={toLevel} onChange={(e) => setToLevel(e.target.value as Level)} className="input">
              {LEVELS.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}
            </select>
          </Field>
          <Field label="Puntaje mínimo (%)">
            <input type="number" min={1} max={100} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className="input" />
          </Field>
        </div>

        {/* ── Configuración del checkpoint ── */}
        <div className="rounded-xl border border-brand-line bg-brand-cream/20 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-ink/60">Configuración</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-brand-ink/80">
              <input type="checkbox" checked={!!settings.shuffleQuestions} onChange={(e) => setSettings((s) => ({ ...s, shuffleQuestions: e.target.checked }))} />
              Barajar preguntas
            </label>
            <label className="flex items-center gap-2 text-xs text-brand-ink/80">
              <input type="checkbox" checked={!!settings.showAnswers} onChange={(e) => setSettings((s) => ({ ...s, showAnswers: e.target.checked }))} />
              Mostrar respuestas al terminar
            </label>
            <label className="flex items-center gap-2 text-xs text-brand-ink/80">
              <input type="checkbox" checked={!!settings.allowRetryAfterPass} onChange={(e) => setSettings((s) => ({ ...s, allowRetryAfterPass: e.target.checked }))} />
              Puede repetir tras aprobar
            </label>
            <label className="text-xs text-brand-ink/80">
              Máx. intentos <span className="text-brand-ink/40">(vacío = ∞)</span>
              <input type="number" min={1} value={settings.maxAttempts ?? ""} onChange={(e) => setSettings((s) => ({ ...s, maxAttempts: e.target.value ? Number(e.target.value) : null }))} className="input mt-1" />
            </label>
            <label className="text-xs text-brand-ink/80">
              Espera entre intentos (horas)
              <input type="number" min={1} value={settings.cooldownHours ?? ""} onChange={(e) => setSettings((s) => ({ ...s, cooldownHours: e.target.value ? Number(e.target.value) : null }))} className="input mt-1" />
            </label>
            <label className="text-xs text-brand-ink/80">
              Límite de tiempo (min)
              <input type="number" min={1} value={settings.timeLimitMin ?? ""} onChange={(e) => setSettings((s) => ({ ...s, timeLimitMin: e.target.value ? Number(e.target.value) : null }))} className="input mt-1" />
            </label>
          </div>
        </div>

        {/* ── Preguntas ── */}
        <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
          {questions.map((q, qi) => (
            <QuestionEditor
              key={q.id}
              q={q}
              index={qi}
              onPatch={(patch) => patchQ(qi, patch)}
              onDelete={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink/50">Añadir pregunta:</span>
          {(Object.keys(Q_TYPE_LABEL) as Array<NonNullable<BECheckpointQuestion["type"]>>).map((t) => (
            <button key={t} type="button" onClick={() => setQuestions((qs) => [...qs, newQuestion(t)])}
              className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-ink/80 transition hover:-translate-y-0.5 hover:bg-brand-cream/40">
              <Plus className="size-3" /> {Q_TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <Actions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

/* ── Checkpoints v2 · editor de preguntas por tipo ─────────────────────── */

const Q_TYPE_LABEL: Record<NonNullable<BECheckpointQuestion["type"]>, string> = {
  single: "Selección única",
  multi: "Selección múltiple",
  truefalse: "Verdadero/Falso",
  fill: "Completar (escribe)",
  order: "Ordenar",
  match: "Emparejar",
  dragwords: "Arrastrar palabras",
};

function newQuestion(type: NonNullable<BECheckpointQuestion["type"]>): BECheckpointQuestion {
  const base = { id: crypto.randomUUID(), type, prompt: "" };
  switch (type) {
    case "single": return { ...base, options: ["", ""], correctIndex: 0 };
    case "multi": return { ...base, options: ["", ""], correctIndexes: [] };
    case "truefalse": return { ...base, correct: true };
    case "fill": return { ...base, accepted: [""] };
    case "order": return { ...base, items: ["", ""] };
    case "match": return { ...base, pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
    case "dragwords": return { ...base, text: "", words: [], extraWords: [] };
  }
}

/** Lista editable de strings (opciones, items, aceptadas…). */
function StrList({ values, onChange, placeholder, min = 1, prefix }: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string; min?: number;
  prefix?: (i: number) => React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          {prefix ? prefix(i) : null}
          <input value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`${placeholder} ${i + 1}`} className="input flex-1" />
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} disabled={values.length <= min}
            className="rounded p-1 text-brand-ink/50 hover:bg-white disabled:opacity-30" aria-label="Quitar">
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...values, ""])}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-ink/70 hover:text-brand-ink">
        <Plus className="size-3" /> Añadir
      </button>
    </div>
  );
}

function QuestionEditor({ q, index, onPatch, onDelete }: {
  q: BECheckpointQuestion; index: number;
  onPatch: (patch: Partial<BECheckpointQuestion>) => void; onDelete: () => void;
}) {
  const type = q.type ?? "single";
  const blanks = (String(q.text ?? "").match(/\{\{\d+\}\}/g) ?? []).length;
  return (
    <div className="rounded-xl border border-brand-line bg-brand-cream/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-brand-ink/70">
          Pregunta {index + 1} · <span className="rounded-full bg-brand-yellow/60 px-2 py-0.5">{Q_TYPE_LABEL[type]}</span>
        </span>
        <button type="button" onClick={onDelete} className="text-red-600 hover:text-red-700" aria-label="Eliminar pregunta">
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <input value={q.prompt} onChange={(e) => onPatch({ prompt: e.target.value })} placeholder="Enunciado de la pregunta" className="input mb-2" />

      {type === "single" ? (
        <StrList
          values={q.options ?? []}
          min={2}
          placeholder="Opción"
          onChange={(options) => onPatch({ options })}
          prefix={(i) => (
            <input type="radio" name={`correct-${q.id}`} checked={q.correctIndex === i} onChange={() => onPatch({ correctIndex: i })} title="Correcta" />
          )}
        />
      ) : null}

      {type === "multi" ? (
        <StrList
          values={q.options ?? []}
          min={2}
          placeholder="Opción"
          onChange={(options) => onPatch({ options })}
          prefix={(i) => (
            <input
              type="checkbox"
              checked={(q.correctIndexes ?? []).includes(i)}
              onChange={(e) => {
                const set = new Set(q.correctIndexes ?? []);
                if (e.target.checked) set.add(i); else set.delete(i);
                onPatch({ correctIndexes: [...set].sort() });
              }}
              title="Correcta"
            />
          )}
        />
      ) : null}

      {type === "truefalse" ? (
        <div className="flex items-center gap-3 text-xs text-brand-ink/80">
          Respuesta correcta:
          {[true, false].map((v) => (
            <label key={String(v)} className="flex items-center gap-1.5">
              <input type="radio" name={`tf-${q.id}`} checked={q.correct === v} onChange={() => onPatch({ correct: v })} />
              {v ? "Verdadero" : "Falso"}
            </label>
          ))}
        </div>
      ) : null}

      {type === "fill" ? (
        <div>
          <p className="mb-1 text-[11px] text-brand-ink/55">Respuestas aceptadas (cualquiera vale; no distingue mayúsculas/tildes):</p>
          <StrList values={q.accepted ?? []} min={1} placeholder="Respuesta aceptada" onChange={(accepted) => onPatch({ accepted })} />
        </div>
      ) : null}

      {type === "order" ? (
        <div>
          <p className="mb-1 text-[11px] text-brand-ink/55">Escribe los elementos EN EL ORDEN CORRECTO (al estudiante se le muestran barajados):</p>
          <StrList values={q.items ?? []} min={2} placeholder="Elemento" onChange={(items) => onPatch({ items })} />
        </div>
      ) : null}

      {type === "match" ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-brand-ink/55">Parejas correctas (la columna derecha se baraja al presentarla):</p>
          {(q.pairs ?? []).map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={p.left} onChange={(e) => onPatch({ pairs: (q.pairs ?? []).map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} placeholder="Izquierda" className="input flex-1" />
              <span className="text-brand-ink/40">→</span>
              <input value={p.right} onChange={(e) => onPatch({ pairs: (q.pairs ?? []).map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} placeholder="Derecha" className="input flex-1" />
              <button type="button" onClick={() => onPatch({ pairs: (q.pairs ?? []).filter((_, j) => j !== i) })} disabled={(q.pairs ?? []).length <= 2}
                className="rounded p-1 text-brand-ink/50 hover:bg-white disabled:opacity-30" aria-label="Quitar pareja">
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onPatch({ pairs: [...(q.pairs ?? []), { left: "", right: "" }] })}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-ink/70 hover:text-brand-ink">
            <Plus className="size-3" /> Añadir pareja
          </button>
        </div>
      ) : null}

      {type === "dragwords" ? (
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-[11px] text-brand-ink/55">
              Frase con huecos <code className="rounded bg-white px-1">{"{{1}}"}</code>, <code className="rounded bg-white px-1">{"{{2}}"}</code>… ({blanks} hueco(s) detectados)
            </p>
            <textarea value={q.text ?? ""} onChange={(e) => {
              const text = e.target.value;
              const n = (text.match(/\{\{\d+\}\}/g) ?? []).length;
              const words = [...(q.words ?? [])];
              while (words.length < n) words.push("");
              onPatch({ text, words: words.slice(0, n) });
            }} rows={2} placeholder='Ej: I {{1}} to the gym every {{2}}.' className="input w-full" />
          </div>
          {blanks > 0 ? (
            <div>
              <p className="mb-1 text-[11px] text-brand-ink/55">Palabra correcta de cada hueco:</p>
              <div className="grid gap-1.5 md:grid-cols-2">
                {Array.from({ length: blanks }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-[10px] font-bold">{i + 1}</span>
                    <input value={q.words?.[i] ?? ""} onChange={(e) => onPatch({ words: Array.from({ length: blanks }, (_, j) => (j === i ? e.target.value : q.words?.[j] ?? "")) })} placeholder={`Palabra del hueco ${i + 1}`} className="input flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <p className="mb-1 text-[11px] text-brand-ink/55">Palabras distractoras (opcionales, van al banco):</p>
            <StrList values={q.extraWords ?? []} min={0} placeholder="Distractor" onChange={(extraWords) => onPatch({ extraWords })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Nota: la clase `input` está definida como utility en styles.css.
useMemo; // keep import warm

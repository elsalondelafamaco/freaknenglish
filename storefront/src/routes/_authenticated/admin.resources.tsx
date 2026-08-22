import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";
import type { EnglishLevel } from "@/lib/domain/types";
import { LessonFrame } from "@/components/learning/LessonFrame";

export const Route = createFileRoute("/_authenticated/admin/resources")({
  head: () => ({ meta: [{ title: "Material extra — Admin" }] }),
  component: AdminResources,
});

type Borrador = {
  id?: string;
  title: string;
  description: string;
  /** Para qué sirve la clase: lo lee el profe al lado del visor. */
  objective: string;
  category: string;
  /** "" = sirve para los tres niveles. */
  level: EnglishLevel | "";
  contentHtml: string;
  published: boolean;
};

const VACIO: Borrador = { title: "", description: "", objective: "", category: "", level: "", contentHtml: "", published: true };

const NIVELES: Array<{ id: EnglishLevel | ""; label: string }> = [
  { id: "", label: "Todos los niveles" },
  { id: "beginner", label: "Beginner (A1–A2)" },
  { id: "intermediate", label: "Intermediate (B1–B2)" },
  { id: "advanced", label: "Advanced (C1)" },
];
const etiquetaNivel = (l: EnglishLevel | null) =>
  NIVELES.find((n) => n.id === (l ?? ""))?.label ?? "Todos los niveles";

/**
 * Material extra: el admin sube los HTML de apoyo y todos los profesores los
 * consultan. El HTML se guarda en la base y NO en el bucket porque el bucket
 * sirve todo con lectura pública: un archivo ahí quedaría con URL abierta.
 */
function AdminResources() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);

  const listQ = useQuery({ queryKey: ["admin", "resources"], queryFn: () => adminApi.resources() });
  const invalidar = () => qc.invalidateQueries({ queryKey: ["admin", "resources"] });

  const guardarM = useMutation({
    mutationFn: (b: Borrador) => {
      const body = {
        title: b.title.trim(),
        description: b.description.trim() || null,
        objective: b.objective.trim() || null,
        category: b.category.trim() || null,
        level: b.level || null,
        contentHtml: b.contentHtml,
        published: b.published,
      };
      return b.id ? adminApi.updateResource(b.id, body) : adminApi.createResource(body);
    },
    onSuccess: () => { invalidar(); setEditando(null); toast.success("Material guardado"); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  const borrarM = useMutation({
    mutationFn: (id: string) => adminApi.deleteResource(id),
    onSuccess: () => { invalidar(); setConfirmarBorrado(null); toast.success("Material eliminado"); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const publicarM = useMutation({
    mutationFn: (v: { id: string; published: boolean }) => adminApi.updateResource(v.id, { published: v.published }),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e?.message ?? "No se pudo cambiar"),
  });

  async function abrirParaEditar(id: string) {
    try {
      const r = await adminApi.resource(id);
      setEditando({
        id: r.id,
        title: r.title,
        description: r.description ?? "",
        objective: r.objective ?? "",
        category: r.category ?? "",
        level: r.level ?? "",
        contentHtml: r.contentHtml,
        published: r.published,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo abrir el material");
    }
  }

  const filas = listQ.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Material extra</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-brand-ink/65">
            Recursos de apoyo que ven los profesores en su barra lateral. No aparecen en el
            catálogo del estudiante.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando({ ...VACIO })}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white shadow-soft"
        >
          <Plus className="size-4" /> Nuevo material
        </button>
      </header>

      {listQ.isLoading ? (
        <div className="text-sm text-brand-ink/60">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          Todavía no hay material. Sube un HTML para que los profes lo vean.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream/50 text-left text-xs uppercase tracking-wide text-brand-ink/60">
              <tr>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Nivel</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id} className="border-t border-brand-line">
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-ink">{r.title}</div>
                    {r.description ? <div className="text-xs text-brand-ink/60">{r.description}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-brand-ink/70">{etiquetaNivel(r.level)}</td>
                  <td className="px-4 py-3 text-brand-ink/70">{r.category ?? "General"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.published ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-700"}`}>
                      {r.published ? "Publicado" : "Oculto"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => publicarM.mutate({ id: r.id, published: !r.published })}
                        className="rounded-lg p-2 text-brand-ink/50 hover:bg-brand-cream/50 hover:text-brand-ink"
                        aria-label={r.published ? "Ocultar" : "Publicar"}
                        title={r.published ? "Ocultar a los profes" : "Publicar"}
                      >
                        {r.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirParaEditar(r.id)}
                        className="rounded-lg p-2 text-brand-ink/50 hover:bg-brand-cream/50 hover:text-brand-ink"
                        aria-label="Editar"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {confirmarBorrado === r.id ? (
                        <span className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                          ¿Eliminar?
                          <button type="button" onClick={() => borrarM.mutate(r.id)} disabled={borrarM.isPending} className="font-semibold underline">Sí</button>
                          <button type="button" onClick={() => setConfirmarBorrado(null)} className="underline">No</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmarBorrado(r.id)}
                          className="rounded-lg p-2 text-red-500/70 hover:bg-red-50 hover:text-red-600"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando ? (
        <EditorMaterial
          valor={editando}
          onChange={setEditando}
          onClose={() => setEditando(null)}
          onSave={() => guardarM.mutate(editando)}
          pending={guardarM.isPending}
        />
      ) : null}
    </div>
  );
}

function EditorMaterial({
  valor,
  onChange,
  onClose,
  onSave,
  pending,
}: {
  valor: Borrador;
  onChange: (b: Borrador) => void;
  onClose: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState(false);
  const puedeGuardar = useMemo(
    () => valor.title.trim().length > 0 && valor.contentHtml.trim().length > 0,
    [valor.title, valor.contentHtml],
  );

  async function cargarArchivo(f: File | undefined) {
    if (!f) return;
    // `file.text()` evita pegar a mano un HTML de miles de líneas, que es como
    // se venía haciendo con las lecciones.
    const texto = await f.text();
    onChange({
      ...valor,
      contentHtml: texto,
      title: valor.title.trim() || f.name.replace(/\.html?$/i, "").replace(/[-_]+/g, " "),
    });
    toast.success(`${f.name} cargado (${Math.round(f.size / 1024)} KB)`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-ink">
            {valor.id ? "Editar material" : "Nuevo material"}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-brand-ink/55 hover:text-brand-ink">Cerrar</button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-brand-ink/70">
            Título
            <input
              value={valor.title}
              onChange={(e) => onChange({ ...valor, title: e.target.value })}
              className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm font-normal text-brand-ink focus:border-brand-ink focus:outline-none"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-brand-ink/70">
              Nivel
              <select
                value={valor.level}
                onChange={(e) => onChange({ ...valor, level: e.target.value as EnglishLevel | "" })}
                className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm font-normal text-brand-ink focus:border-brand-ink focus:outline-none"
              >
                {NIVELES.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              Categoría (opcional)
              <input
                value={valor.category}
                onChange={(e) => onChange({ ...valor, category: e.target.value })}
                placeholder="Gramática, Pronunciación…"
                className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm font-normal text-brand-ink focus:border-brand-ink focus:outline-none"
              />
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              Descripción corta (opcional)
              <input
                value={valor.description}
                onChange={(e) => onChange({ ...valor, description: e.target.value })}
                className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm font-normal text-brand-ink focus:border-brand-ink focus:outline-none"
              />
            </label>
          </div>

          {/* A lo ancho y como textarea: es prosa, y es lo que el profe lee al
              lado del visor para decidir si le sirve la clase. */}
          <label className="text-xs font-semibold text-brand-ink/70">
            ¿Para qué sirve esta clase? (objetivo)
            <textarea
              value={valor.objective}
              onChange={(e) => onChange({ ...valor, objective: e.target.value })}
              rows={3}
              placeholder="Ej. Repasar el past simple con verbos irregulares y soltar al alumno contando anécdotas en pasado. Ideal si ya vio el presente perfecto y confunde los dos."
              className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm font-normal text-brand-ink focus:border-brand-ink focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => { void cargarArchivo(e.target.files?.[0]); e.target.value = ""; }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
            >
              <FileUp className="size-3.5" /> Subir archivo .html
            </button>
            <button
              type="button"
              onClick={() => setPrevia((v) => !v)}
              disabled={!valor.contentHtml.trim()}
              className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-50"
            >
              {previa ? "Ver el código" : "Ver previa"}
            </button>
            <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-brand-ink/70">
              <input
                type="checkbox"
                checked={valor.published}
                onChange={(e) => onChange({ ...valor, published: e.target.checked })}
              />
              Visible para los profes
            </label>
          </div>

          {previa ? (
            <LessonFrame title={valor.title || "Previa"} html={valor.contentHtml} />
          ) : (
            <label className="text-xs font-semibold text-brand-ink/70">
              Contenido HTML
              <textarea
                value={valor.contentHtml}
                onChange={(e) => onChange({ ...valor, contentHtml: e.target.value })}
                rows={12}
                placeholder="<h2>Present perfect</h2><p>…</p>"
                className="mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 font-mono text-xs font-normal text-brand-ink focus:border-brand-ink focus:outline-none"
              />
            </label>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-brand-line px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40">
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!puedeGuardar || pending}
              className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white shadow-soft disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

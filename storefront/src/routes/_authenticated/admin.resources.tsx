import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";
import type { EnglishLevel } from "@/lib/domain/types";
import { LessonFrame } from "@/components/learning/LessonFrame";
import { Cargando, EstadoError, PageHeader, Vacio, btnChipInk, focusRing } from "@/components/app/AppUi";
import { btnRow, td, th } from "@/components/teacher/TeacherUi";
import { ChipEstado } from "@/components/admin/AdminUi";

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
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrowText="Admin · Oferta"
        title="Material extra"
        highlight="extra"
        aside={
          <button type="button" onClick={() => setEditando({ ...VACIO })} className={btnChipInk}>
            <Plus className="size-4" aria-hidden="true" /> Nuevo material
          </button>
        }
      >
        Recursos de apoyo que ven los profesores en su barra lateral. No aparecen en el catálogo del estudiante.
      </PageHeader>

      {listQ.isError ? (
        <EstadoError onRetry={() => void listQ.refetch()}>No pudimos cargar el material.</EstadoError>
      ) : listQ.isLoading ? (
        <Cargando>Cargando material…</Cargando>
      ) : filas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay material"
          accion={
            <button type="button" onClick={() => setEditando({ ...VACIO })} className={btnChipInk}>
              <Plus className="size-4" aria-hidden="true" /> Subir el primero
            </button>
          }
        >
          Sube un HTML para que los profes lo vean.
        </Vacio>
      ) : (
        <div className="overflow-x-auto border-2 border-brand-ink bg-white">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr>
                <th className={th}>Título</th>
                <th className={th}>Nivel</th>
                <th className={th}>Categoría</th>
                <th className={th}>Estado</th>
                <th className={th}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id}>
                  <td className={td}>
                    <div className="font-bold text-brand-ink">{r.title}</div>
                    {r.description ? <div className="text-xs text-brand-ink/70">{r.description}</div> : null}
                  </td>
                  <td className={td}>{etiquetaNivel(r.level)}</td>
                  <td className={td}>{r.category ?? "General"}</td>
                  <td className={td}>
                    {/* Oculto = el material no llega a los profes: amarillo para notarlo. */}
                    <ChipEstado atencion={!r.published}>{r.published ? "Publicado" : "Oculto"}</ChipEstado>
                  </td>
                  <td className={td}>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => publicarM.mutate({ id: r.id, published: !r.published })}
                        className="inline-grid size-9 place-items-center rounded-full text-brand-ink hover:bg-brand-cream-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                        aria-label={`${r.published ? "Ocultar" : "Publicar"} ${r.title}`}
                        title={r.published ? "Ocultar a los profes" : "Publicar"}
                      >
                        {r.published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirParaEditar(r.id)}
                        className="inline-grid size-9 place-items-center rounded-full text-brand-ink hover:bg-brand-cream-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                        aria-label={`Editar ${r.title}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      {confirmarBorrado === r.id ? (
                        <span role="alert" className="flex items-center gap-1 border-2 border-red-700 bg-red-50 px-2 py-1 text-xs font-bold text-red-800">
                          ¿Eliminar “{r.title}”?
                          <button type="button" onClick={() => borrarM.mutate(r.id)} disabled={borrarM.isPending} className={`min-h-9 px-2 underline ${focusRing}`}>Sí, eliminar</button>
                          <button type="button" onClick={() => setConfirmarBorrado(null)} className={`min-h-9 px-2 underline ${focusRing}`}>No</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmarBorrado(r.id)}
                          className="inline-grid size-9 place-items-center rounded-full text-red-800 hover:bg-red-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                          aria-label={`Eliminar ${r.title}`}
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
    <div role="dialog" aria-modal="true" aria-label="Editor de material" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="shadow-hard my-8 w-full max-w-3xl border-2 border-brand-ink bg-white p-6 [--hard-x:6px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[22px] font-extrabold uppercase leading-tight text-brand-ink">
            {valor.id ? "Editar material" : "Nuevo material"}
          </h2>
          <button type="button" onClick={onClose} className={`inline-flex min-h-11 items-center px-2 text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline ${focusRing}`}>Cerrar</button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold text-brand-ink">
            Título
            <input
              value={valor.title}
              onChange={(e) => onChange({ ...valor, title: e.target.value })}
              className="mt-1 w-full bg-white px-3 py-2 text-sm font-normal text-brand-ink min-h-11 border-2 border-brand-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-brand-ink">
              Nivel
              <select
                value={valor.level}
                onChange={(e) => onChange({ ...valor, level: e.target.value as EnglishLevel | "" })}
                className="mt-1 w-full bg-white px-3 py-2 text-sm font-normal text-brand-ink min-h-11 border-2 border-brand-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
              >
                {NIVELES.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-brand-ink">
              Categoría (opcional)
              <input
                value={valor.category}
                onChange={(e) => onChange({ ...valor, category: e.target.value })}
                placeholder="Gramática, Pronunciación…"
                className="mt-1 w-full bg-white px-3 py-2 text-sm font-normal text-brand-ink min-h-11 border-2 border-brand-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
              />
            </label>
            <label className="text-xs font-bold text-brand-ink">
              Descripción corta (opcional)
              <input
                value={valor.description}
                onChange={(e) => onChange({ ...valor, description: e.target.value })}
                className="mt-1 w-full bg-white px-3 py-2 text-sm font-normal text-brand-ink min-h-11 border-2 border-brand-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
              />
            </label>
          </div>

          {/* A lo ancho y como textarea: es prosa, y es lo que el profe lee al
              lado del visor para decidir si le sirve la clase. */}
          <label className="text-xs font-bold text-brand-ink">
            ¿Para qué sirve esta clase? (objetivo)
            <textarea
              value={valor.objective}
              onChange={(e) => onChange({ ...valor, objective: e.target.value })}
              rows={3}
              placeholder="Ej. Repasar el past simple con verbos irregulares y soltar al alumno contando anécdotas en pasado. Ideal si ya vio el presente perfecto y confunde los dos."
              className="mt-1 w-full bg-white px-3 py-2 text-sm font-normal text-brand-ink min-h-11 border-2 border-brand-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
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
              className="inline-flex items-center justify-center gap-1.5 rounded-full font-bold min-h-9 px-3.5 text-[12px] border-2 border-brand-ink bg-white text-brand-ink hover:bg-brand-cream-soft hover:text-brand-ink disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
            >
              <FileUp className="size-3.5" /> Subir archivo .html
            </button>
            <button
              type="button"
              onClick={() => setPrevia((v) => !v)}
              disabled={!valor.contentHtml.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full font-bold min-h-9 px-3.5 text-[12px] border-2 border-brand-ink bg-white text-brand-ink hover:bg-brand-cream-soft hover:text-brand-ink disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
            >
              {previa ? "Ver el código" : "Ver previa"}
            </button>
            <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-xs font-bold text-brand-ink">
              <input
                type="checkbox"
                className={`size-5 accent-brand-ink ${focusRing}`}
                checked={valor.published}
                onChange={(e) => onChange({ ...valor, published: e.target.checked })}
              />
              Visible para los profes
            </label>
          </div>

          {previa ? (
            <LessonFrame title={valor.title || "Previa"} html={valor.contentHtml} />
          ) : (
            <label className="text-xs font-bold text-brand-ink">
              Contenido HTML
              <textarea
                value={valor.contentHtml}
                onChange={(e) => onChange({ ...valor, contentHtml: e.target.value })}
                rows={12}
                placeholder="<h2>Present perfect</h2><p>…</p>"
                className="mt-1 w-full bg-white px-3 py-2 font-mono font-normal text-brand-ink min-h-11 border-2 border-brand-ink text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
              />
            </label>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex items-center justify-center gap-1.5 rounded-full font-bold min-h-11 px-4 text-[13px] border-2 border-brand-ink bg-white text-brand-ink hover:bg-brand-cream-soft hover:text-brand-ink disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow">
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!puedeGuardar || pending}
              className="inline-flex items-center justify-center gap-1.5 rounded-full font-bold min-h-11 px-4 text-[13px] border-2 border-brand-ink bg-brand-ink text-brand-cream hover:text-brand-cream dark:text-white disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

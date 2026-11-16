import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, Copy, ExternalLink, FileAudio, FileText, Film, Image as ImageIcon,
  Pencil, Search, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Cargando, EstadoError, PageHeader, Vacio, btnChipInk, focusRing } from "@/components/app/AppUi";
import { btnRow, btnRowInk, inputBase, pillClass } from "@/components/teacher/TeacherUi";
import { adminApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/admin/storage")({
  head: () => ({ meta: [{ title: "Storage — Admin Freakn'" }] }),
  component: AdminStorage,
});

const QK = ["admin", "storage"] as const;

type Archivo = { key: string; size: number; lastModified: string | null; url: string };

const EXT_AUDIO = /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i;
const EXT_IMAGEN = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const EXT_VIDEO = /\.(mp4|mov|webm|mkv|avi)$/i;

function iconoDe(key: string) {
  if (EXT_AUDIO.test(key)) return FileAudio;
  if (EXT_IMAGEN.test(key)) return ImageIcon;
  if (EXT_VIDEO.test(key)) return Film;
  return FileText;
}

function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Explorador del bucket (MinIO/S3): subir, renombrar, borrar y copiar la URL
 * pública de cualquier archivo.
 *
 * Existe sobre todo por los audios: se suben aquí y se copia la URL para
 * pegarla en las lecciones, así que la clave la elige el admin (carpeta +
 * nombre) y no se le pone un uuid delante — la URL tiene que ser legible.
 */
function AdminStorage() {
  const qc = useQueryClient();
  const [carpeta, setCarpeta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [subiendo, setSubiendo] = useState(false);
  const [destino, setDestino] = useState("audio");
  const fileRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: [...QK, carpeta],
    queryFn: () => adminApi.storageList(carpeta ? { prefix: `${carpeta}/` } : {}),
  });

  const items = q.data?.items ?? [];
  const carpetas = q.data?.folders ?? [];
  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return t ? items.filter((i) => i.key.toLowerCase().includes(t)) : items;
  }, [items, busqueda]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: [...QK] });
    setSeleccion(new Set());
  };

  const borrar = useMutation({
    mutationFn: (keys: string[]) => adminApi.storageDelete(keys),
    onSuccess: (r) => {
      toast.success(`${r.eliminados} archivo(s) eliminado(s)`);
      refrescar();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  const renombrar = useMutation({
    mutationFn: (v: { from: string; to: string }) => adminApi.storageRename(v.from, v.to),
    onSuccess: () => {
      toast.success("Archivo renombrado");
      refrescar();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo renombrar"),
  });

  async function subir(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSubiendo(true);
    try {
      for (const file of Array.from(files)) {
        const sig = await adminApi.storageSign({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          folder: destino,
        });
        const put = await fetch(sig.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error(`Error subiendo ${file.name} (${put.status})`);
      }
      toast.success(`${files.length} archivo(s) subido(s) a "${destino}/"`);
      refrescar();
    } catch (e: any) {
      toast.error(e?.message ?? "Error subiendo");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function toggle(key: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrowText="Admin · Operación" title="Archivos del sitio" highlight="Archivos">
        Todos los archivos del bucket. Sube audios, imágenes o documentos y copia su URL pública para pegarla donde la
        necesites. Borrar es definitivo: si el archivo está en uso, ese lugar queda sin recurso.
      </PageHeader>

      {/* Subida */}
      <section aria-label="Subir archivos" className="border-2 border-brand-ink bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold text-brand-ink">
            Carpeta destino
            <input
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="audio"
              className={`${inputBase} mt-1 w-40 font-normal`}
            />
          </label>
          <button
            type="button"
            disabled={subiendo || !destino.trim()}
            onClick={() => fileRef.current?.click()}
            className={btnChipInk}
          >
            <Upload className="size-3.5" aria-hidden="true" /> {subiendo ? "Subiendo…" : "Subir archivos"}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => subir(e.target.files)}
          />
          <p className="text-xs text-brand-ink/70">
            El archivo queda en <code>{destino || "…"}/&lt;nombre&gt;</code>. Subir con el mismo
            nombre reemplaza el anterior y la URL no cambia.
          </p>
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/70" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar archivos por nombre"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className={`${inputBase} pl-9`}
          />
        </div>
        <div role="group" aria-label="Carpeta" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={carpeta === ""}
            onClick={() => setCarpeta("")}
            className={pillClass(carpeta === "")}
          >
            Todas
          </button>
          {carpetas.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={carpeta === c}
              onClick={() => setCarpeta(c)}
              className={pillClass(carpeta === c)}
            >
              {c}
            </button>
          ))}
        </div>
        {seleccion.size > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (!confirm(`¿Eliminar ${seleccion.size} archivo(s)? No se puede deshacer.`)) return;
              borrar.mutate([...seleccion]);
            }}
            disabled={borrar.isPending}
            className={`${btnRow} ml-auto !border-red-700 !text-red-800 hover:!bg-red-50`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" /> Eliminar {seleccion.size}
          </button>
        ) : null}
      </div>

      {/* Listado */}
      <div className="shadow-hard overflow-hidden border-2 border-brand-ink bg-white">
        {q.isLoading ? (
          <div className="p-4"><Cargando>Cargando archivos…</Cargando></div>
        ) : q.isError ? (
          <div className="p-4"><EstadoError onRetry={() => void q.refetch()}>No se pudo leer el bucket.</EstadoError></div>
        ) : filtrados.length === 0 ? (
          <div className="p-4">
            <Vacio>{busqueda ? "Sin resultados." : "No hay archivos en esta carpeta."}</Vacio>
          </div>
        ) : (
          <ul className="divide-y divide-brand-ink/15">
            {filtrados.map((f) => (
              <FilaArchivo
                key={f.key}
                archivo={f}
                seleccionado={seleccion.has(f.key)}
                onToggle={() => toggle(f.key)}
                onRenombrar={(to) => renombrar.mutate({ from: f.key, to })}
                onBorrar={() => {
                  if (!confirm(`¿Eliminar "${f.key}"? No se puede deshacer.`)) return;
                  borrar.mutate([f.key]);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {q.data?.nextCursor ? (
        <p className="text-center text-xs text-brand-ink/70">
          Mostrando los primeros {items.length} archivos de esta carpeta. Filtra por carpeta para
          ver el resto.
        </p>
      ) : null}
    </div>
  );
}

function FilaArchivo({
  archivo,
  seleccionado,
  onToggle,
  onRenombrar,
  onBorrar,
}: {
  archivo: Archivo;
  seleccionado: boolean;
  onToggle: () => void;
  onRenombrar: (to: string) => void;
  onBorrar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nuevaKey, setNuevaKey] = useState(archivo.key);
  const [copiado, setCopiado] = useState(false);
  const Icono = iconoDe(archivo.key);
  const esAudio = EXT_AUDIO.test(archivo.key);
  const esImagen = EXT_IMAGEN.test(archivo.key);

  async function copiarUrl() {
    try {
      await navigator.clipboard.writeText(archivo.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
      toast.success("URL copiada");
    } catch {
      toast.error("No se pudo copiar. Usa el botón de abrir y copia de la barra.");
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <input
        type="checkbox"
        aria-label={`Elegir ${archivo.key}`}
        checked={seleccionado}
        onChange={onToggle}
        className={`size-5 shrink-0 accent-brand-ink ${focusRing}`}
      />

      <div className="size-10 shrink-0 overflow-hidden border border-brand-ink/25 bg-brand-cream-soft">
        {esImagen ? (
          <img src={archivo.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icono className="size-4 text-brand-ink/70" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nuevaKey}
              onChange={(e) => setNuevaKey(e.target.value)}
              className={`${inputBase} min-w-0 flex-1`}
              aria-label={`Nuevo nombre de ${archivo.key}`}
            />
            <button
              type="button"
              onClick={() => {
                const to = nuevaKey.trim().replace(/^\/+/, "");
                if (!to || to === archivo.key) return setEditando(false);
                onRenombrar(to);
                setEditando(false);
              }}
              className={btnRowInk}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNuevaKey(archivo.key);
                setEditando(false);
              }}
              className={btnRow}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <div className="truncate text-sm font-bold text-brand-ink">{archivo.key}</div>
            <div className="text-xs text-brand-ink/70">
              {tamano(archivo.size)}
              {archivo.lastModified
                ? ` · ${new Date(archivo.lastModified).toLocaleString("es-CO")}`
                : ""}
            </div>
          </>
        )}
        {/* Reproductor en línea: al subir un audio se puede comprobar de una
            que es el correcto antes de copiar la URL. */}
        {esAudio && !editando ? (
          <audio src={archivo.url} controls preload="none" className="mt-1.5 h-8 w-full max-w-sm" />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copiarUrl}
          title="Copiar URL pública"
          aria-label={`Copiar URL pública de ${archivo.key}`}
          className="inline-grid size-9 place-items-center rounded-full text-brand-ink hover:bg-brand-cream-soft disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
        >
          {copiado ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        </button>
        <a
          href={archivo.url}
          target="_blank"
          rel="noreferrer"
          title="Abrir en pestaña nueva"
          aria-label={`Abrir ${archivo.key} en pestaña nueva`}
          className="inline-grid size-9 place-items-center rounded-full text-brand-ink hover:bg-brand-cream-soft disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          title="Renombrar / mover"
          aria-label={`Renombrar o mover ${archivo.key}`}
          className="inline-grid size-9 place-items-center rounded-full text-brand-ink hover:bg-brand-cream-soft disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onBorrar}
          title="Eliminar"
          aria-label={`Eliminar ${archivo.key}`}
          className="inline-grid size-9 place-items-center rounded-full text-red-800 hover:bg-red-50 disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

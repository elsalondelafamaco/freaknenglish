import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, Copy, ExternalLink, FileAudio, FileText, Film, Image as ImageIcon,
  Pencil, Search, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
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
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Storage</h1>
        <p className="mt-1 text-sm text-brand-ink/60">
          Todos los archivos del bucket. Sube audios, imágenes o documentos y copia su URL pública
          para pegarla donde la necesites. Borrar es definitivo: si el archivo está en uso, ese
          lugar queda sin recurso.
        </p>
      </header>

      {/* Subida */}
      <section className="rounded-2xl border border-brand-line bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-brand-ink/70">
            Carpeta destino
            <input
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="audio"
              className="mt-1 w-40 rounded-xl border border-brand-line px-3 py-2 text-sm font-normal focus:border-brand-ink focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={subiendo || !destino.trim()}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Upload className="size-3.5" /> {subiendo ? "Subiendo…" : "Subir archivos"}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => subir(e.target.files)}
          />
          <p className="text-[11px] text-brand-ink/50">
            El archivo queda en <code>{destino || "…"}/&lt;nombre&gt;</code>. Subir con el mismo
            nombre reemplaza el anterior y la URL no cambia.
          </p>
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full rounded-full border border-brand-line bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-ink focus:outline-none"
          />
        </div>
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-brand-line bg-white p-1 text-xs">
          <button
            onClick={() => setCarpeta("")}
            className={`rounded-full px-3 py-1.5 font-medium transition ${carpeta === "" ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:text-brand-ink"}`}
          >
            Todas
          </button>
          {carpetas.map((c) => (
            <button
              key={c}
              onClick={() => setCarpeta(c)}
              className={`rounded-full px-3 py-1.5 font-medium transition ${carpeta === c ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:text-brand-ink"}`}
            >
              {c}
            </button>
          ))}
        </div>
        {seleccion.size > 0 ? (
          <button
            onClick={() => {
              if (!confirm(`¿Eliminar ${seleccion.size} archivo(s)? No se puede deshacer.`)) return;
              borrar.mutate([...seleccion]);
            }}
            disabled={borrar.isPending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            <Trash2 className="size-3.5" /> Eliminar {seleccion.size}
          </button>
        ) : null}
      </div>

      {/* Listado */}
      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
        {q.isLoading ? (
          <p className="p-6 text-sm text-brand-ink/55">Cargando archivos…</p>
        ) : q.isError ? (
          <p className="p-6 text-sm text-red-600">No se pudo leer el bucket.</p>
        ) : filtrados.length === 0 ? (
          <p className="p-6 text-sm text-brand-ink/55">
            {busqueda ? "Sin resultados." : "No hay archivos en esta carpeta."}
          </p>
        ) : (
          <ul className="divide-y divide-brand-line">
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
        <p className="text-center text-xs text-brand-ink/50">
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
      <input type="checkbox" checked={seleccionado} onChange={onToggle} className="shrink-0" />

      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-brand-cream/60">
        {esImagen ? (
          <img src={archivo.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icono className="size-4 text-brand-ink/45" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nuevaKey}
              onChange={(e) => setNuevaKey(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-brand-line px-2 py-1 text-xs focus:border-brand-ink focus:outline-none"
            />
            <button
              onClick={() => {
                const to = nuevaKey.trim().replace(/^\/+/, "");
                if (!to || to === archivo.key) return setEditando(false);
                onRenombrar(to);
                setEditando(false);
              }}
              className="rounded-full bg-brand-ink px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              Guardar
            </button>
            <button
              onClick={() => {
                setNuevaKey(archivo.key);
                setEditando(false);
              }}
              className="rounded-full border border-brand-line px-2.5 py-1 text-[11px] font-semibold text-brand-ink/70"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <div className="truncate text-sm font-medium text-brand-ink">{archivo.key}</div>
            <div className="text-[11px] text-brand-ink/50">
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
          onClick={copiarUrl}
          title="Copiar URL pública"
          className="rounded-full border border-brand-line p-1.5 text-brand-ink/70 transition hover:bg-brand-cream/50"
        >
          {copiado ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
        </button>
        <a
          href={archivo.url}
          target="_blank"
          rel="noreferrer"
          title="Abrir en pestaña nueva"
          className="rounded-full border border-brand-line p-1.5 text-brand-ink/70 transition hover:bg-brand-cream/50"
        >
          <ExternalLink className="size-3.5" />
        </a>
        <button
          onClick={() => setEditando((v) => !v)}
          title="Renombrar / mover"
          className="rounded-full border border-brand-line p-1.5 text-brand-ink/70 transition hover:bg-brand-cream/50"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={onBorrar}
          title="Eliminar"
          className="rounded-full border border-brand-line p-1.5 text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

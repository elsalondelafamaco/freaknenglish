import { useEffect, useState } from "react";
import { History, Save, X } from "lucide-react";
import { toast } from "sonner";
import { boardsApi } from "@/lib/api/endpoints";

export function VersionHistory({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    boardsApi.listVersions(pageId).then(setItems).catch(() => setItems([]));
  }, [open, pageId]);

  async function save() {
    setBusy(true);
    try {
      await boardsApi.saveVersion(pageId, label.trim() || undefined);
      setLabel("");
      const fresh = await boardsApi.listVersions(pageId);
      setItems(fresh);
      toast.success("Versión guardada");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    if (!confirm("¿Restaurar esta versión? Se perderán los cambios posteriores.")) return;
    setBusy(true);
    try {
      await boardsApi.restoreVersion(id);
      toast.success("Versión restaurada. Recargando…");
      setTimeout(() => window.location.reload(), 400);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo restaurar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-brand-line px-3 py-1 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
      >
        <History className="size-3.5" /> Versiones
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-brand-ink/40 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-ink">Historial de versiones</h3>
              <button onClick={() => setOpen(false)} className="text-brand-ink/40 hover:text-brand-ink"><X className="size-4" /></button>
            </header>

            <div className="mb-4 flex gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Etiqueta (opcional)"
                className="flex-1 rounded-lg border border-brand-line px-3 py-1.5 text-sm outline-none focus:border-brand-ink"
              />
              <button
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                <Save className="size-3.5" /> Guardar
              </button>
            </div>

            <ul className="max-h-72 space-y-1 overflow-auto">
              {items === null ? <li className="text-xs text-brand-ink/50">Cargando…</li> : null}
              {items && items.length === 0 ? <li className="text-xs text-brand-ink/50">Sin versiones guardadas.</li> : null}
              {items?.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-lg border border-brand-line p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand-ink">{v.label || "Sin etiqueta"}</p>
                    <p className="text-[11px] text-brand-ink/55">
                      {new Date(v.createdAt).toLocaleString()} · {(v.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => restore(v.id)}
                    disabled={busy}
                    className="rounded-full border border-brand-line px-2.5 py-1 text-[11px] font-semibold text-brand-ink hover:bg-brand-cream/40"
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

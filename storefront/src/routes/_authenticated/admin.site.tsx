import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, GripVertical, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type SiteFaq } from "@/lib/api/endpoints";
import { DEFAULT_FAQS, DEFAULT_SITE_CONTENT, MEDIA_SLOTS } from "@/lib/site-content";

export const Route = createFileRoute("/_authenticated/admin/site")({
  head: () => ({ meta: [{ title: "Contenido del sitio — Admin Freakn'" }] }),
  component: AdminSite,
});

const QK = ["admin", "site-content"] as const;

function AdminSite() {
  const q = useQuery({ queryKey: QK, queryFn: () => adminApi.siteContent() });

  if (q.isLoading) return <p className="text-sm text-brand-ink/60">Cargando…</p>;
  if (q.isError) return <p className="text-sm text-red-600">No se pudo cargar el contenido del sitio.</p>;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-ink">Contenido de la home</h2>
        <p className="text-xs text-brand-ink/55">
          Imágenes, videos, preguntas frecuentes, documentos legales y redes. La home tiene
          respaldos quemados: si un recurso no está configurado (o la API se cae), se muestra el
          contenido por defecto y el sitio nunca se rompe.
        </p>
      </div>
      <MediaCard overrides={q.data!.media} />
      <FaqCard current={q.data!.faqs} />
      <LegalCard legal={q.data!.legal} />
      <SocialCard social={q.data!.social} />
    </div>
  );
}

/** Sube el archivo a MinIO con clave estable `site/<slot>` y devuelve la URL pública versionada. */
async function uploadSiteAsset(slot: string, file: File): Promise<string> {
  const sig = await adminApi.signSiteUpload({ filename: file.name, contentType: file.type, siteSlot: slot });
  const put = await fetch(sig.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error(`Error subiendo el archivo (${put.status})`);
  // `?v=` rompe cache del navegador: la clave (y la URL base) es siempre la misma.
  return `${sig.publicUrl}?v=${Date.now()}`;
}

// ─── Media (imágenes y videos de la home) ─────────────────────────────────
function MediaCard({ overrides }: { overrides: Record<string, string> }) {
  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5">
      <h3 className="text-sm font-semibold text-brand-ink">Imágenes y videos</h3>
      <p className="text-xs text-brand-ink/55">
        Cada recurso indica dónde aparece en la home. Reemplazar un archivo mantiene la misma URL
        (MinIO) — el cambio se ve de inmediato. Los slots de video sin archivo no muestran botón de
        play en la home.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {MEDIA_SLOTS.map((slot) => (
          <MediaSlotRow key={slot.id} slot={slot} currentUrl={overrides[slot.id]} />
        ))}
      </div>
    </section>
  );
}

function MediaSlotRow({
  slot,
  currentUrl,
}: {
  slot: (typeof MEDIA_SLOTS)[number];
  currentUrl?: string;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const defaultUrl = DEFAULT_SITE_CONTENT.media[slot.id];
  const effective = currentUrl ?? defaultUrl;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadSiteAsset(slot.id, file);
      await adminApi.updateSiteContent({ media: { [slot.id]: url } });
      toast.success(`${slot.label} actualizado`);
      qc.invalidateQueries({ queryKey: [...QK] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error subiendo el archivo");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function restoreDefault() {
    setBusy(true);
    try {
      await adminApi.updateSiteContent({ media: { [slot.id]: null } });
      toast.success("Se restauró el contenido por defecto");
      qc.invalidateQueries({ queryKey: [...QK] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-3 rounded-xl border border-brand-line p-3">
      <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-brand-cream/60">
        {effective ? (
          slot.kind === "video" ? (
            <video src={effective} muted playsInline className="h-full w-full object-cover" />
          ) : (
            <img src={effective} alt={slot.label} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-brand-ink/40">Sin archivo</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-brand-ink">{slot.label}</span>
          {currentUrl ? (
            <span className="rounded-full bg-brand-yellow/50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-ink">personalizado</span>
          ) : (
            <span className="rounded-full bg-brand-cream px-1.5 py-0.5 text-[9px] font-semibold text-brand-ink/60">default</span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-brand-ink/55">{slot.where}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-full bg-brand-ink px-2.5 py-1 text-[11px] font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            <Upload className="size-3" /> {busy ? "Subiendo…" : currentUrl ? "Reemplazar" : "Subir"}
          </button>
          {currentUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={restoreDefault}
              className="inline-flex items-center gap-1 rounded-full border border-brand-line px-2.5 py-1 text-[11px] font-semibold text-brand-ink/70 transition hover:bg-brand-cream/50 disabled:opacity-60"
            >
              <RotateCcw className="size-3" /> Restaurar default
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept={slot.kind === "video" ? "video/*" : "image/*"}
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </div>
    </div>
  );
}

// ─── FAQs ─────────────────────────────────────────────────────────────────
function FaqCard({ current }: { current: SiteFaq[] | null }) {
  const qc = useQueryClient();
  const [faqs, setFaqs] = useState<SiteFaq[]>(current ?? DEFAULT_FAQS);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setFaqs(current ?? DEFAULT_FAQS);
    setDirty(false);
  }, [current]);

  const saveM = useMutation({
    mutationFn: (next: SiteFaq[] | null) => adminApi.updateSiteContent({ faqs: next }),
    onSuccess: () => {
      toast.success("Preguntas frecuentes guardadas");
      qc.invalidateQueries({ queryKey: [...QK] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const edit = (i: number, patch: Partial<SiteFaq>) => {
    setFaqs((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    setFaqs((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  const valid = faqs.every((f) => f.q.trim() && f.a.trim());

  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5">
      <h3 className="text-sm font-semibold text-brand-ink">Preguntas frecuentes</h3>
      <p className="text-xs text-brand-ink/55">
        Se muestran en la sección FAQ de la home. Si la API no responde, la home usa las preguntas
        por defecto quemadas en el sitio.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {faqs.map((f, i) => (
          <div key={i} className="rounded-xl border border-brand-line p-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center gap-0.5 pt-1 text-brand-ink/40">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30" aria-label="Subir">▲</button>
                <GripVertical className="size-3.5" />
                <button type="button" onClick={() => move(i, 1)} disabled={i === faqs.length - 1} className="disabled:opacity-30" aria-label="Bajar">▼</button>
              </div>
              <div className="flex-1">
                <input
                  value={f.q}
                  onChange={(e) => edit(i, { q: e.target.value })}
                  placeholder="Pregunta"
                  className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm font-semibold focus:border-brand-ink focus:outline-none"
                />
                <textarea
                  value={f.a}
                  onChange={(e) => edit(i, { a: e.target.value })}
                  placeholder="Respuesta"
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setFaqs((prev) => prev.filter((_, j) => j !== i));
                  setDirty(true);
                }}
                className="rounded-full p-1.5 text-brand-ink/40 transition hover:bg-red-50 hover:text-red-600"
                aria-label="Eliminar pregunta"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setFaqs((prev) => [...prev, { q: "", a: "" }]);
            setDirty(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-line px-4 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-cream/50"
        >
          <Plus className="size-3.5" /> Agregar pregunta
        </button>
        <button
          type="button"
          onClick={() => saveM.mutate(faqs)}
          disabled={saveM.isPending || !dirty || !valid}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          <Save className="size-3.5" /> {saveM.isPending ? "Guardando…" : "Guardar preguntas"}
        </button>
        <button
          type="button"
          onClick={() => saveM.mutate(null)}
          disabled={saveM.isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-line px-4 py-2 text-xs font-semibold text-brand-ink/70 transition hover:bg-brand-cream/50 disabled:opacity-60"
        >
          <RotateCcw className="size-3.5" /> Restaurar predeterminadas
        </button>
      </div>
      {!valid ? <p className="mt-2 text-[11px] text-red-600">Hay preguntas o respuestas vacías.</p> : null}
    </section>
  );
}

// ─── Legal (PDFs) ─────────────────────────────────────────────────────────
const LEGAL_DOCS = [
  { key: "privacy", slot: "legal-privacy", label: "Política de privacidad" },
  { key: "terms", slot: "legal-terms", label: "Términos y condiciones" },
] as const;

function LegalCard({ legal }: { legal: Record<string, string> }) {
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function onFile(doc: (typeof LEGAL_DOCS)[number], file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Debe ser un PDF");
      return;
    }
    setBusyKey(doc.key);
    try {
      const url = await uploadSiteAsset(doc.slot, file);
      await adminApi.updateSiteContent({ legal: { [doc.key]: url } });
      toast.success(`${doc.label} actualizado`);
      qc.invalidateQueries({ queryKey: [...QK] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error subiendo el PDF");
    } finally {
      setBusyKey(null);
    }
  }

  async function clearDoc(doc: (typeof LEGAL_DOCS)[number]) {
    setBusyKey(doc.key);
    try {
      await adminApi.updateSiteContent({ legal: { [doc.key]: null } });
      toast.success(`${doc.label} eliminado del footer`);
      qc.invalidateQueries({ queryKey: [...QK] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5">
      <h3 className="text-sm font-semibold text-brand-ink">Documentos legales (PDF)</h3>
      <p className="text-xs text-brand-ink/55">
        Aparecen en el footer de la home y en los checkboxes de aceptación del checkout/registro.
        Se abren en pestaña aparte (no se descargan). Sin documento, el link no se muestra.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {LEGAL_DOCS.map((doc) => {
          const url = legal[doc.key];
          const busy = busyKey === doc.key;
          return (
            <div key={doc.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-line p-3">
              <FileText className="size-4 shrink-0 text-brand-ink/60" />
              <span className="min-w-40 text-sm font-semibold text-brand-ink">{doc.label}</span>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-ink/70 underline hover:text-brand-ink">
                  Ver PDF actual <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="text-xs text-brand-ink/45">Sin documento — no se muestra en el sitio</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-brand-ink px-2.5 py-1 text-[11px] font-semibold text-white transition hover:-translate-y-0.5">
                  <Upload className="size-3" /> {busy ? "Subiendo…" : url ? "Reemplazar" : "Subir PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => onFile(doc, e.target.files?.[0] ?? undefined)}
                  />
                </label>
                {url ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => clearDoc(doc)}
                    className="rounded-full p-1.5 text-brand-ink/40 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    aria-label={`Quitar ${doc.label}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Redes sociales ──────────────────────────────────────────────────────
function SocialCard({ social }: { social: Record<string, string> }) {
  const qc = useQueryClient();
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  useEffect(() => {
    setInstagram(social.instagram ?? DEFAULT_SITE_CONTENT.social.instagram ?? "");
    setFacebook(social.facebook ?? DEFAULT_SITE_CONTENT.social.facebook ?? "");
  }, [social]);

  const saveM = useMutation({
    mutationFn: () =>
      adminApi.updateSiteContent({
        social: { instagram: instagram.trim() || null, facebook: facebook.trim() || null },
      }),
    onSuccess: () => {
      toast.success("Redes actualizadas");
      qc.invalidateQueries({ queryKey: [...QK] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5">
      <h3 className="text-sm font-semibold text-brand-ink">Redes sociales</h3>
      <p className="text-xs text-brand-ink/55">Links de la columna “Síguenos” del footer. Vacío = no se muestra.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Instagram
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="https://www.instagram.com/freaknenglish/"
            className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Facebook
          <input
            value={facebook}
            onChange={(e) => setFacebook(e.target.value)}
            placeholder="https://www.facebook.com/freaknenglish"
            className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => saveM.mutate()}
        disabled={saveM.isPending}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
      >
        <Save className="size-3.5" /> {saveM.isPending ? "Guardando…" : "Guardar redes"}
      </button>
    </section>
  );
}

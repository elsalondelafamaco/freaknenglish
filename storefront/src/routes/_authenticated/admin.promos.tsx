import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type PromoAdmin, type PromoInput } from "@/lib/api/endpoints";
import { formatCop } from "@/lib/domain/plans";
import { textoBadge } from "@/lib/domain/promos";
import { textoDeBanner } from "@/components/site/PromoBanner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/promos")({
  head: () => ({ meta: [{ title: "Promociones — Admin Freakn'" }] }),
  component: AdminPromos,
});

// ─── Fechas: el negocio vive en Bogotá (UTC-5, sin horario de verano) ──────
// El `datetime-local` no lleva zona, así que se interpreta SIEMPRE como hora de
// Bogotá, sin importar desde dónde entre el admin.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
/** ISO (UTC) → "YYYY-MM-DDTHH:mm" en hora de Bogotá, para el input. */
const isoALocalBogota = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 16) : "";
/** "YYYY-MM-DDTHH:mm" (hora de Bogotá) → ISO (UTC). */
const localBogotaAIso = (local: string) => (local ? new Date(`${local}:00-05:00`).toISOString() : null);
const fechaBogota = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }) : null;

const ESTADOS: Record<PromoAdmin["estado"], { label: string; cls: string }> = {
  activa: { label: "Activa", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  programada: { label: "Programada", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  vencida: { label: "Vencida", cls: "bg-neutral-100 text-neutral-600 border-neutral-200" },
  pausada: { label: "Pausada", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  agotada: { label: "Agotada", cls: "bg-red-50 text-red-700 border-red-200" },
};

function resumenDescuento(p: Pick<PromoAdmin, "discountType" | "discountValue">) {
  if (p.discountType === "PERCENT") return `${p.discountValue}% de descuento`;
  if (p.discountType === "USD") return `US$${p.discountValue} de descuento`;
  return `${formatCop(p.discountValue)} de descuento`;
}

// ─── Formulario ─────────────────────────────────────────────────────────────
type Form = {
  name: string;
  isActive: boolean;
  priority: string;
  discountType: "PERCENT" | "USD" | "COP";
  discountValue: string;
  planIds: string[];
  appliesToNew: boolean;
  appliesToRenewals: boolean;
  startsAt: string;
  endsAt: string;
  audience: "ALL" | "LINK";
  code: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  showBanner: boolean;
  showOnPrices: boolean;
  bannerText: string;
  badgeText: string;
  checkoutLabel: string;
  bgColor: string;
  textColor: string;
  showCountdown: boolean;
  maxRedemptions: string;
};

const FORM_VACIO: Form = {
  name: "",
  isActive: true,
  priority: "0",
  discountType: "PERCENT",
  discountValue: "",
  planIds: [],
  appliesToNew: true,
  appliesToRenewals: false,
  startsAt: "",
  endsAt: "",
  audience: "ALL",
  code: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  showBanner: false,
  showOnPrices: false,
  bannerText: "",
  badgeText: "",
  checkoutLabel: "",
  bgColor: "#EBD81A",
  textColor: "#111111",
  showCountdown: false,
  maxRedemptions: "",
};

const formDe = (p: PromoAdmin): Form => ({
  name: p.name,
  isActive: p.isActive,
  priority: String(p.priority),
  discountType: p.discountType,
  discountValue: String(p.discountValue),
  planIds: p.planIds,
  appliesToNew: p.appliesToNew,
  appliesToRenewals: p.appliesToRenewals,
  startsAt: isoALocalBogota(p.startsAt),
  endsAt: isoALocalBogota(p.endsAt),
  audience: p.audience,
  code: p.code ?? "",
  utmSource: p.utmSource ?? "",
  utmMedium: p.utmMedium ?? "",
  utmCampaign: p.utmCampaign ?? "",
  showBanner: p.showBanner,
  showOnPrices: p.showOnPrices,
  bannerText: p.bannerText ?? "",
  badgeText: p.badgeText ?? "",
  checkoutLabel: p.checkoutLabel ?? "",
  bgColor: p.bgColor,
  textColor: p.textColor,
  showCountdown: p.showCountdown,
  maxRedemptions: p.maxRedemptions === null ? "" : String(p.maxRedemptions),
});

const textoONulo = (s: string) => s.trim() || null;

/** El cuerpo que espera el backend; si algo no cuadra, devuelve el mensaje para el admin. */
function payloadDe(f: Form): { body: PromoInput } | { error: string } {
  const valor = Number(f.discountValue);
  if (!f.name.trim()) return { error: "Ponle un nombre interno a la promoción." };
  if (!Number.isInteger(valor) || valor <= 0) return { error: "El descuento debe ser un número entero positivo." };
  if (f.discountType === "PERCENT" && (valor < 1 || valor > 90)) return { error: "El porcentaje debe estar entre 1 y 90." };
  const max = f.maxRedemptions.trim() ? Number(f.maxRedemptions) : null;
  if (max !== null && (!Number.isInteger(max) || max < 1)) return { error: "El límite de usos debe ser 1 o más." };
  const prioridad = Number(f.priority || 0);
  if (!Number.isInteger(prioridad)) return { error: "La prioridad debe ser un número entero." };
  const startsAt = localBogotaAIso(f.startsAt);
  const endsAt = localBogotaAIso(f.endsAt);
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return { error: "El fin debe ser posterior al inicio." };
  if (f.audience === "LINK" && !f.code.trim() && !f.utmSource.trim() && !f.utmMedium.trim() && !f.utmCampaign.trim()) {
    return { error: "Para “Solo con enlace” define un código o al menos un parámetro UTM." };
  }
  return {
    body: {
      name: f.name.trim(),
      isActive: f.isActive,
      priority: prioridad,
      discountType: f.discountType,
      discountValue: valor,
      planIds: f.planIds,
      appliesToNew: f.appliesToNew,
      appliesToRenewals: f.appliesToRenewals,
      startsAt,
      endsAt,
      audience: f.audience,
      code: textoONulo(f.code),
      utmSource: textoONulo(f.utmSource),
      utmMedium: textoONulo(f.utmMedium),
      utmCampaign: textoONulo(f.utmCampaign),
      showBanner: f.showBanner,
      showOnPrices: f.showOnPrices,
      bannerText: textoONulo(f.bannerText),
      badgeText: textoONulo(f.badgeText),
      checkoutLabel: textoONulo(f.checkoutLabel),
      bgColor: f.bgColor,
      textColor: f.textColor,
      showCountdown: f.showCountdown,
      maxRedemptions: max,
    },
  };
}

const inputCls =
  "mt-1 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none";

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5">
      <h3 className="text-sm font-semibold text-brand-ink">{titulo}</h3>
      {ayuda ? <p className="text-xs text-brand-ink/55">{ayuda}</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Campo({ label, children, ancho }: { label: string; children: ReactNode; ancho?: boolean }) {
  return (
    <label className={cn("block text-xs font-semibold text-brand-ink/70", ancho && "md:col-span-2")}>
      {label}
      {children}
    </label>
  );
}

function Interruptor({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-brand-ink/85">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-brand-ink" />
      <span>{children}</span>
    </label>
  );
}

function Copiable({ etiqueta, url }: { etiqueta: string; url: string }) {
  return (
    <div className="md:col-span-2">
      <div className="text-xs font-semibold text-brand-ink/70">{etiqueta}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-brand-surface px-3 py-2 text-xs text-brand-ink">{url}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(
              () => toast.success("Enlace copiado"),
              () => toast.error("No se pudo copiar"),
            );
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-line px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-surface"
        >
          <Copy className="size-3.5" /> Copiar
        </button>
      </div>
    </div>
  );
}

function PromoForm({
  inicial,
  planes,
  guardando,
  onGuardar,
  onCancelar,
}: {
  inicial: Form;
  planes: Array<{ id: string; name: string }>;
  guardando: boolean;
  onGuardar: (body: PromoInput) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<Form>(inicial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const origen = typeof window !== "undefined" ? window.location.origin : "https://freaknenglish.com";

  const enlaceCodigo = f.code.trim() ? `${origen}/?promo=${encodeURIComponent(f.code.trim())}` : null;
  const enlaceUtm = useMemo(() => {
    const sp = new URLSearchParams();
    if (f.utmSource.trim()) sp.set("utm_source", f.utmSource.trim());
    if (f.utmMedium.trim()) sp.set("utm_medium", f.utmMedium.trim());
    if (f.utmCampaign.trim()) sp.set("utm_campaign", f.utmCampaign.trim());
    return sp.toString() ? `${origen}/?${sp.toString()}` : null;
  }, [f.utmSource, f.utmMedium, f.utmCampaign, origen]);

  const vistaPrevia = {
    bannerText: f.bannerText.trim() || null,
    badgeText: f.badgeText.trim() || null,
    discountType: f.discountType,
    discountValue: Number(f.discountValue) || 0,
  };

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const r = payloadDe(f);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    onGuardar(r.body);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <Seccion titulo="Descuento">
        <Campo label="Nombre interno (solo lo ves tú)" ancho>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="Black Friday 2026" className={inputCls} />
        </Campo>
        <Campo label="Tipo">
          <select value={f.discountType} onChange={(e) => set("discountType", e.target.value as Form["discountType"])} className={inputCls}>
            <option value="PERCENT">Porcentaje (%)</option>
            <option value="USD">Monto fijo en USD</option>
            <option value="COP">Monto fijo en COP</option>
          </select>
        </Campo>
        <Campo label={f.discountType === "PERCENT" ? "Porcentaje (1 a 90)" : f.discountType === "USD" ? "USD a descontar (enteros)" : "Pesos a descontar"}>
          <input type="number" min={1} step={1} value={f.discountValue} onChange={(e) => set("discountValue", e.target.value)} className={inputCls} />
        </Campo>
        <p className="text-[11px] text-brand-ink/50 md:col-span-2">
          El precio final nunca baja de {formatCop(5000)}. Si hay varias promos para un plan, se aplica la que más descuenta; en empate, la de mayor prioridad.
        </p>
        <Campo label="Prioridad (desempate)">
          <input type="number" step={1} value={f.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls} />
        </Campo>
      </Seccion>

      <Seccion titulo="Planes y quién aplica">
        <div className="md:col-span-2">
          <div className="text-xs font-semibold text-brand-ink/70">Planes (sin marcar = todos)</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {planes.map((p) => {
              const on = f.planIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set("planIds", on ? f.planIds.filter((x) => x !== p.id) : [...f.planIds, p.id])}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", on ? "bg-brand-ink text-white" : "border border-brand-line text-brand-ink/70")}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
        <Interruptor checked={f.appliesToNew} onChange={(v) => set("appliesToNew", v)}>Aplica a compras nuevas</Interruptor>
        <Interruptor checked={f.appliesToRenewals} onChange={(v) => set("appliesToRenewals", v)}>Aplica a renovaciones</Interruptor>
      </Seccion>

      <Seccion titulo="Vigencia" ayuda="Hora de Colombia (Bogotá). Déjalo vacío para no limitar.">
        <Campo label="Empieza">
          <input type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Termina">
          <input type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={inputCls} />
        </Campo>
      </Seccion>

      <Seccion titulo="Quién la recibe">
        <div className="flex flex-wrap gap-4 md:col-span-2">
          <label className="flex items-center gap-2 text-sm text-brand-ink/85">
            <input type="radio" name="audiencia" checked={f.audience === "ALL"} onChange={() => set("audience", "ALL")} className="accent-brand-ink" />
            Todos los visitantes
          </label>
          <label className="flex items-center gap-2 text-sm text-brand-ink/85">
            <input type="radio" name="audiencia" checked={f.audience === "LINK"} onChange={() => set("audience", "LINK")} className="accent-brand-ink" />
            Solo con enlace
          </label>
        </div>
        {f.audience === "LINK" ? (
          <>
            <p className="text-[11px] text-brand-ink/50 md:col-span-2">
              Le toca a quien llegue con este código (<code>?promo=</code>), o con TODOS los UTM que definas. Cualquiera de las dos vías basta. No distingue mayúsculas.
            </p>
            <Campo label="Código (?promo=)">
              <input value={f.code} onChange={(e) => set("code", e.target.value)} maxLength={40} placeholder="BLACK26" className={inputCls} />
            </Campo>
            <span className="hidden md:block" />
            <Campo label="utm_source">
              <input value={f.utmSource} onChange={(e) => set("utmSource", e.target.value)} maxLength={100} placeholder="instagram" className={inputCls} />
            </Campo>
            <Campo label="utm_medium">
              <input value={f.utmMedium} onChange={(e) => set("utmMedium", e.target.value)} maxLength={100} placeholder="paid" className={inputCls} />
            </Campo>
            <Campo label="utm_campaign">
              <input value={f.utmCampaign} onChange={(e) => set("utmCampaign", e.target.value)} maxLength={100} placeholder="black-friday" className={inputCls} />
            </Campo>
            {enlaceCodigo ? <Copiable etiqueta="Enlace con código" url={enlaceCodigo} /> : null}
            {enlaceUtm ? <Copiable etiqueta="Enlace con UTM" url={enlaceUtm} /> : null}
          </>
        ) : null}
      </Seccion>

      <Seccion titulo="Visibilidad en la web" ayuda="Si no marcas ninguna, la promo es “silenciosa”: se aplica y se ve en el resumen del pago, pero no se anuncia.">
        <Interruptor checked={f.showBanner} onChange={(v) => set("showBanner", v)}>Barra de anuncio arriba de la home</Interruptor>
        <Interruptor checked={f.showOnPrices} onChange={(v) => set("showOnPrices", v)}>Precio tachado e insignia en los planes de la home (en el checkout el descuento se ve siempre)</Interruptor>
        <Interruptor checked={f.showCountdown} onChange={(v) => set("showCountdown", v)}>Cuenta regresiva en la barra (necesita fecha de fin)</Interruptor>
      </Seccion>

      <Seccion titulo="Textos y colores">
        <Campo label="Texto de la barra (opcional)" ancho>
          <input value={f.bannerText} onChange={(e) => set("bannerText", e.target.value)} maxLength={200} placeholder="Black Friday: 20% de descuento en todos los planes" className={inputCls} />
        </Campo>
        <Campo label="Texto de la insignia (por defecto: el descuento)">
          <input value={f.badgeText} onChange={(e) => set("badgeText", e.target.value)} maxLength={40} placeholder="-20%" className={inputCls} />
        </Campo>
        <Campo label="Etiqueta en el resumen del pago">
          <input value={f.checkoutLabel} onChange={(e) => set("checkoutLabel", e.target.value)} maxLength={60} placeholder="Descuento" className={inputCls} />
        </Campo>
        <Campo label="Color de fondo">
          <div className="mt-1 flex items-center gap-2">
            <input type="color" value={f.bgColor} onChange={(e) => set("bgColor", e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded-lg border border-brand-line bg-white p-1" />
            <code className="text-xs">{f.bgColor}</code>
          </div>
        </Campo>
        <Campo label="Color del texto">
          <div className="mt-1 flex items-center gap-2">
            <input type="color" value={f.textColor} onChange={(e) => set("textColor", e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded-lg border border-brand-line bg-white p-1" />
            <code className="text-xs">{f.textColor}</code>
          </div>
        </Campo>
        <div className="md:col-span-2">
          <div className="text-xs font-semibold text-brand-ink/70">Vista previa</div>
          <div
            className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl px-4 py-2.5 text-center text-[13px] font-semibold"
            style={{ backgroundColor: f.bgColor, color: f.textColor }}
          >
            <span>{textoDeBanner(vistaPrevia)}</span>
            {f.showCountdown ? (
              <span className="rounded-full border px-2.5 py-0.5 font-mono text-[12px]" style={{ borderColor: f.textColor }}>
                02d 05h 12m
              </span>
            ) : null}
            <span className="underline underline-offset-2">Ver planes →</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[16px] font-bold text-brand-ink/50 line-through">$30 USD</span>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]"
              style={{ backgroundColor: f.bgColor, color: f.textColor }}
            >
              {textoBadge(vistaPrevia)}
            </span>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Límite de usos" ayuda="Cuenta los pagos aprobados que llevan esta promo. Vacío = sin límite.">
        <Campo label="Máximo de usos">
          <input type="number" min={1} step={1} value={f.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} placeholder="Sin límite" className={inputCls} />
        </Campo>
        <div className="flex items-end">
          <Interruptor checked={f.isActive} onChange={(v) => set("isActive", v)}>Promoción encendida</Interruptor>
        </div>
      </Seccion>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={guardando} className="rounded-full bg-brand-ink px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar promoción"}
        </button>
        <button type="button" onClick={onCancelar} className="rounded-full border border-brand-line px-5 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-surface">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Pantalla ───────────────────────────────────────────────────────────────
function AdminPromos() {
  const qc = useQueryClient();
  const promosQ = useQuery({ queryKey: ["admin", "promos"], queryFn: () => adminApi.promos() });
  const plansQ = useQuery({ queryKey: ["admin", "plans"], queryFn: () => adminApi.plans() });
  // null = lista; "nueva" = formulario vacío; una promo = editándola.
  const [editando, setEditando] = useState<null | "nueva" | PromoAdmin>(null);

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "promos"] });
    // El sitio y el checkout leen las promos públicas: que se vean los cambios ya.
    void qc.invalidateQueries({ queryKey: ["promos"] });
  };
  const errorDe = (e: any) => toast.error(e?.message ?? "Error");

  const guardarM = useMutation({
    mutationFn: (body: PromoInput) =>
      editando && editando !== "nueva" ? adminApi.actualizarPromo(editando.id, body) : adminApi.crearPromo(body),
    onSuccess: () => {
      toast.success("Promoción guardada");
      setEditando(null);
      refrescar();
    },
    onError: errorDe,
  });
  const pausarM = useMutation({
    mutationFn: (p: PromoAdmin) => adminApi.actualizarPromo(p.id, { isActive: !p.isActive }),
    onSuccess: refrescar,
    onError: errorDe,
  });
  const borrarM = useMutation({
    mutationFn: (id: string) => adminApi.borrarPromo(id),
    onSuccess: () => {
      toast.success("Promoción eliminada");
      refrescar();
    },
    onError: errorDe,
  });

  const planes = ((plansQ.data ?? []) as any[]).map((p) => ({ id: p.id as string, name: (p.name as string) ?? p.id }));
  const nombrePlan = (id: string) => planes.find((p) => p.id === id)?.name ?? id;

  if (editando) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-brand-ink">{editando === "nueva" ? "Nueva promoción" : `Editar: ${editando.name}`}</h2>
        </div>
        <PromoForm
          // La clave reinicia el formulario al cambiar de promo.
          key={editando === "nueva" ? "nueva" : editando.id}
          inicial={editando === "nueva" ? FORM_VACIO : formDe(editando)}
          planes={planes}
          guardando={guardarM.isPending}
          onGuardar={(body) => guardarM.mutate(body)}
          onCancelar={() => setEditando(null)}
        />
      </div>
    );
  }

  const promos = promosQ.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-ink">Promociones</h2>
          <p className="text-xs text-brand-ink/55">
            Descuentos con fechas, planes y público. El precio se calcula en el servidor: lo que ve la persona es lo que se cobra.
          </p>
        </div>
        <button onClick={() => setEditando("nueva")} className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5">
          <Plus className="size-3.5" /> Nueva promoción
        </button>
      </div>

      {promosQ.isLoading ? (
        <p className="text-sm text-brand-ink/60">Cargando…</p>
      ) : promos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/60">
          Todavía no hay promociones. Crea la primera con “Nueva promoción”.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {promos.map((p) => {
            const est = ESTADOS[p.estado];
            return (
              <li key={p.id} className="rounded-2xl border border-brand-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-brand-ink">{p.name}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", est.cls)}>{est.label}</span>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: p.bgColor, color: p.textColor }}>
                        {textoBadge(p)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-brand-ink/70">
                      {resumenDescuento(p)} ·{" "}
                      {p.planIds.length === 0 ? "todos los planes" : p.planIds.map(nombrePlan).join(", ")} ·{" "}
                      {[p.appliesToNew ? "nuevas" : null, p.appliesToRenewals ? "renovaciones" : null].filter(Boolean).join(" y ") || "sin aplicación"}
                    </p>
                    <p className="mt-0.5 text-xs text-brand-ink/55">
                      {p.startsAt || p.endsAt
                        ? `${fechaBogota(p.startsAt) ?? "ya"} → ${fechaBogota(p.endsAt) ?? "sin fin"}`
                        : "Sin fechas"}{" "}
                      · {p.audience === "LINK" ? `Solo con enlace${p.code ? ` (${p.code})` : ""}` : "Todos"} ·{" "}
                      {[p.showBanner ? "barra" : null, p.showOnPrices ? "precios" : null].filter(Boolean).join(" + ") || "silenciosa"}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-brand-ink/70">
                      Usos: {p.redemptions}
                      {p.maxRedemptions !== null ? ` / ${p.maxRedemptions}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => pausarM.mutate(p)} disabled={pausarM.isPending} title={p.isActive ? "Pausar" : "Reanudar"} className="inline-flex items-center gap-1 rounded-full border border-brand-line px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-surface disabled:opacity-60">
                      {p.isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {p.isActive ? "Pausar" : "Reanudar"}
                    </button>
                    <button onClick={() => setEditando(p)} className="inline-flex items-center gap-1 rounded-full border border-brand-line px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-surface">
                      <Pencil className="size-3.5" /> Editar
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la promoción “${p.name}”? Los pagos que ya la usaron conservan su descuento.`)) borrarM.mutate(p.id);
                      }}
                      disabled={borrarM.isPending}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

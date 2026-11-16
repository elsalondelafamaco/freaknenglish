import { useId, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi, type PromoAdmin, type PromoInput } from "@/lib/api/endpoints";
import { formatCop } from "@/lib/domain/plans";
import { textoBadge } from "@/lib/domain/promos";
import { textoDeBanner } from "@/components/site/PromoBanner";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, Interruptor as InterruptorSwitch, PageHeader, SeccionTitulo, Vacio, btnChip, btnChipInk, focusRing, tag, tagNeutral } from "@/components/app/AppUi";
import { btnRow, inputBase, pillClass } from "@/components/teacher/TeacherUi";
import { Segmentado } from "@/components/admin/AdminUi";

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

// Amarillo = la promoción que está funcionando ahora; el resto, contorno neutro.
const ESTADOS: Record<PromoAdmin["estado"], { label: string; cls: string }> = {
  activa: { label: "Activa", cls: tag },
  programada: { label: "Programada", cls: tagNeutral },
  vencida: { label: "Vencida", cls: tagNeutral },
  pausada: { label: "Pausada", cls: tagNeutral },
  agotada: { label: "Agotada", cls: tagNeutral },
};

/** Dónde se anuncia, en palabras del dueño (no "silenciosa"). */
function visibilidad(p: Pick<PromoAdmin, "showBanner" | "showOnPrices" | "audience">) {
  const partes = [p.showBanner ? "barra" : null, p.showOnPrices ? "precios" : null].filter(Boolean);
  if (partes.length === 0) return p.audience === "LINK" ? "No se anuncia en la web (solo con enlace)" : "No se anuncia en la web";
  return `${partes.join(" y ").replace(/^./, (c) => c.toUpperCase())} en la web`;
}

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

const inputCls = `${inputBase} mt-1`;

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="border-2 border-brand-ink bg-white p-5">
      <SeccionTitulo>{titulo}</SeccionTitulo>
      {ayuda ? <p className="mt-1 text-xs text-brand-ink/70">{ayuda}</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Campo({ label, children, ancho }: { label: string; children: ReactNode; ancho?: boolean }) {
  return (
    <label className={cn("block text-xs font-bold text-brand-ink", ancho && "md:col-span-2")}>
      {label}
      {children}
    </label>
  );
}

/** Interruptor real (role="switch") con su texto como etiqueta. */
function Interruptor({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <InterruptorSwitch checked={checked} onChange={onChange} labelledBy={id} />
      <span id={id} className="pt-2.5 text-sm text-brand-ink">
        {children}
      </span>
    </div>
  );
}

function Copiable({ etiqueta, url }: { etiqueta: string; url: string }) {
  return (
    <div className="md:col-span-2">
      <div className="text-xs font-bold text-brand-ink">{etiqueta}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate border-2 border-brand-ink bg-brand-cream-soft px-3 py-2.5 text-xs text-brand-ink">{url}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(
              () => toast.success("Enlace copiado"),
              () => toast.error("No se pudo copiar"),
            );
          }}
          aria-label={`Copiar ${etiqueta.toLowerCase()}`}
          className={`${btnChip} shrink-0`}
        >
          <Copy className="size-3.5" aria-hidden="true" /> Copiar
        </button>
      </div>
    </div>
  );
}

/** Enlace para compartir una promo solo-con-enlace: el código si lo hay; si no, los UTM. */
function enlaceDe(p: Pick<PromoAdmin, "code" | "utmSource" | "utmMedium" | "utmCampaign">, origen: string) {
  if (p.code) return `${origen}/?promo=${encodeURIComponent(p.code)}`;
  const sp = new URLSearchParams();
  if (p.utmSource) sp.set("utm_source", p.utmSource);
  if (p.utmMedium) sp.set("utm_medium", p.utmMedium);
  if (p.utmCampaign) sp.set("utm_campaign", p.utmCampaign);
  return sp.toString() ? `${origen}/?${sp.toString()}` : null;
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
    <form onSubmit={enviar} className="flex flex-col gap-5">
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
        <p className="text-xs text-brand-ink/70 md:col-span-2">
          El precio final nunca baja de {formatCop(5000)}. Si hay varias promos para un plan, se aplica la que más descuenta; en empate, la de mayor prioridad.
        </p>
        <Campo label="Prioridad (desempate)">
          <input type="number" step={1} value={f.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls} />
        </Campo>
      </Seccion>

      <Seccion titulo="Planes y quién aplica">
        <div className="md:col-span-2">
          <div id="promo-planes" className="text-xs font-bold text-brand-ink">Planes (sin marcar = todos)</div>
          <div role="group" aria-labelledby="promo-planes" className="mt-1 flex flex-wrap gap-2">
            {planes.map((p) => {
              const on = f.planIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("planIds", on ? f.planIds.filter((x) => x !== p.id) : [...f.planIds, p.id])}
                  className={pillClass(on)}
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
        <div className="md:col-span-2">
          <Segmentado
            etiqueta="Quién la recibe"
            valor={f.audience}
            onChange={(v) => set("audience", v)}
            opciones={[
              { valor: "ALL" as const, texto: "Todos los visitantes" },
              { valor: "LINK" as const, texto: "Solo con enlace" },
            ]}
          />
        </div>
        {f.audience === "LINK" ? (
          <>
            <p className="text-xs text-brand-ink/70 md:col-span-2">
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

      <Seccion titulo="Visibilidad en la web" ayuda="Si no marcas ninguna, la promoción no se anuncia en la web: se aplica y se ve en el resumen del pago.">
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
            <input type="color" value={f.bgColor} onChange={(e) => set("bgColor", e.target.value.toUpperCase())} className={`h-11 w-14 cursor-pointer border-2 border-brand-ink bg-white p-1 ${focusRing}`} />
            <code className="text-xs">{f.bgColor}</code>
          </div>
        </Campo>
        <Campo label="Color del texto">
          <div className="mt-1 flex items-center gap-2">
            <input type="color" value={f.textColor} onChange={(e) => set("textColor", e.target.value.toUpperCase())} className={`h-11 w-14 cursor-pointer border-2 border-brand-ink bg-white p-1 ${focusRing}`} />
            <code className="text-xs">{f.textColor}</code>
          </div>
        </Campo>
        <div className="md:col-span-2">
          <div className="text-xs font-bold text-brand-ink">Vista previa</div>
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
            <span className="text-[16px] font-bold text-brand-ink/70 line-through">US$30</span>
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
        <button type="submit" disabled={guardando} className={`${btnChipInk} min-w-40`}>
          {guardando ? "Guardando…" : "Guardar promoción"}
        </button>
        <button type="button" onClick={onCancelar} className={btnChip}>
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

  const origen = typeof window !== "undefined" ? window.location.origin : "https://freaknenglish.com";

  if (editando) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrowText={editando === "nueva" ? "Admin · Oferta · Promociones" : `Admin · Oferta · ${editando.name}`}
          title={editando === "nueva" ? "Nueva promoción" : "Editar promoción"}
          highlight={editando === "nueva" ? "Nueva" : "Editar"}
        />
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
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrowText="Admin · Oferta"
        title="Promociones"
        highlight="Promociones"
        aside={
          <button type="button" onClick={() => setEditando("nueva")} className={btnChipInk}>
            <Plus className="size-3.5" aria-hidden="true" /> Nueva promoción
          </button>
        }
      >
        Descuentos con fechas, planes y público. El precio se calcula en el servidor: lo que ve la persona es lo que se cobra.
      </PageHeader>

      {promosQ.isLoading ? (
        <Cargando>Cargando promociones…</Cargando>
      ) : promosQ.isError ? (
        <EstadoError onRetry={() => void promosQ.refetch()}>No pudimos cargar las promociones.</EstadoError>
      ) : promos.length === 0 ? (
        <Vacio
          titulo="Todavía no hay promociones"
          accion={
            <button type="button" onClick={() => setEditando("nueva")} className={btnChipInk}>
              <Plus className="size-3.5" aria-hidden="true" /> Crear la primera
            </button>
          }
        >
          Crea una para ofrecer un descuento por tiempo limitado o con un enlace especial.
        </Vacio>
      ) : (
        <ul className="flex flex-col gap-3">
          {promos.map((p) => {
            const est = ESTADOS[p.estado];
            const enlace = p.audience === "LINK" ? enlaceDe(p, origen) : null;
            return (
              <li key={p.id} className="border-2 border-brand-ink bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[17px] font-extrabold uppercase text-brand-ink">{p.name}</span>
                      <span className={est.cls}>{est.label}</span>
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: p.bgColor, color: p.textColor }}>
                        {textoBadge(p)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-brand-ink/80">
                      {resumenDescuento(p)} ·{" "}
                      {p.planIds.length === 0 ? "todos los planes" : p.planIds.map(nombrePlan).join(", ")} ·{" "}
                      {[p.appliesToNew ? "nuevas" : null, p.appliesToRenewals ? "renovaciones" : null].filter(Boolean).join(" y ") || "sin aplicación"}
                    </p>
                    <p className="mt-0.5 text-xs text-brand-ink/80">
                      {p.startsAt || p.endsAt
                        ? `${fechaBogota(p.startsAt) ?? "ya"} → ${fechaBogota(p.endsAt) ?? "sin fin"}`
                        : "Sin fechas"}{" "}
                      · {p.audience === "LINK" ? `Solo con enlace${p.code ? ` (${p.code})` : ""}` : "Todos"} · {visibilidad(p)}
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-brand-ink">
                      Usos: {p.redemptions}
                      {p.maxRedemptions !== null ? ` / ${p.maxRedemptions}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => pausarM.mutate(p)}
                      disabled={pausarM.isPending}
                      aria-label={`${p.isActive ? "Pausar" : "Reanudar"} ${p.name}`}
                      className={btnRow}
                    >
                      {p.isActive ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />} {p.isActive ? "Pausar" : "Reanudar"}
                    </button>
                    <button type="button" onClick={() => setEditando(p)} aria-label={`Editar ${p.name}`} className={btnRow}>
                      <Pencil className="size-3.5" aria-hidden="true" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la promoción “${p.name}”? Los pagos que ya la usaron conservan su descuento.`)) borrarM.mutate(p.id);
                      }}
                      disabled={borrarM.isPending}
                      aria-label={`Eliminar ${p.name}`}
                      className={`${btnRow} !border-red-700 !text-red-800 hover:!bg-red-50`}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" /> Eliminar
                    </button>
                  </div>
                </div>
                {enlace ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-brand-ink/15 pt-3">
                    <code className="min-w-0 flex-1 truncate border border-brand-ink/25 bg-brand-cream-soft px-3 py-2 text-xs text-brand-ink">{enlace}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(enlace).then(
                          () => toast.success("Enlace copiado"),
                          () => toast.error("No se pudo copiar"),
                        );
                      }}
                      aria-label={`Copiar enlace de ${p.name}`}
                      className={`${btnRow} shrink-0`}
                    >
                      <Copy className="size-3.5" aria-hidden="true" /> Copiar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

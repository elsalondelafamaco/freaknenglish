import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, LogOut, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLang } from "@/lib/i18n";
import { getTheme, toggleTheme } from "@/lib/theme";
import { usersApi, receiptsApi, subscriptionsApi, exchangeApi } from "@/lib/api/endpoints";
import { apiGetBlob } from "@/lib/api/client";
import { copAcobrar } from "@/lib/domain/plans";
import { ZONA_BOGOTA, etiquetaDeZona, nombreDeZona, zonaDe } from "@/lib/domain/zona-horaria";
import { supportWhatsAppUrl } from "@/components/app/PlatformError";
import { inputClass } from "@/components/site/AuthShell";
import { cn } from "@/lib/utils";
import {
  Cargando,
  EstadoError,
  Interruptor,
  PageHeader,
  SeccionTitulo,
  Vacio,
  btnChip,
  btnPrimaryAuto,
  cardPlain,
  cardPrimary,
  eyebrow,
  focusRing,
  rowLine,
  tag,
  tagNeutral,
} from "@/components/app/AppUi";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Configuración — FreaknEnglish" }] }),
  component: SettingsPage,
});

const ESTADO_SUB: Record<string, { label: string; attention: boolean }> = {
  active: { label: "Activo", attention: false },
  pending: { label: "En proceso", attention: true },
  past_due: { label: "Vencido", attention: true },
  expired: { label: "Vencido", attention: true },
  cancelled: { label: "Cancelado", attention: false },
};

const ESTADO_PAGO: Record<string, { label: string; attention: boolean }> = {
  APPROVED: { label: "Aprobado", attention: false },
  PENDING: { label: "Pendiente", attention: true },
  DECLINED: { label: "Rechazado", attention: true },
  ERROR: { label: "Con error", attention: true },
  VOIDED: { label: "Anulado", attention: false },
};

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function SettingsPage() {
  const { user, signOut } = useAuth();
  const subQ = useQuery({
    queryKey: ["me", "subscription"],
    queryFn: () => subscriptionsApi.mine(),
  });
  const paymentsQ = useQuery({
    queryKey: ["me", "payments"],
    queryFn: () => usersApi.payments(),
  });
  // El precio real es `USD × TRM`, igual que en la home y el checkout. Esta
  // pantalla mostraba `priceCop`, que quedó congelado en el valor de la semilla
  // original: el alumno leía 280.000 mientras se le cobraban 620.000.
  const trmQ = useQuery({
    queryKey: ["trm"],
    queryFn: () => exchangeApi.trm(),
    staleTime: 60 * 60_000,
  });
  if (!user) return null;
  const sub = subQ.data as any;
  const plan = sub?.plan ?? null;

  async function downloadReceipt(intentId: string) {
    try {
      const blob = await apiGetBlob(receiptsApi.downloadUrl(intentId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recibo-${intentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo descargar el recibo.");
    }
  }

  const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
  const estado = ESTADO_SUB[sub?.status] ?? { label: sub?.status ?? "—", attention: false };
  // Mismo criterio que el checkout: con el plan vigente solo se renueva en los
  // últimos 5 días; vencido o cancelado, siempre. En proceso, todavía no.
  const puedeRenovar =
    !!sub && sub.status !== "pending" && (sub.status !== "active" || (daysLeft != null && daysLeft <= 5));
  const nombre = user.fullName.split(" ")[0];

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader eyebrowText={nombre} title="Tu plan" highlight="plan" />

      {/* Plan */}
      {subQ.isLoading ? (
        <Cargando>Cargando tu plan…</Cargando>
      ) : subQ.isError ? (
        <EstadoError onRetry={() => void subQ.refetch()}>No pudimos cargar tu suscripción.</EstadoError>
      ) : sub && plan ? (
        <section aria-labelledby="plan-nombre" className={cn(cardPrimary, "p-4 md:p-5")}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="plan-nombre" className="font-display text-[22px] font-extrabold uppercase leading-tight tracking-[-0.01em] text-brand-ink">
              {plan.name}
            </h2>
            <span className={estado.attention ? tag : tagNeutral}>{estado.label}</span>
          </div>
          <p className="mt-2 text-sm text-brand-ink/80">
            {end ? (
              <>
                {sub.status === "active" ? "Renueva el" : "Terminó el"}{" "}
                <b>{end.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</b>
                {" · "}
              </>
            ) : null}
            {cop(copAcobrar(plan, trmQ.data?.valueCop))} al mes
          </p>
          <div className="mt-4 flex flex-col gap-1">
            {puedeRenovar ? (
              <a href="/checkout" className={btnPrimaryAuto}>
                Renovar mi plan
              </a>
            ) : sub.status === "pending" ? (
              <p className="text-sm font-semibold text-brand-ink/80">Tu pago está en proceso. Te avisamos apenas se confirme.</p>
            ) : (
              <p className="text-sm text-brand-ink/80">Podrás renovar cuando falten 5 días o menos para que termine.</p>
            )}
            <a
              href={supportWhatsAppUrl("Hola, quiero congelar o cambiar mi plan de FreaknEnglish.")}
              target="_blank"
              rel="noreferrer"
              className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-bold text-brand-ink underline underline-offset-2 hover:text-brand-ink-soft", focusRing)}
            >
              <MessageCircle className="size-3.5" aria-hidden="true" /> Congelar o cambiar mi plan
            </a>
          </div>
        </section>
      ) : (
        <section aria-labelledby="sin-plan" className={cn(cardPrimary, "bg-brand-yellow-soft p-4 md:p-5")}>
          <h2 id="sin-plan" className="font-display text-[22px] font-extrabold uppercase leading-tight text-brand-ink">
            Aún no tienes un plan
          </h2>
          <p className="mt-2 text-sm text-brand-ink/80">No tienes suscripción activa. Elige un plan para empezar tus clases 1‑a‑1.</p>
          <a href="/checkout" className={cn(btnPrimaryAuto, "mt-4")}>
            Elegir un plan
          </a>
        </section>
      )}

      {/* Cuenta */}
      <section aria-labelledby="cuenta" className={cardPlain}>
        <SeccionTitulo id="cuenta" className="px-4 py-3 text-[15px]">Tu cuenta</SeccionTitulo>
        <div>
          <Fila label="Nombre" value={user.fullName} />
          <Fila label="Correo" value={user.email} />
          <Fila label="Nivel" value={user.level ?? "Por definir"} capitalizar />
          <ZonaHoraria actual={user.timezone} />
          <Idioma />
          <ModoOscuro />
        </div>
      </section>

      {/* Pagos */}
      <section aria-labelledby="pagos" className={cardPlain}>
        <SeccionTitulo id="pagos" className="px-4 py-3 text-[15px]">Historial de pagos</SeccionTitulo>
        {paymentsQ.isLoading ? (
          <div className="px-4 pb-4"><Cargando>Cargando tus pagos…</Cargando></div>
        ) : paymentsQ.isError ? (
          <div className="px-4 pb-4">
            <EstadoError onRetry={() => void paymentsQ.refetch()}>No pudimos cargar tu historial de pagos.</EstadoError>
          </div>
        ) : (paymentsQ.data?.length ?? 0) === 0 ? (
          <div className="px-4 pb-4"><Vacio>Todavía no tienes pagos registrados.</Vacio></div>
        ) : (
          <ul>
            {paymentsQ.data!.map((p) => {
              const est = ESTADO_PAGO[p.status] ?? { label: p.status, attention: false };
              return (
                <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", rowLine)}>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-brand-ink">
                      {p.planName ?? p.planId} ·{" "}
                      <span className="font-semibold text-brand-ink/80">
                        {new Intl.NumberFormat("es-CO", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.amountInCents / 100)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-brand-ink/70">
                      {new Date(p.createdAt).toLocaleString("es-CO")} · Ref {p.reference}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={est.attention ? tag : tagNeutral}>{est.label}</span>
                    {p.status === "APPROVED" ? (
                      <button type="button" onClick={() => downloadReceipt(p.id)} className={btnChip}>
                        <Download className="size-3.5" aria-hidden="true" /> Recibo PDF
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={signOut}
        className={cn("inline-flex min-h-11 items-center gap-2 self-start text-[13px] font-bold text-brand-ink underline underline-offset-2 hover:text-brand-ink-soft", focusRing)}
      >
        <LogOut className="size-4" aria-hidden="true" /> Cerrar sesión
      </button>
    </div>
  );
}

/** Fila de la tarjeta de cuenta: etiqueta a la izquierda, valor a la derecha. */
function Fila({ label, value, capitalizar }: { label: string; value: string; capitalizar?: boolean }) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm", rowLine)}>
      <span className="text-brand-ink">{label}</span>
      <span className={cn("min-w-0 truncate text-right font-semibold text-brand-ink/90", capitalizar ? "first-letter:uppercase" : "")}>{value}</span>
    </div>
  );
}

function FilaControl({ children }: { children: ReactNode }) {
  return <div className={cn("flex min-h-12 items-center justify-between gap-3 px-4 py-1.5 text-sm", rowLine)}>{children}</div>;
}

/** Idioma de la interfaz: dos opciones, la elegida va en tinta. */
function Idioma() {
  const { lang, setLang } = useLang();
  return (
    <FilaControl>
      <span id="fila-idioma" className="text-brand-ink">Idioma</span>
      <div>
        <div role="group" aria-labelledby="fila-idioma" className="inline-flex overflow-hidden rounded-full border-2 border-brand-ink bg-white">
          {([["es", "Español"], ["en", "English"]] as const).map(([l, nombre]) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={cn(
                "inline-flex h-11 items-center px-4 text-[13px] font-bold transition-colors",
                lang === l ? "bg-brand-ink text-brand-cream dark:text-white" : "bg-white text-brand-ink hover:bg-brand-cream",
                focusRing,
              )}
            >
              {nombre}
            </button>
          ))}
        </div>
      </div>
    </FilaControl>
  );
}

/** Modo oscuro: un interruptor real, guardado como el resto de la web. */
function ModoOscuro() {
  const [oscuro, setOscuro] = useState(false);
  useEffect(() => setOscuro(getTheme() === "dark"), []);
  return (
    <FilaControl>
      <span id="fila-oscuro" className="text-brand-ink">Modo oscuro</span>
      <div>
        <Interruptor
          checked={oscuro}
          labelledBy="fila-oscuro"
          onChange={() => setOscuro(toggleTheme() === "dark")}
        />
      </div>
    </FilaControl>
  );
}

/**
 * Zona horaria del estudiante.
 *
 * Se captura sola la primera vez que entra, así que casi nadie la va a tocar;
 * está aquí para quien se muda, para quien entró desde un equipo prestado y
 * para poder corregir un caso raro sin pedirle nada al admin.
 *
 * La lista es corta a propósito: el selector completo de zonas IANA tiene
 * cientos de entradas y nadie sabe si le toca "America/Bogota" o
 * "America/Lima". "Detectar automáticamente" cubre lo que falte.
 */
function ZonaHoraria({ actual }: { actual?: string }) {
  const { refresh } = useAuth();
  const [guardando, setGuardando] = useState(false);
  const zona = zonaDe(actual);

  const guardar = async (valor: string) => {
    const elegida = valor === "auto" ? detectarZona() : valor;
    if (!elegida) return;
    setGuardando(true);
    try {
      await usersApi.updateMe({ timezone: elegida });
      await refresh();
      toast.success("Zona horaria actualizada");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={cn("px-4 py-3", rowLine)}>
      <label className="block text-sm text-brand-ink" htmlFor="zona">
        Zona horaria
      </label>
      <p className="mt-0.5 text-xs text-brand-ink/70">
        Tus clases se muestran en esta hora. Tus profesores están en Colombia
        ({etiquetaDeZona(ZONA_BOGOTA)}).
      </p>
      <select
        id="zona"
        value={ZONAS.some((z) => z.id === zona) ? zona : "auto"}
        disabled={guardando}
        onChange={(e) => void guardar(e.target.value)}
        className={cn(inputClass, "mt-2 max-w-sm")}
      >
        {ZONAS.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
        <option value="auto">Detectar automáticamente</option>
      </select>
      <p className="mt-1.5 text-xs text-brand-ink/70">
        Ahora mismo: {nombreDeZona(zona)} ({etiquetaDeZona(zona)}).
      </p>
    </div>
  );
}

function detectarZona(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const ZONAS = [
  { id: "America/Bogota", label: "Colombia (Bogotá)" },
  { id: "America/Mexico_City", label: "México (Ciudad de México)" },
  { id: "America/Lima", label: "Perú (Lima)" },
  { id: "America/Santiago", label: "Chile (Santiago)" },
  { id: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { id: "America/New_York", label: "EE.UU. Este (Nueva York)" },
  { id: "America/Chicago", label: "EE.UU. Centro (Chicago)" },
  { id: "America/Denver", label: "EE.UU. Montaña (Denver)" },
  { id: "America/Los_Angeles", label: "EE.UU. Pacífico (Los Ángeles)" },
  { id: "Europe/Madrid", label: "España (Madrid)" },
  { id: "Europe/London", label: "Reino Unido (Londres)" },
  { id: "Asia/Tokyo", label: "Japón (Tokio)" },
  { id: "Australia/Sydney", label: "Australia (Sídney)" },
];

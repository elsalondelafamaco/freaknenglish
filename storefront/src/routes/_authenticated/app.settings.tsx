import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usersApi, receiptsApi, subscriptionsApi, exchangeApi } from "@/lib/api/endpoints";
import { apiGetBlob } from "@/lib/api/client";
import { copAcobrar } from "@/lib/domain/plans";
import { ZONA_BOGOTA, etiquetaDeZona, nombreDeZona, zonaDe } from "@/lib/domain/zona-horaria";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Configuración — FreaknEnglish" }] }),
  component: SettingsPage,
});

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
      alert("No se pudo descargar el recibo.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Configuración
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Gestiona tu cuenta y tu suscripción.
        </p>
      </header>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Perfil</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <Row label="Nombre" value={user.fullName} />
          <Row label="Email" value={user.email} />
          <Row label="Rol" value={user.roles.join(", ")} />
          <Row label="Nivel" value={user.level ?? "Por definir"} />
        </dl>
        <ZonaHoraria actual={user.timezone} />
      </section>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Suscripción</h2>
        {subQ.isLoading ? (
          <p className="mt-3 text-sm text-brand-ink/60">Cargando…</p>
        ) : sub && plan ? (
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Row label="Plan" value={plan.name} />
            <Row label="Estado" value={sub.status} />
            <Row
              label="Próximo cobro"
              value={
                sub.currentPeriodEnd
                  ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")
                  : "—"
              }
            />
            <Row
              label="Precio mensual"
              value={new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0,
              }).format(copAcobrar(plan, trmQ.data?.valueCop))}
            />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-brand-ink/65">No tienes suscripción activa.</p>
        )}
      </section>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Historial de pagos</h2>
        {paymentsQ.isLoading ? (
          <p className="mt-3 text-sm text-brand-ink/60">Cargando…</p>
        ) : (paymentsQ.data?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-brand-ink/65">Todavía no tienes pagos registrados.</p>
        ) : (
          <ul className="mt-4 divide-y divide-brand-line">
            {paymentsQ.data!.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm font-semibold text-brand-ink">
                    {p.planName ?? p.planId} ·{" "}
                    <span className="font-normal text-brand-ink/70">
                      {new Intl.NumberFormat("es-CO", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.amountInCents / 100)}
                    </span>
                  </div>
                  <div className="text-xs text-brand-ink/55">
                    {new Date(p.createdAt).toLocaleString("es-CO")} · Ref {p.reference} ·{" "}
                    <span className={p.status === "APPROVED" ? "text-green-700" : "text-brand-ink/70"}>{p.status}</span>
                  </div>
                </div>
                {p.status === "APPROVED" ? (
                  <button
                    onClick={() => downloadReceipt(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/20 px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
                  >
                    <Download className="size-3.5" /> Recibo PDF
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Sesión</h2>
        <p className="mt-1 text-sm text-brand-ink/65">
          Cierra sesión para entrar con otra cuenta.
        </p>
        <button
          onClick={signOut}
          className="mt-4 rounded-full border border-brand-ink/20 px-5 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40"
        >
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-line bg-brand-cream/30 p-4">
      <dt className="text-xs uppercase tracking-wide text-brand-ink/55">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-brand-ink first-letter:uppercase">
        {value}
      </dd>
    </div>
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
    <div className="mt-6 border-t border-brand-line pt-5">
      <label className="block text-sm font-semibold text-brand-ink" htmlFor="zona">
        Zona horaria
      </label>
      <p className="mt-1 text-xs text-brand-ink/60">
        Tus clases se muestran en esta hora. Tus profesores están en Colombia
        ({etiquetaDeZona(ZONA_BOGOTA)}).
      </p>
      <select
        id="zona"
        value={ZONAS.some((z) => z.id === zona) ? zona : "auto"}
        disabled={guardando}
        onChange={(e) => void guardar(e.target.value)}
        className="mt-2 w-full max-w-sm rounded-xl border border-brand-line bg-white px-3 py-2 text-sm text-brand-ink disabled:opacity-50"
      >
        {ZONAS.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
        <option value="auto">Detectar automáticamente</option>
      </select>
      <p className="mt-1.5 text-xs text-brand-ink/55">
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

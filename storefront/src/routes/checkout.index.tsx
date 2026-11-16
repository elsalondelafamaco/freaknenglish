import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRenovacion } from "@/lib/domain/renovacion";
import { copAcobrar } from "@/lib/domain/plans";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { btnPrimary, focusRing } from "@/components/site/AuthShell";
import { Logo } from "@/components/site/Logo";
import { plansApi, subscriptionsApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRastrearUnaVez } from "@/lib/meta-pixel";
import { usePromos } from "@/lib/domain/use-promos";
import { mejorPromo } from "@/lib/domain/promos";
import { PromoBadge, preciosParaMostrar } from "@/components/site/PromoBadge";

export const Route = createFileRoute("/checkout/")({
  head: () => ({ meta: [{ title: "Elige tu plan — FreaknEnglish" }] }),
  component: CheckoutSelect,
});

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function CheckoutSelect() {
  const { user, signOut } = useAuth();
  const q = useQuery({ queryKey: ["plans"], queryFn: () => plansApi.list() });
  const subQ = useQuery({
    queryKey: ["me", "subscription"],
    queryFn: () => subscriptionsApi.mine(),
    enabled: !!user,
  });
  const sub = subQ.data as any;
  const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
  const activeFar = sub?.status === "active" && daysLeft != null && daysLeft > 5;
  const { esRenovacion, cargando: cargandoRenovacion } = useRenovacion();
  const { promos } = usePromos();
  // Plan marcado (null = el de por defecto, ver abajo). Va con los demás hooks,
  // antes de los `return` tempranos.
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const renewalWindow = sub?.status === "active" && daysLeft != null && daysLeft <= 5;

  // Vio los planes. Va antes de los `return` tempranos: un hook no puede
  // depender de por cuál de ellos salga la página.
  useRastrearUnaVez(
    "ViewContent",
    () => ({
      content_type: "product",
      content_ids: (q.data?.plans ?? []).map((p: any) => p.id),
      content_category: "planes",
    }),
    !!q.data && !activeFar,
  );

  if (activeFar) {
    return (
      <main className="min-h-screen bg-brand-cream px-5 py-16">
        <div className="mx-auto max-w-lg">
          <Link to="/" aria-label="Inicio"><Logo className="h-8 w-auto" /></Link>
          <div className="shadow-hard mt-8 border-2 border-brand-ink bg-white p-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-success/10 text-2xl">✅</div>
            <h1 className="mt-4 font-display text-2xl font-extrabold uppercase text-brand-ink">Ya tienes un plan activo</h1>
            <p className="mt-2 text-sm text-brand-ink/80">
              Tu suscripción está vigente hasta el {end!.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}.
              Podrás renovar cuando falten 5 días o menos.
            </p>
            <Link to="/app" className={`${btnPrimary} mt-6 sm:w-auto sm:px-7`}>
              Ir a mi portal
            </Link>
            <p className="mt-4 text-xs text-brand-ink/70">
              ¿Quieres comprar un plan para otra persona?{" "}
              <button
                type="button"
                onClick={() => void signOut()}
                className="font-semibold text-brand-ink underline hover:text-brand-ink-soft"
              >
                Cierra sesión
              </button>{" "}
              y hazlo con otra cuenta.
            </p>
          </div>
        </div>
      </main>
    );
  }
  const trm = q.data?.trm?.valueCop ?? 0;
  const plans = (q.data?.plans ?? []).filter((p: any) => p.isActive !== false);
  // Con tres o más planes arranca marcado el del medio (la intensidad que
  // suele elegirse); así "Elegir mi horario" nunca nace apagado.
  const elegido: any =
    plans.find((p: any) => p.id === elegidoId) ?? (plans.length >= 3 ? plans[1] : plans[0]) ?? null;

  // Precio visible de un plan. Dentro del checkout se muestra siempre el
  // descuento que se va a cobrar, también el de una promo "silenciosa" (de
  // enlace): silenciosa es no anunciarla en la home, no esconderle el precio a
  // quien está pagando.
  function precioDe(plan: any) {
    const conPromo = mejorPromo(promos, plan, trm, esRenovacion);
    return {
      conPromo,
      cop: conPromo ? conPromo.precio.finalCop : copAcobrar(plan, trm),
      mostrar: conPromo ? preciosParaMostrar(conPromo.precio) : null,
    };
  }

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-6 md:py-12">
      <div className="mx-auto max-w-5xl">
        <Link to="/" aria-label="Inicio" className={`inline-flex min-h-11 items-center ${focusRing}`}>
          <Logo className="h-8 w-auto" />
        </Link>

        {renewalWindow ? (
          <div className="mt-4 border-2 border-brand-ink bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
            <strong>Renovación anticipada:</strong> tu nuevo mes empieza cuando termine el actual
            ({end!.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}) — conservas tu horario y profesor.
          </div>
        ) : null}

        <header className="mt-5 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">Paso 1 de 3 · Elige tu plan</p>
          <h1 className="mt-2 font-display text-[32px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink md:text-[52px]">
            Escoge tu <span className="marker-highlight">intensidad</span> y empieza ya
          </h1>
          <p className="mt-3 text-[15px] text-brand-ink/80">
            Puedes cambiar o cancelar cuando quieras.
          </p>
        </header>

        {/* Se espera también a saber si renueva: si no, el botón nace
            apuntando al selector de horario y el estudiante llega allí antes de
            que la respuesta corrija el destino. */}
        {q.isLoading || cargandoRenovacion ? (
          <p role="status" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand-ink/80">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando planes…
          </p>
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label="Plan"
              className={`mt-7 grid gap-4 ${plans.length > 3 ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}
            >
              {plans.map((plan: any) => {
                const activo = plan.id === elegido?.id;
                const { conPromo, cop, mostrar } = precioDe(plan);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setElegidoId(plan.id)}
                    className={`shadow-hard grid w-full grid-cols-[24px_1fr] gap-3 border-2 border-brand-ink p-4 text-left transition-colors md:p-5 ${focusRing} ${
                      activo
                        ? "bg-brand-ink text-brand-cream"
                        : "bg-white text-brand-ink hover:bg-brand-cream-soft"
                    }`}
                  >
                    {/* Marca de selección: el círculo siempre ocupa su sitio, así elegir no mueve nada. */}
                    <span
                      aria-hidden="true"
                      className={`relative mt-0.5 grid size-6 place-items-center rounded-full border-2 ${
                        activo ? "border-brand-cream bg-brand-cream text-brand-ink" : "border-brand-ink"
                      }`}
                    >
                      {activo ? <Check className="size-3.5" strokeWidth={3.4} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="font-display text-[19px] font-extrabold uppercase leading-none md:text-[22px]">{plan.name}</span>
                        {conPromo ? <PromoBadge promo={conPromo.promo} /> : null}
                      </span>
                      <span className="mt-3 flex flex-wrap items-baseline gap-x-2">
                        {mostrar ? (
                          <span className={`text-sm font-bold line-through ${activo ? "text-brand-cream/80" : "text-brand-ink/70"}`}>
                            {mostrar.tachado}
                          </span>
                        ) : null}
                        <span className="font-display text-[30px] font-extrabold leading-none">
                          {mostrar ? mostrar.final : `$${plan.priceUsd ?? "—"}`}
                        </span>
                        <span className={`text-xs font-semibold uppercase tracking-[0.08em] ${activo ? "text-brand-cream/80" : "text-brand-ink/70"}`}>
                          {mostrar && !mostrar.enUsd ? "COP / mes" : "USD / mes"}
                        </span>
                      </span>
                      <span className={`mt-1.5 block text-xs ${activo ? "text-brand-cream/80" : "text-brand-ink/70"}`}>
                        Se cobra {copFmt.format(cop)} (TRM en vivo).
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {elegido ? (
              <>
                {(elegido.features ?? []).length > 0 ? (
                  <ul className="mt-6 grid max-w-2xl gap-x-4 gap-y-2 text-sm text-brand-ink sm:grid-cols-2">
                    {(elegido.features ?? []).map((f: string) => (
                      <li key={f} className="flex items-start gap-2">
                        <span aria-hidden="true">✦</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-6 max-w-md">
                  <Link
                    // Renovar no vuelve a preguntar el horario: el banner de
                    // arriba lleva prometiendo "conservas tu horario y profesor"
                    // desde siempre, y hasta ahora nadie sostenía esa promesa.
                    to={esRenovacion ? "/checkout/$planId" : "/checkout/schedule/$planId"}
                    params={{ planId: elegido.id }}
                    className={btnPrimary}
                  >
                    {esRenovacion ? "Continuar al pago" : "Elegir mi horario"} <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

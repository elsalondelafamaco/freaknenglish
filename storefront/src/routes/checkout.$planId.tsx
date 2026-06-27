import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { Field, inputClass, ErrorBox } from "@/components/site/AuthShell";
import { getPlan, formatCop } from "@/lib/domain/plans";
import { createPaymentIntent } from "@/lib/domain/subscriptions";
import { publicEnv } from "@/lib/env";

export const Route = createFileRoute("/checkout/$planId")({
  head: () => ({ meta: [{ title: "Checkout — Freakn English" }] }),
  component: CheckoutPage,
});

type Step = "form" | "pay";

function CheckoutPage() {
  const { planId } = Route.useParams();
  const navigate = useNavigate();
  const plan = useMemo(() => getPlan(planId), [planId]);

  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState({ fullName: "", email: "", document: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<ReturnType<typeof createPaymentIntent> | null>(null);

  if (!plan) {
    return (
      <main className="min-h-screen bg-brand-cream flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-8 shadow-soft text-center">
          <h1 className="text-xl font-bold text-brand-ink">Plan no encontrado</h1>
          <p className="mt-2 text-sm text-brand-ink/65">
            El plan <strong>{planId}</strong> no existe.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.fullName.trim() || !form.email.trim()) {
      setError("Necesitamos tu nombre y email para continuar.");
      return;
    }
    const created = createPaymentIntent({
      planId: plan!.id,
      amountCop: plan!.priceCop,
      customer: {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        document: form.document.trim() || undefined,
        phone: form.phone.trim() || undefined,
      },
    });
    setIntent(created);
    setStep("pay");
  }

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <Link to="/" aria-label="Inicio" className="inline-block">
          <Logo className="h-8 w-auto" />
        </Link>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Left: form / widget */}
          <div className="rounded-3xl border border-brand-line bg-white p-6 shadow-soft md:p-8">
            <h1 className="text-2xl font-bold text-brand-ink md:text-3xl">
              {step === "form" ? "Completa tus datos" : "Pago seguro con Wompi"}
            </h1>
            <p className="mt-1 text-sm text-brand-ink/65">
              {step === "form"
                ? "Los necesitamos para crear tu cuenta y enviarte la confirmación."
                : "Serás redirigido a la pasarela segura de Wompi para completar el pago."}
            </p>

            {step === "form" ? (
              <form onSubmit={submitForm} className="mt-6 flex flex-col gap-4">
                <Field label="Nombre completo" htmlFor="fullName">
                  <input
                    id="fullName"
                    className={inputClass}
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field label="Email" htmlFor="email" hint="Aquí te enviaremos la confirmación.">
                  <input
                    id="email"
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    autoComplete="email"
                    required
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Documento" htmlFor="document" hint="Opcional, solo Colombia.">
                    <input
                      id="document"
                      className={inputClass}
                      value={form.document}
                      onChange={(e) => setForm({ ...form, document: e.target.value })}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Celular" htmlFor="phone" hint="Opcional.">
                    <input
                      id="phone"
                      className={inputClass}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </Field>
                </div>
                <ErrorBox>{error}</ErrorBox>
                <button
                  type="submit"
                  className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft"
                >
                  Continuar al pago
                </button>
                <p className="text-center text-xs text-brand-ink/55">
                  Al continuar aceptas nuestros{" "}
                  <a href="#" className="underline">Términos</a> y{" "}
                  <a href="#" className="underline">Política de privacidad</a>.
                </p>
              </form>
            ) : intent ? (
              <WompiStep
                reference={intent.reference}
                amountCop={plan.priceCop}
                email={intent.customer.email}
                onBack={() => setStep("form")}
                onSimulateApproved={() =>
                  navigate({
                    to: "/checkout/return",
                    search: { reference: intent.reference, status: "APPROVED" },
                  })
                }
              />
            ) : null}
          </div>

          {/* Right: order summary */}
          <aside className="rounded-3xl bg-brand-yellow-soft p-6 md:p-7 lg:sticky lg:top-6 lg:h-fit">
            <p className="text-xs font-medium uppercase tracking-wider text-brand-ink/60">
              Tu plan
            </p>
            <h2 className="mt-1 text-xl font-bold text-brand-ink">{plan.name}</h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-brand-ink">{plan.priceDisplay}</span>
              <span className="text-sm text-brand-ink/60">USD / mes</span>
            </div>
            <p className="mt-1 text-xs text-brand-ink/60">
              Se cobra {formatCop(plan.priceCop)} COP vía Wompi.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-brand-ink/85">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-success" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-2 rounded-2xl bg-white/70 p-3 text-xs text-brand-ink/70">
              <ShieldCheck className="size-4 text-brand-ink" />
              Pago procesado por Wompi. Tus datos viajan cifrados.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

/**
 * Paso 2 — Widget de Checkout de Wompi (sin tokenización propia).
 *
 * Si `VITE_WOMPI_PUBLIC_KEY` no está configurada (entorno de desarrollo),
 * mostramos un botón "Simular pago aprobado" que dispara el mismo flujo que
 * un webhook `APPROVED`. Esto permite probar el resto del producto sin
 * credenciales reales. La integración con el webhook real se conectará
 * cuando el usuario despliegue la Edge Function (ver docs/backend-jobs.md).
 */
function WompiStep({
  reference,
  amountCop,
  email,
  onBack,
  onSimulateApproved,
}: {
  reference: string;
  amountCop: number;
  email: string;
  onBack: () => void;
  onSimulateApproved: () => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const publicKey = publicEnv.wompiPublicKey();
  const currency = publicEnv.currency();
  const redirectUrl =
    (publicEnv.appOrigin() || (typeof window !== "undefined" ? window.location.origin : "")) +
    "/checkout/return";
  const hasRealKey = publicKey.startsWith("pub_") && !publicKey.includes("placeholder");

  // Inyecta dinámicamente <script src="https://checkout.wompi.co/widget.js">
  // dentro del <form>. Wompi requiere que el script sea hijo del form.
  useEffect(() => {
    if (!hasRealKey || !formRef.current) return;
    const existing = formRef.current.querySelector("script[data-wompi]");
    if (existing) return;
    const s = document.createElement("script");
    s.src = "https://checkout.wompi.co/widget.js";
    s.setAttribute("data-render", "button");
    s.setAttribute("data-wompi", "1");
    s.async = true;
    formRef.current.appendChild(s);
  }, [hasRealKey]);

  return (
    <div className="mt-6">
      {hasRealKey ? (
        <form ref={formRef} className="flex flex-col items-stretch gap-3">
          <input type="hidden" name="public-key" value={publicKey} />
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="amount-in-cents" value={String(amountCop * 100)} />
          <input type="hidden" name="reference" value={reference} />
          <input type="hidden" name="redirect-url" value={redirectUrl} />
          <input type="hidden" name="customer-data:email" value={email} />
          {/* El script inyecta el botón "Pagar con Wompi" aquí. */}
        </form>
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Modo demo activo</p>
          <p className="mt-1 text-amber-900/80">
            No hay <code className="font-mono text-xs">VITE_WOMPI_PUBLIC_KEY</code> configurada.
            Puedes simular un pago aprobado para probar el resto del flujo.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onSimulateApproved}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white hover:bg-brand-ink-soft"
      >
        Simular pago aprobado (demo)
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-full border border-brand-line bg-white text-sm font-medium text-brand-ink hover:bg-brand-cream/40"
      >
        Volver a editar mis datos
      </button>
      <p className="mt-3 text-center text-xs text-brand-ink/50">
        Referencia: <span className="font-mono">{reference}</span>
      </p>
    </div>
  );
}
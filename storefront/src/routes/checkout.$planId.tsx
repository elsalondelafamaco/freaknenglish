import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { Field, inputClass, ErrorBox } from "@/components/site/AuthShell";
import { getPlan, formatCop } from "@/lib/domain/plans";
import { checkoutApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/checkout/$planId")({
  head: () => ({ meta: [{ title: "Checkout — Freakn English" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { planId } = Route.useParams();
  const plan = useMemo(() => getPlan(planId), [planId]);

  const [form, setForm] = useState({ fullName: "", email: "", document: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.fullName.trim() || !form.email.trim() || !form.document.trim() || !form.phone.trim()) {
      setError("Nombre, email, documento y celular son obligatorios.");
      return;
    }
    setLoading(true);
    try {
      const created = await checkoutApi.createIntent({
        planId: plan!.id,
        customerEmail: form.email.trim().toLowerCase(),
        customerName: form.fullName.trim(),
        customerDocument: form.document.trim(),
        customerPhone: form.phone.trim(),
      });
      // Redirige directamente al Web Checkout de Wompi. La fuente de verdad
      // del estado de pago es el webhook server-side; la vista `/checkout/return`
      // solo refleja el estado consultando `GET /checkout/status`.
      window.location.href = created.checkoutUrl;
    } catch (err: any) {
      setError(err?.message ?? "No pudimos iniciar el pago. Intenta de nuevo.");
      setLoading(false);
    }
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
            <h1 className="text-2xl font-bold text-brand-ink md:text-3xl">Completa tus datos</h1>
            <p className="mt-1 text-sm text-brand-ink/65">
              Los necesitamos para crear tu cuenta. Al continuar serás redirigido a la pasarela
              segura de Wompi para completar el pago.
            </p>

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
                  <Field label="Documento" htmlFor="document" hint="Obligatorio para facturación.">
                    <input
                      id="document"
                      className={inputClass}
                      value={form.document}
                      onChange={(e) => setForm({ ...form, document: e.target.value })}
                      inputMode="numeric"
                      required
                    />
                  </Field>
                  <Field label="Celular" htmlFor="phone" hint="Formato internacional (+57...).">
                    <input
                      id="phone"
                      className={inputClass}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      inputMode="tel"
                      autoComplete="tel"
                      required
                    />
                  </Field>
                </div>
                <ErrorBox>{error}</ErrorBox>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft disabled:opacity-60"
                >
                  {loading ? "Redirigiendo a Wompi…" : "Continuar al pago"}
                </button>
                <p className="text-center text-xs text-brand-ink/55">
                  Al continuar aceptas nuestros{" "}
                  <a href="#" className="underline">Términos</a> y{" "}
                  <a href="#" className="underline">Política de privacidad</a>.
                </p>
            </form>
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
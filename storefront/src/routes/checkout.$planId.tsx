import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Check, ShieldCheck, LogOut, UserCog } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { Field, inputClass, ErrorBox } from "@/components/site/AuthShell";
import { checkoutApi, plansApi, scheduleApi, type SlotRef } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/checkout/$planId")({
  head: () => ({ meta: [{ title: "Checkout — Freakn English" }] }),
  validateSearch: z.object({ slots: z.string().optional() }),
  component: CheckoutPage,
});

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const decodeSlots = (raw: string | undefined): SlotRef[] =>
  (raw ?? "")
    .split(",")
    .map((p) => p.split("-").map(Number))
    .filter((a) => a.length === 2 && Number.isInteger(a[0]) && Number.isInteger(a[1]))
    .map(([weekday, hour]) => ({ weekday, hour }));

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function CheckoutPage() {
  const { planId } = Route.useParams();
  const { slots: slotsRaw } = Route.useSearch();
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const selSlots = useMemo(() => decodeSlots(slotsRaw), [slotsRaw]);

  // El horario es un paso obligatorio antes del pago (SDD-scheduling-v2).
  useEffect(() => {
    if (selSlots.length === 0) nav({ to: "/checkout/schedule/$planId", params: { planId }, replace: true });
  }, [selSlots.length, planId, nav]);

  const availQ = useQuery({
    queryKey: ["schedule", "hints", "confirm", !!user, slotsRaw],
    queryFn: () => (user ? scheduleApi.availabilityMine(selSlots) : scheduleApi.availability(selSlots)),
    enabled: selSlots.length > 0,
  });
  const assignable = availQ.data?.assignable ?? true;

  const plansQ = useQuery({ queryKey: ["plans"], queryFn: () => plansApi.list() });
  const trm = plansQ.data?.trm?.valueCop ?? 0;
  const plan = useMemo(
    () => (plansQ.data?.plans ?? []).find((p: any) => p.id === planId),
    [plansQ.data, planId],
  );

  const loggedIn = !!user;
  const [form, setForm] = useState({ fullName: "", email: "", document: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Autocompleta con los datos del usuario logueado (y los bloquea).
  useEffect(() => {
    if (user) {
      setForm({
        fullName: user.fullName ?? "",
        email: user.email ?? "",
        document: (user as any).documentNumber ?? "",
        phone: user.phone ?? "",
      });
    }
  }, [user?.id]);

  if (plansQ.isLoading) {
    return <main className="min-h-screen bg-brand-cream flex items-center justify-center text-sm text-brand-ink/60">Cargando…</main>;
  }
  if (!plan) {
    return (
      <main className="min-h-screen bg-brand-cream flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-8 shadow-soft text-center">
          <h1 className="text-xl font-bold text-brand-ink">Plan no encontrado</h1>
          <p className="mt-2 text-sm text-brand-ink/65">El plan <strong>{planId}</strong> no existe.</p>
          <Link to="/checkout" className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white">Ver planes</Link>
        </div>
      </main>
    );
  }

  const cop = plan.priceUsd && trm ? Math.round(plan.priceUsd * trm) : plan.priceCop;

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
        userId: user?.id, // si hay sesión, la suscripción se asocia a esta cuenta
        slots: selSlots,
      });
      window.location.href = created.checkoutUrl;
    } catch (err: any) {
      setError(err?.message ?? "No pudimos iniciar el pago. Intenta de nuevo.");
      setLoading(false);
    }
  }

  const lockField = loggedIn; // datos del usuario logueado no se editan

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Inicio" className="inline-block">
            <Logo className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium text-brand-ink/60">
            <Link to="/checkout" className="hover:text-brand-ink">← Plan</Link>
            <Link to="/checkout/schedule/$planId" params={{ planId }} className="hover:text-brand-ink">← Horario</Link>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-brand-line bg-white p-6 shadow-soft md:p-8">
            <h1 className="text-2xl font-bold text-brand-ink md:text-3xl">
              {loggedIn ? "Confirma tus datos" : "Completa tus datos"}
            </h1>
            <p className="mt-1 text-sm text-brand-ink/65">
              {loggedIn
                ? "Compras con tu cuenta. Al continuar irás a la pasarela segura de Wompi."
                : "Los necesitamos para crear tu cuenta. Al continuar serás redirigido a Wompi."}
            </p>

            {loggedIn ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-cream/50 px-4 py-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-brand-ink/75">
                  <UserCog className="size-4" /> Comprando como <strong>{user!.email}</strong>
                </span>
                <button
                  type="button"
                  onClick={async () => { await signOut(); }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/20 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
                >
                  <LogOut className="size-3.5" /> No soy yo · usar otra cuenta
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-brand-cream/50 px-4 py-3 text-sm text-brand-ink/75">
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" search={{ redirect: `/checkout/${planId}${slotsRaw ? `?slots=${slotsRaw}` : ""}` }} className="font-semibold text-brand-ink underline">
                  Inicia sesión
                </Link>{" "}
                y volvemos aquí para autocompletar tus datos.
              </div>
            )}

            {selSlots.length > 0 && !availQ.isLoading && !assignable ? (
              <div className="mt-4 rounded-2xl border border-brand-line bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
                Ese horario está muy solicitado 💛 Completa tu compra con tranquilidad: te contactamos en
                menos de 24&nbsp;h hábiles para coordinar tu profesor. <strong>Tu cupo queda garantizado.</strong>
              </div>
            ) : null}

            <form onSubmit={submitForm} className="mt-6 flex flex-col gap-4">
              <Field label="Nombre completo" htmlFor="fullName">
                <input id="fullName" className={inputClass} value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  autoComplete="name" required readOnly={lockField} disabled={lockField} />
              </Field>
              <Field label="Email" htmlFor="email" hint={loggedIn ? "El de tu cuenta." : "Aquí te enviaremos la confirmación."}>
                <input id="email" type="email" className={inputClass} value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email" required readOnly={lockField} disabled={lockField} />
              </Field>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Documento" htmlFor="document" hint="Obligatorio para facturación.">
                  <input id="document" className={inputClass} value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    inputMode="numeric" required readOnly={lockField} disabled={lockField} />
                </Field>
                <Field label="Celular" htmlFor="phone" hint="Formato internacional (+57...).">
                  <input id="phone" className={inputClass} value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    inputMode="tel" autoComplete="tel" required readOnly={lockField} disabled={lockField} />
                </Field>
              </div>
              <ErrorBox>{error}</ErrorBox>
              <button type="submit" disabled={loading}
                className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft disabled:opacity-60">
                {loading ? "Redirigiendo a Wompi…" : "Continuar al pago"}
              </button>
              <p className="text-center text-xs text-brand-ink/55">
                Al continuar aceptas nuestros <a href="#" className="underline">Términos</a> y{" "}
                <a href="#" className="underline">Política de privacidad</a>.
              </p>
            </form>
          </div>

          <aside className="rounded-3xl bg-brand-yellow-soft p-6 md:p-7 lg:sticky lg:top-6 lg:h-fit">
            <p className="text-xs font-medium uppercase tracking-wider text-brand-ink/60">Tu plan</p>
            <h2 className="mt-1 text-xl font-bold text-brand-ink">{plan.name}</h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-brand-ink">${plan.priceUsd ?? "—"}</span>
              <span className="text-sm text-brand-ink/60">USD / mes</span>
            </div>
            <p className="mt-1 text-xs text-brand-ink/60">Se cobra {copFmt.format(cop)} vía Wompi (TRM en vivo).</p>
            {selSlots.length > 0 ? (
              <div className="mt-4 rounded-2xl bg-white/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-ink/60">Tu horario semanal</p>
                <ul className="mt-1.5 space-y-1 text-sm text-brand-ink/85">
                  {[...selSlots]
                    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.hour - b.hour)
                    .map((sl) => (
                      <li key={`${sl.weekday}-${sl.hour}`}>
                        {DAY_NAMES[sl.weekday]} · {sl.hour}:00–{sl.hour}:50
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            <ul className="mt-5 space-y-2 text-sm text-brand-ink/85">
              {(plan.features ?? []).map((f: string) => (
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

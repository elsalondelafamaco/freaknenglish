import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { checkoutApi } from "@/lib/api/endpoints";

/**
 * Wompi devuelve al usuario con `?id=<transaction_id>` (y a veces `env=...`).
 * En el flujo real, la "fuente de verdad" del estado es el webhook server-side
 * (`docs/backend-jobs.md → wompi-payment-events`); esta página solo lo refleja.
 *
 * Aquí soportamos ambos: query del Widget real (`id`) y simulación local
 * (`reference` + `status`).
 */
const searchSchema = z.object({
  id: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(["APPROVED", "DECLINED", "VOIDED", "PENDING"]).optional(),
  env: z.string().optional(),
});

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Pago — Freakn English" }] }),
  validateSearch: searchSchema,
  component: ReturnPage,
});

type ViewState =
  | { kind: "loading" }
  | { kind: "ok"; reference: string; planId: string }
  | { kind: "fail"; reason: string };

function ReturnPage() {
  const search = useSearch({ from: "/checkout/return" });
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const attemptsRef = useRef(0);

  useEffect(() => {
    const reference = search.reference;
    if (!reference) {
      setState({
        kind: "fail",
        reason:
          "No recibimos la referencia del pago. Si el cobro fue exitoso, te llegará un email de confirmación.",
      });
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const r = await checkoutApi.status(reference);
        if (cancelled) return;
        if (r.status === "APPROVED") {
          setState({ kind: "ok", reference, planId: r.planId });
          return;
        }
        if (r.status === "DECLINED" || r.status === "VOIDED" || r.status === "ERROR") {
          setState({
            kind: "fail",
            reason:
              r.status === "DECLINED"
                ? "El banco rechazó la transacción. Intenta con otro medio de pago."
                : "El pago no se completó. Puedes intentarlo de nuevo.",
          });
          return;
        }
        // PENDING → retry with backoff up to ~30s
        attemptsRef.current += 1;
        if (attemptsRef.current > 15) {
          setState({
            kind: "fail",
            reason: "El pago sigue pendiente. Te avisaremos por email cuando se procese.",
          });
          return;
        }
        setTimeout(poll, 2000);
      } catch (err: any) {
        if (cancelled) return;
        setState({ kind: "fail", reason: err?.message ?? "No pudimos verificar el pago." });
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [search.reference]);

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-14 md:py-20">
      <div className="mx-auto max-w-lg">
        <Link to="/" aria-label="Inicio" className="inline-block">
          <Logo className="h-8 w-auto" />
        </Link>
        <div className="mt-8 rounded-3xl border border-brand-line bg-white p-8 text-center shadow-soft md:p-10">
          {state.kind === "loading" ? (
            <>
              <Loader2 className="mx-auto size-10 animate-spin text-brand-ink/40" />
              <h1 className="mt-4 text-xl font-bold text-brand-ink">Confirmando tu pago…</h1>
            </>
          ) : state.kind === "ok" ? (
            <>
              <CheckCircle2 className="mx-auto size-12 text-brand-success" />
              <h1 className="mt-4 text-2xl font-bold text-brand-ink">¡Bienvenido a Freakn!</h1>
              <p className="mt-2 text-sm text-brand-ink/65">
                Tu suscripción al plan <strong>{state.planId}</strong> está activa. Te enviamos un
                email con los próximos pasos.
              </p>
              <Link
                to="/app"
                className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
              >
                Entrar a mi portal
              </Link>
              <p className="mt-4 text-xs text-brand-ink/45 font-mono">Ref: {state.reference}</p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto size-12 text-red-500" />
              <h1 className="mt-4 text-2xl font-bold text-brand-ink">No pudimos cobrar tu pago</h1>
              <p className="mt-2 text-sm text-brand-ink/65">{state.reason}</p>
              <Link
                to="/"
                className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
              >
                Volver al inicio
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
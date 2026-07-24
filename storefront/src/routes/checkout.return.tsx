import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { checkoutApi } from "@/lib/api/endpoints";

/**
 * Wompi devuelve al usuario con `?id=<transaction_id>` (y a veces `env=...`).
 * El backend verifica ese id CONTRA Wompi y finaliza idempotentemente (mismo
 * núcleo que el webhook), así que el pago se confirma aunque el webhook aún no
 * haya llegado. También soportamos `reference` (simulación local).
 */
const searchSchema = z.object({
  id: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(["APPROVED", "DECLINED", "VOIDED", "PENDING"]).optional(),
  env: z.string().optional(),
});

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Pago — FreaknEnglish" }] }),
  validateSearch: searchSchema,
  component: ReturnPage,
});

type ViewState =
  | { kind: "loading" }
  | { kind: "ok"; reference: string | null; planId: string | null }
  | { kind: "fail"; reason: string };

function ReturnPage() {
  const search = useSearch({ from: "/checkout/return" });
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const attemptsRef = useRef(0);
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const id = search.id;
    const reference = search.reference;
    if (!id && !reference) {
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
        const r = await checkoutApi.status(id ? { id } : { reference });
        if (cancelled) return;
        if (r.status === "APPROVED") {
          setState({ kind: "ok", reference: r.reference, planId: r.planId });
          // Refresca sesión/suscripción y lleva al portal automáticamente.
          qc.invalidateQueries({ queryKey: ["me"] });
          setTimeout(() => nav({ to: "/app" }), 2500);
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
        // PENDING → reintenta con backoff hasta ~40s (da tiempo a Wompi/webhook)
        attemptsRef.current += 1;
        if (attemptsRef.current > 20) {
          setState({
            kind: "fail",
            reason: "El pago sigue pendiente. Te avisaremos por email cuando se procese.",
          });
          return;
        }
        setTimeout(poll, 2000);
      } catch (err: any) {
        if (cancelled) return;
        // Errores transitorios: reintenta unas veces antes de rendirse.
        attemptsRef.current += 1;
        if (attemptsRef.current > 20) {
          setState({ kind: "fail", reason: err?.message ?? "No pudimos verificar el pago." });
          return;
        }
        setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [search.id, search.reference]);

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
              <p className="mt-2 text-sm text-brand-ink/60">Verificando la transacción con Wompi.</p>
            </>
          ) : state.kind === "ok" ? (
            <>
              <CheckCircle2 className="mx-auto size-12 text-brand-success" />
              <h1 className="mt-4 text-2xl font-bold text-brand-ink">¡Pago confirmado!</h1>
              <p className="mt-2 text-sm text-brand-ink/65">
                Tu suscripción {state.planId ? <>al plan <strong>{state.planId}</strong> </> : null}
                quedó activa. Si es tu primera compra, te enviamos un email para crear tu contraseña.
              </p>
              <p className="mt-4 text-xs text-brand-ink/50">Te llevamos a tu portal en unos segundos…</p>
              <Link
                to="/app"
                className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
              >
                Entrar ahora
              </Link>
              {state.reference ? (
                <p className="mt-4 text-xs text-brand-ink/45 font-mono">Ref: {state.reference}</p>
              ) : null}
            </>
          ) : (
            <>
              <XCircle className="mx-auto size-12 text-red-500" />
              <h1 className="mt-4 text-2xl font-bold text-brand-ink">No pudimos confirmar tu pago</h1>
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

import { useEffect, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import {
  getPaymentIntent,
  resolvePayment,
  type PaymentStatus,
} from "@/lib/domain/subscriptions";
import { readDb, uid, writeDb } from "@/lib/domain/repository";
import type { User } from "@/lib/domain/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { runAutomations } from "@/lib/domain/notifications";

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
  const { refresh } = useAuth();
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    const reference = search.reference;
    const status: PaymentStatus = (search.status as PaymentStatus | undefined) ?? "APPROVED";

    if (!reference) {
      setState({
        kind: "fail",
        reason:
          "No recibimos la referencia del pago. Si el cobro fue exitoso, te llegará un email de confirmación.",
      });
      return;
    }

    const intent = getPaymentIntent(reference);
    if (!intent) {
      setState({ kind: "fail", reason: "No encontramos esta intención de pago." });
      return;
    }

    if (status !== "APPROVED") {
      resolvePayment(reference, status);
      setState({
        kind: "fail",
        reason:
          status === "DECLINED"
            ? "El banco rechazó la transacción. Intenta con otro medio de pago."
            : "El pago no se completó. Puedes intentarlo de nuevo.",
      });
      return;
    }

    // APPROVED: crea/obtiene usuario por email y activa suscripción + sesión.
    const db = readDb();
    let user = Object.values(db.users as Record<string, User>).find(
      (u) => u.email.toLowerCase() === intent.customer.email,
    ) as User | undefined;
    if (!user) {
      user = {
        id: uid("usr"),
        email: intent.customer.email,
        fullName: intent.customer.fullName,
        roles: ["student"],
        createdAt: new Date().toISOString(),
      };
      writeDb((db) => {
        (db.users as Record<string, User>)[user!.id] = user!;
        // Mock: contraseña temporal igual a la referencia (se cambiará en reset).
        db.meta.passwordsByEmail[user!.email] = reference.slice(-8);
      });
    }
    resolvePayment(reference, "APPROVED", user.id);
    // Encola welcome email (idempotente — dedupe por subscription.id).
    void runAutomations();
    // Inicia sesión automática del nuevo usuario (mock).
    writeDb((db) => {
      const token = uid("tok");
      (db.sessions as Record<string, unknown>)[token] = {
        userId: user!.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          "freakn.session.v1",
          JSON.stringify({
            userId: user!.id,
            token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }),
        );
      }
    });
    refresh();
    setState({ kind: "ok", reference, planId: intent.planId });
  }, [search.reference, search.status, refresh]);

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
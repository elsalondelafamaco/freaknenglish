import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Check, X, Loader2 } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { btnPrimary, btnSecondary, focusRing, linkPlain } from "@/components/site/AuthShell";
import { checkoutApi, classesApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { horaEn12, zonaDe } from "@/lib/domain/zona-horaria";
import { rastrearCompra } from "@/lib/meta-pixel";
import { borrarPago } from "@/lib/pago/pago-en-curso";

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

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** "Lun 17 · 7:00 a. m." en la zona de quien la lee. */
function etiquetaDeClase(iso: string, zona: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", timeZone: zona })
    .format(d)
    .replace(".", "");
  const p = new Intl.DateTimeFormat("en-CA", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }).formatToParts(d);
  const de = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${horaEn12(de("hour"), de("minute"))}`;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "ok"; reference: string | null; planId: string | null; planName: string | null; amountInCents: number | null }
  | { kind: "fail"; reason: string };

function ReturnPage() {
  const search = useSearch({ from: "/checkout/return" });
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const attemptsRef = useRef(0);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  // El sondeo corre en un efecto que no se rehace al cambiar la sesión.
  const conSesion = useRef(false);
  conSesion.current = !!user;

  // Con sesión (quien ya tenía cuenta, o la que se abrió al pagar) se muestra
  // su primera clase. Si todavía no hay, o no hay sesión, la pantalla sigue
  // siendo válida sin ese dato.
  const claseQ = useQuery({
    queryKey: ["classes", "upcoming", "confirmacion"],
    queryFn: () => classesApi.upcoming(),
    enabled: state.kind === "ok" && !!user,
    retry: false,
  });

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
          setState({
            kind: "ok",
            reference: r.reference,
            planId: r.planId,
            planName: r.planName ?? null,
            amountInCents: r.amountInCents,
          });
          // La compra al píxel. Si no llega a salir (bloqueador, cierra rápido),
          // la manda igual el servidor desde el webhook con la misma referencia.
          rastrearCompra(r);
          // Pago en el sitio que terminó en el banco (PSE/Bancolombia): ya no hay nada que retomar.
          borrarPago();
          // Refresca sesión/suscripción. Solo quien ya tiene sesión pasa solo al
          // portal, y con tiempo para leer su primera clase: sin sesión el portal
          // pide iniciar sesión, y saltar ahí a los 2 s dejaba a quien acaba de
          // pagar frente a un login sin entender por qué.
          qc.invalidateQueries({ queryKey: ["me"] });
          if (conSesion.current) setTimeout(() => nav({ to: "/app" }), 8000);
          return;
        }
        if (r.status === "DECLINED" || r.status === "VOIDED" || r.status === "ERROR") {
          setState({
            kind: "fail",
            reason:
              r.status === "DECLINED"
                ? "El banco rechazó el pago. No se hizo ningún cobro."
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

  const clase = claseQ.data ?? null;
  const zona = zonaDe(user?.timezone);

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-6 md:py-12">
      <div className="mx-auto max-w-md">
        <Link to="/" aria-label="Inicio" className={`inline-flex min-h-11 items-center ${focusRing}`}>
          <Logo className="h-8 w-auto" />
        </Link>

        {state.kind === "loading" ? (
          <div role="status" className="mt-16 flex flex-col items-center text-center">
            <Loader2 className="size-10 animate-spin text-brand-ink" aria-hidden />
            <h1 className="mt-5 font-display text-2xl font-extrabold uppercase tracking-[-0.02em] text-brand-ink">
              Confirmando tu pago…
            </h1>
            <p className="mt-2 text-sm text-brand-ink/80">Estamos verificando la transacción. Esta pantalla se actualiza sola.</p>
          </div>
        ) : state.kind === "ok" ? (
          <>
            <div
              aria-hidden="true"
              className="mt-8 grid size-16 place-items-center rounded-full border-2 border-brand-ink bg-brand-yellow text-brand-ink shadow-hard [--hard-color:var(--brand-ink)] [--hard-x:4px]"
            >
              <Check className="size-8" strokeWidth={3} />
            </div>
            <h1 className="mt-5 font-display text-[38px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink">
              ¡Pago <span className="marker-highlight">confirmado</span>!
            </h1>
            <p className="mt-3 text-[15px] text-brand-ink/80">
              {user?.fullName ? `Bienvenido a Freakn, ${user.fullName.split(" ")[0]}. ` : "Bienvenido a Freakn. "}
              Tu plan{state.planName ? <> <strong>{state.planName}</strong></> : null} ya está activo.
            </p>

            {clase ? (
              <section className="shadow-hard mt-6 border-2 border-brand-ink bg-white p-4 md:p-5" aria-labelledby="primera-clase">
                <p id="primera-clase" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">
                  Tu primera clase
                </p>
                <p className="mt-2 font-display text-[28px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-brand-ink">
                  {etiquetaDeClase(clase.startsAt, zona)}
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm text-brand-ink/80">
                  <span
                    aria-hidden="true"
                    className="grid size-[26px] flex-none place-items-center rounded-full border-2 border-brand-ink bg-white font-display text-[10px] font-extrabold text-brand-ink"
                  >
                    {clase.teacherName
                      .split(" ")
                      .slice(0, 2)
                      .map((w) => w.charAt(0))
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span>
                    Tu profe: <b className="text-brand-ink">{clase.teacherName}</b> · {clase.durationMin} min
                  </span>
                </p>
              </section>
            ) : (
              <p className="mt-6 border-2 border-brand-ink bg-white p-4 text-sm text-brand-ink/80">
                En tu portal ves tu primera clase y a tu profe en cuanto quede asignado.
              </p>
            )}

            <p className="mt-5 text-xs text-brand-ink/70">
              {state.amountInCents != null ? `Pagaste ${copFmt.format(state.amountInCents / 100)} COP · ` : ""}
              {state.reference ? <>Ref. <span className="font-mono">{state.reference}</span> · </> : null}
              Te enviamos el recibo a tu correo.
            </p>
            <Link to="/app" className={`${btnPrimary} mt-4`}>
              Entrar a mi portal
            </Link>
            <p className="mt-3 text-center text-xs text-brand-ink/70">
              {user
                ? "Te llevamos a tu portal en unos segundos…"
                : "Entra con el correo y la contraseña que creaste al pagar."}
            </p>
          </>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="mt-8 grid size-16 place-items-center rounded-full border-2 border-brand-ink bg-brand-yellow text-brand-ink shadow-hard [--hard-color:var(--brand-ink)] [--hard-x:4px]"
            >
              <X className="size-7" strokeWidth={3} />
            </div>
            <h1 className="mt-5 font-display text-[34px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink">
              No pudimos <span className="marker-highlight">confirmar</span> tu pago
            </h1>
            <p role="alert" className="mt-3 text-[15px] leading-snug text-brand-ink/80">
              {state.reason}
            </p>
            <div className="mt-7 flex flex-col gap-3.5">
              <Link to="/checkout" className={btnPrimary}>
                Probar con otro medio
              </Link>
              <Link to="/" className={btnSecondary}>
                Volver al inicio
              </Link>
            </div>
            <p className="mt-2 text-center">
              <a
                href="https://wa.me/573012646770"
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkPlain} text-[13px]`}
              >
                ¿Dudas? Escríbenos por WhatsApp
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

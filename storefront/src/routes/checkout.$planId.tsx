import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ShieldCheck, LogOut, UserCog, Loader2 } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { Field, inputClass, ErrorBox, btnPrimary, focusRing, linkPlain } from "@/components/site/AuthShell";
import { ActivePlanScreen, useActivePlanGate } from "@/components/site/ActivePlanGate";
import { LegalLinks } from "@/components/site/LegalLinks";
import { PhoneInput, validatePhone } from "@/components/app/PhoneInput";
import { checkoutApi, plansApi, scheduleApi, type InfoDePago, type SlotRef } from "@/lib/api/endpoints";
import { useZonaDelNavegador } from "@/lib/domain/zona-navegador";
import { copAcobrar } from "@/lib/domain/plans";
import { usePromos } from "@/lib/domain/use-promos";
import { mejorPromo } from "@/lib/domain/promos";
import { leerAtribucion } from "@/lib/atribucion";
import { preciosParaMostrar } from "@/components/site/PromoBadge";
import { cookiesDeMeta, useRastrearUnaVez } from "@/lib/meta-pixel";
import { useRenovacion } from "@/lib/domain/renovacion";
import { ZONA_BOGOTA, franjaEnZona, horaEn12, zonaDe } from "@/lib/domain/zona-horaria";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PasoDePago } from "@/components/pago/PasoDePago";
import { borrarPago, guardarPago, leerPago, tomarLlaveDeLaUrl } from "@/lib/pago/pago-en-curso";

export const Route = createFileRoute("/checkout/$planId")({
  head: () => ({ meta: [{ title: "Checkout — FreaknEnglish" }] }),
  // `.catch`: un `slots` raro se ignora (y la página vuelve al selector) en vez
  // de devolver la página de error del servidor.
  validateSearch: z.object({
    slots: z.string().optional().catch(undefined),
    // Pago en curso (cobro dentro del sitio): con esto la página lo retoma al
    // recargar o al volver de Nequi o del banco.
    pago: z.string().optional().catch(undefined),
  }),
  component: CheckoutPage,
});

type InfoDirecta = Extract<InfoDePago, { modo: "direct" }>;
const esDirecto = (i: InfoDePago | undefined | null): i is InfoDirecta => i?.modo === "direct";

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
  const { slots: slotsRaw, pago: pagoRaw } = Route.useSearch();
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const selSlots = useMemo(() => decodeSlots(slotsRaw), [slotsRaw]);

  const { esRenovacion, cargando: cargandoRenovacion, profesor, slots: slotsPropios } = useRenovacion();
  const zonaPropia = zonaDe(user?.timezone);

  // El horario es un paso obligatorio antes del pago (SDD-scheduling-v2)…
  // salvo al renovar, que no vuelve a elegirlo.
  //
  // `cargandoRenovacion` no es una precaución de más: sin él este efecto corre
  // en el primer pintado, antes de que responda la consulta del horario, y
  // devuelve al selector justo a quien queríamos ahorrarle ese paso. Solo se
  // reproduce con caché frío — es decir, con quien llega desde el correo.
  // Pago en curso de este plan: viene en la URL (y la llave, guardada en este
  // navegador o en el enlace copiado desde Instagram). Solo se retoma si la URL
  // lo pide: entrar de cero al checkout empieza un pago nuevo.
  const [pago, setPago] = useState<{ reference: string; llave: string } | null>(null);
  const [buscandoPago, setBuscandoPago] = useState(!!pagoRaw);
  useEffect(() => {
    let vigente = true;
    const p = tomarLlaveDeLaUrl(planId) ?? (pagoRaw ? leerPago(planId, pagoRaw) : null);
    if (p) {
      setPago({ reference: p.reference, llave: p.llave });
      setBuscandoPago(false);
    } else if (pagoRaw) {
      // La referencia sin la llave: este navegador ya no la tiene (se aprobó y
      // se borró, u otro navegador). Si ya está aprobado, a la confirmación;
      // si no, sigue como un checkout normal.
      checkoutApi
        .status({ reference: pagoRaw })
        .then((r) => {
          if (!vigente) return;
          // Aprobado: se queda "buscando" para no rebotar al selector mientras navega.
          if (r.status === "APPROVED") nav({ to: "/checkout/return", search: { reference: pagoRaw }, replace: true });
          else setBuscandoPago(false);
        })
        .catch(() => vigente && setBuscandoPago(false));
    } else {
      setBuscandoPago(false);
    }
    return () => {
      vigente = false;
    };
  }, [planId, pagoRaw, nav]);

  const infoQ = useQuery({ queryKey: ["checkout", "pago-info"], queryFn: () => checkoutApi.pagoInfo(), staleTime: 5 * 60_000 });
  const directo = esDirecto(infoQ.data) ? infoQ.data : null;
  const qc = useQueryClient();

  useEffect(() => {
    if (cargandoRenovacion || esRenovacion || buscandoPago || pago) return;
    if (selSlots.length === 0) nav({ to: "/checkout/schedule/$planId", params: { planId }, replace: true });
  }, [selSlots.length, planId, nav, esRenovacion, cargandoRenovacion, buscandoPago, pago]);

  const availQ = useQuery({
    queryKey: ["schedule", "hints", "confirm", !!user, slotsRaw],
    // Con `planId`, igual que el paso del horario: sin él el backend no sabe
    // cuántas clases pide el plan.
    queryFn: () =>
      user ? scheduleApi.availabilityMine(selSlots, planId) : scheduleApi.availability(selSlots, planId),
    enabled: selSlots.length > 0,
  });
  const assignable = availQ.data?.assignable ?? true;

  const plansQ = useQuery({ queryKey: ["plans"], queryFn: () => plansApi.list() });
  const cfgQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const trm = plansQ.data?.trm?.valueCop ?? 0;
  const plan = useMemo(
    () => (plansQ.data?.plans ?? []).find((p: any) => p.id === planId),
    [plansQ.data, planId],
  );

  // La promo que le corresponde, con TODAS (también las que no se anuncian en
  // precios): lo que se muestra en el resumen tiene que ser lo que se cobra. El
  // servidor decide igual con su propia copia de esta regla.
  const { promos, cargado: promosCargadas } = usePromos();
  const promoAplicada = plan ? mejorPromo(promos, plan, trm, esRenovacion) : null;

  const loggedIn = !!user;
  const zonaNavegador = useZonaDelNavegador();
  const gate = useActivePlanGate();
  const [form, setForm] = useState({ fullName: "", email: "", document: "", phone: "" });
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
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

  // Llegó a la pantalla de pago. Solo cuando de verdad se va a mostrar el
  // formulario: sin horario elegido esta página lo devuelve al selector, y eso
  // no es haber llegado a pagar.
  useRastrearUnaVez(
    "InitiateCheckout",
    () => ({
      content_type: "product",
      content_ids: [planId],
      content_name: plan?.name,
      num_items: 1,
      value: plan ? (promoAplicada ? promoAplicada.precio.finalCop : copAcobrar(plan, trm)) : undefined,
      currency: "COP",
      content_category: esRenovacion ? "renovacion" : "plan_nuevo",
    }),
    !!plan && !gate.blocked && !cargandoRenovacion && promosCargadas && (esRenovacion || selSlots.length > 0),
  );

  // Plan activo lejos de renovación: no puede pagar otro plan.
  if (gate.blocked) return <ActivePlanScreen end={gate.end} />;

  if (plansQ.isLoading) {
    return (
      <main role="status" className="flex min-h-screen items-center justify-center bg-brand-cream text-sm font-semibold text-brand-ink/80">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando…
        </span>
      </main>
    );
  }
  if (!plan) {
    return (
      <main className="min-h-screen bg-brand-cream flex items-center justify-center px-5 py-16">
        <div className="shadow-hard w-full max-w-md border-2 border-brand-ink bg-white p-8 text-center">
          <h1 className="font-display text-xl font-extrabold uppercase text-brand-ink">Plan no encontrado</h1>
          <p className="mt-2 text-sm text-brand-ink/80">El plan <strong>{planId}</strong> no existe.</p>
          <Link to="/checkout" className={`${btnPrimary} mt-6`}>Ver planes</Link>
        </div>
      </main>
    );
  }

  const cop = promoAplicada ? promoAplicada.precio.finalCop : copAcobrar(plan, trm);
  const mostrar = promoAplicada ? preciosParaMostrar(promoAplicada.precio) : null;

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.fullName.trim() || !form.email.trim() || !form.document.trim() || !form.phone.trim()) {
      setError("Nombre, email, documento y celular son obligatorios.");
      return;
    }
    const phoneError = validatePhone(form.phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    if (!loggedIn) {
      if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
      if (password !== password2) { setError("Las contraseñas no coinciden."); return; }
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
        // En una renovación el horario NO viaja desde el navegador: el
        // servidor usa el que ya tiene. Mandarlo desde aquí fue lo que dejó
        // que una estudiante "eligiera" una hora en su zona y se le
        // reasignara el profesor.
        slots: esRenovacion ? undefined : selSlots,
        password: loggedIn ? undefined : password,
        // La cuenta se crea después, cuando el pago se aprueba, así que la zona
        // con la que eligió sus horas viaja con el intento. Sin esto elegía
        // viendo Madrid y entraba a la plataforma viendo Bogotá.
        timezone: loggedIn ? undefined : zonaNavegador,
        // Para que el servidor pueda atribuir la compra al anuncio cuando Wompi
        // la confirme: las cookies del píxel y la página desde la que pagó.
        ...cookiesDeMeta(),
        eventSourceUrl: window.location.href,
        // Con qué enlace llegó: el servidor decide si le toca una promoción.
        atribucion: leerAtribucion() ?? undefined,
      });
      // Cobro en el sitio: se queda aquí y muestra el paso de pago. Si el
      // modo directo no está (o no cargó su configuración), la pasarela.
      const info = created.modo === "direct" ? (directo ?? (await checkoutApi.pagoInfo().catch(() => null))) : null;
      if (info?.modo !== "direct") {
        window.location.href = created.checkoutUrl;
        return;
      }
      guardarPago({ reference: created.reference, llave: created.accessKey, planId });
      setPago({ reference: created.reference, llave: created.accessKey });
      nav({ to: "/checkout/$planId", params: { planId }, search: { slots: slotsRaw, pago: created.reference }, replace: true });
      setLoading(false);
    } catch (err: any) {
      setError(err?.message ?? "No pudimos iniciar el pago. Intenta de nuevo.");
      setLoading(false);
    }
  }

  const lockField = loggedIn; // datos del usuario logueado no se editan
  const pagando = !!pago && !!directo;

  function alAprobar() {
    if (!pago) return;
    borrarPago();
    qc.invalidateQueries({ queryKey: ["me"] });
    // La misma confirmación que al volver de la pasarela: registra la compra
    // en el píxel y lleva al portal.
    nav({ to: "/checkout/return", search: { reference: pago.reference }, replace: true });
  }

  const horarioDeResumen = [...(esRenovacion ? slotsPropios : selSlots)].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.hour - b.hour,
  );

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-6 md:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex min-h-11 items-center justify-between">
          <Link to="/" aria-label="Inicio" className={`inline-flex min-h-11 items-center ${focusRing}`}>
            <Logo className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {/* Vuelve con su horario marcado: antes volvía a la rejilla vacía
                y había que elegirlo todo otra vez para cambiar una franja. */}
            {esRenovacion ? (
              <Link to="/checkout" className={`${linkPlain}`}>← Volver</Link>
            ) : (
              <Link
                to="/checkout/schedule/$planId"
                params={{ planId }}
                search={{ slots: slotsRaw }}
                className={`${linkPlain}`}
              >
                ← Volver
              </Link>
            )}
          </div>
        </div>

        <header className="mt-3 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">Paso 3 de 3</p>
          <h1 className="mt-2 font-display text-[32px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink md:text-[44px]">
            {pagando ? (
              <>Paga tu <span className="marker-highlight">plan</span></>
            ) : (
              <>{loggedIn ? "Confirma tus" : "Completa tus"} <span className="marker-highlight">datos</span></>
            )}
          </h1>
          <p className="mt-3 text-[15px] text-brand-ink/80">
            {pagando
              ? "Elige cómo quieres pagar."
              : loggedIn
                ? `Compras con tu cuenta. ${directo ? "Al continuar eliges cómo pagar." : "Al continuar irás a la pasarela de pago segura."}`
                : `Los necesitamos para crear tu cuenta. ${directo ? "Al continuar eliges cómo pagar." : "Al continuar irás a la pasarela de pago segura."}`}
          </p>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="shadow-hard border-2 border-brand-ink bg-white p-5 md:p-7">
            {pagando ? (
              <>
                {/* Resumen corto para el teléfono: el aside completo solo aparece en pantallas anchas. */}
                <section
                  aria-label="Resumen"
                  className="mb-4 flex items-baseline justify-between gap-3 border-2 border-brand-ink bg-brand-cream-soft px-3 py-2 text-[13px] text-brand-ink lg:hidden"
                >
                  <span>
                    <b>{plan.name}</b>
                    {promoAplicada ? <> · {promoAplicada.promo.checkoutLabel?.trim() || "Promo"}</> : null}
                  </span>
                  <span className="shrink-0">
                    {promoAplicada ? (
                      <span className="mr-1.5 text-xs text-brand-ink/70 line-through">
                        {copFmt.format(promoAplicada.precio.listaCop)}
                      </span>
                    ) : null}
                    <b className="font-display text-[17px] font-extrabold">{copFmt.format(cop)}</b>
                  </span>
                </section>
                <PasoDePago
                  info={directo!}
                  pago={pago!}
                  datos={{ telefono: form.phone, documento: form.document, nombre: form.fullName }}
                  onAprobado={alAprobar}
                />
              </>
            ) : buscandoPago || (pago && infoQ.isLoading) ? (
              <p role="status" className="inline-flex items-center gap-2 py-10 text-sm font-semibold text-brand-ink/80">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando…
              </p>
            ) : (
            <>
            {loggedIn ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-2 border-brand-ink bg-brand-cream-soft px-4 py-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-brand-ink">
                  <UserCog className="size-4" /> Comprando como <strong>{user!.email}</strong>
                </span>
                <button
                  type="button"
                  onClick={async () => { await signOut(); }}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-brand-ink bg-white px-4 text-xs font-bold text-brand-ink hover:bg-brand-cream-soft ${focusRing}`}
                >
                  <LogOut className="size-3.5" /> No soy yo · usar otra cuenta
                </button>
              </div>
            ) : (
              <div className="border-2 border-brand-ink bg-brand-cream-soft px-4 py-3 text-sm text-brand-ink">
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" search={{ redirect: `/checkout/${planId}${slotsRaw ? `?slots=${slotsRaw}` : ""}` }} className="font-bold underline">
                  Inicia sesión
                </Link>{" "}
                y volvemos aquí para autocompletar tus datos.
              </div>
            )}

            {selSlots.length > 0 && !availQ.isLoading && !assignable ? (
              <div role="note" className="mt-4 border-2 border-brand-ink bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
                Ese horario está muy solicitado 💛 Completa tu compra con tranquilidad: te contactamos en
                menos de 24&nbsp;h hábiles para coordinar tu profesor. <strong>Tu cupo queda garantizado.</strong>
              </div>
            ) : null}

            <form onSubmit={submitForm} className="mt-5 flex flex-col gap-4">
              <Field label="Nombre completo" htmlFor="fullName">
                <input id="fullName" className={inputClass} value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  autoComplete="name" required readOnly={lockField} disabled={lockField} />
              </Field>
              <Field label="Correo" htmlFor="email" hint={loggedIn ? "El de tu cuenta." : "Aquí te enviaremos la confirmación."}>
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
                <Field label="Celular" htmlFor="phone">
                  <PhoneInput id="phone" value={form.phone}
                    onChange={(phone) => setForm({ ...form, phone })}
                    required disabled={lockField} />
                </Field>
              </div>
              {!loggedIn ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Contraseña" htmlFor="password" hint="Mínimo 8 caracteres — con ella entrarás a tu portal.">
                    <input id="password" type="password" className={inputClass} value={password}
                      onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
                  </Field>
                  <Field label="Confirmar contraseña" htmlFor="password2">
                    <input id="password2" type="password" className={inputClass} value={password2}
                      onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required minLength={8} />
                  </Field>
                </div>
              ) : null}
              <ErrorBox>{error}</ErrorBox>
              <button type="submit" disabled={loading} className={`${btnPrimary} mt-1`}>
                {loading ? (directo ? "Preparando el pago…" : "Redirigiendo al pago…") : "Continuar al pago"}
              </button>
              <LegalLinks />
            </form>
            </>
            )}
          </div>

          <aside
            className={`border-2 border-brand-ink bg-brand-yellow-soft p-5 md:p-6 lg:sticky lg:top-6 lg:h-fit ${
              pagando ? "hidden lg:block" : ""
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">Tu plan</p>
            <h2 className="mt-1 font-display text-xl font-extrabold uppercase text-brand-ink">{plan.name}</h2>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
              {promoAplicada && mostrar?.enUsd ? (
                <>
                  <span className="font-display text-3xl font-extrabold text-brand-ink">{mostrar.final}</span>
                  <span className="text-sm text-brand-ink/70">USD / mes</span>
                  <span className="ml-1 text-sm text-brand-ink/70 line-through">{mostrar.tachado}</span>
                </>
              ) : (
                <>
                  <span className="font-display text-3xl font-extrabold text-brand-ink">${plan.priceUsd ?? "—"}</span>
                  <span className="text-sm text-brand-ink/70">USD / mes</span>
                </>
              )}
            </div>
            {promoAplicada ? (
              <dl className="mt-3 space-y-1 border-2 border-brand-ink bg-white p-3 text-sm text-brand-ink">
                <div className="flex justify-between gap-3">
                  <dt>Precio</dt>
                  <dd className="text-brand-ink/70 line-through">{copFmt.format(promoAplicada.precio.listaCop)}</dd>
                </div>
                <div className="flex justify-between gap-3 font-bold">
                  <dt>{promoAplicada.promo.checkoutLabel?.trim() || "Descuento"}</dt>
                  <dd>−{copFmt.format(promoAplicada.precio.descuentoCop)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t-2 border-brand-ink pt-1 font-extrabold">
                  <dt>Se cobra</dt>
                  <dd>{copFmt.format(cop)}</dd>
                </div>
                <p className="pt-0.5 text-xs font-normal text-brand-ink/70">TRM en vivo.</p>
              </dl>
            ) : (
              <p className="mt-1 text-xs text-brand-ink/70">Se cobra {copFmt.format(cop)} (TRM en vivo).</p>
            )}
            {horarioDeResumen.length > 0 ? (
              <div className="mt-4 border-2 border-brand-ink bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">
                  {esRenovacion ? "Sigues con lo mismo" : "Tu horario semanal"}
                </p>
                {esRenovacion && profesor ? (
                  <p className="mt-1 text-sm font-bold text-brand-ink">{profesor.fullName}</p>
                ) : null}
                <ul className="mt-1.5 space-y-1 text-sm text-brand-ink">
                  {horarioDeResumen.map((sl) => {
                    // Se muestran las DOS horas: la suya, que es como piensa,
                    // y la de Colombia, que es la que rige. Enseñar solo una
                    // de las dos es lo que produjo el enredo original.
                    const suya = franjaEnZona(sl.weekday, sl.hour, zonaPropia);
                    const propia = zonaPropia !== ZONA_BOGOTA;
                    return (
                      <li key={`${sl.weekday}-${sl.hour}`}>
                        <b>{DAY_NAMES[propia ? suya.weekday : sl.weekday]}</b> ·{" "}
                        {propia ? horaEn12(suya.hour, suya.minuto) : horaEn12(sl.hour)}
                        {propia ? (
                          <span className="text-brand-ink/70">
                            {" "}
                            ({DAY_NAMES[sl.weekday].toLowerCase()} {horaEn12(sl.hour)} en Colombia)
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-brand-ink/70">
                  Clases de {cfgQ.data?.durationMin ?? 50} min.
                  {esRenovacion ? " ¿Necesitas cambiar tu horario? Coordínalo directamente con tu profe." : ""}
                </p>
              </div>
            ) : null}
            <ul className="mt-5 space-y-2 text-sm text-brand-ink">
              {(plan.features ?? []).map((f: string) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-ink" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-2 border-2 border-brand-ink bg-white p-3 text-xs text-brand-ink">
              <ShieldCheck className="size-4 shrink-0 text-brand-ink" />
              Pago seguro. Tus datos viajan cifrados.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

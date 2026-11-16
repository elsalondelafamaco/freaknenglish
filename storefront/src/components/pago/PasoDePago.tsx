import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Loader2, Lock, Check, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import {
  Field,
  inputClass,
  ErrorBox,
  btnPrimary,
  btnSecondary,
  focusRing,
  linkPlain,
  linkTouch,
} from "@/components/site/AuthShell";
import { ApiError } from "@/lib/api/client";
import {
  checkoutApi,
  type DatosDePago,
  type EstadoDePago,
  type InfoDePago,
} from "@/lib/api/endpoints";
import {
  NOMBRE_DEL_MEDIO,
  type MedioDePago,
  ErrorDeTarjeta,
  celularColombiano,
  datosDelNavegador,
  describirRechazo,
  enlaceAChrome,
  esAndroid,
  formatoTarjeta,
  formatoVencimiento,
  huellaAntifraude,
  luhnValido,
  navegadorEmbebido,
  soloDigitos,
  tokenizarTarjeta,
  vencimientoValido,
} from "@/lib/pago/wompi-navegador";
import { enlaceParaOtroNavegador } from "@/lib/pago/pago-en-curso";

type InfoDirecta = Extract<InfoDePago, { modo: "direct" }>;

/** Cada cuánto se pregunta el estado mientras se espera. */
const SONDEO_MS = 2500;
/** Pasado esto se deja de esperar en pantalla (el pago puede aprobarse igual). */
const ESPERA_MAX_MS = 10 * 60 * 1000;

type Fase =
  | { tipo: "cargando" }
  | { tipo: "elegir" }
  | { tipo: "esperando" }
  | { tipo: "banco"; url: string }
  | { tipo: "tresDs"; html: string }
  | { tipo: "otp"; otp: NonNullable<EstadoDePago["otp"]> }
  | { tipo: "lento" }
  | { tipo: "revision" }
  | { tipo: "aprobado" }
  | { tipo: "perdido"; mensaje: string };

const FASES_DE_ESPERA = new Set<Fase["tipo"]>(["esperando", "banco", "tresDs", "otp"]);

/** El medio que más usan los estudiantes: va primero y con la etiqueta "Más usado". */
const MAS_USADO: MedioDePago = "CARD";

/** Logos de los medios (los mismos de jump). La tarjeta lleva un ícono neutro: las marcas varían. */
const LOGO: Partial<Record<MedioDePago, string>> = {
  NEQUI: "/img/pay/nequi.webp",
  PSE: "/img/pay/pse.webp",
  BANCOLOMBIA_TRANSFER: "/img/pay/bancolombia.webp",
  DAVIPLATA: "/img/pay/daviplata.webp",
};

const DETALLE: Record<MedioDePago, string> = {
  CARD: "Visa, Mastercard, Amex, Diners",
  NEQUI: "Aprueba desde tu app",
  PSE: "Débito desde cualquier banco",
  BANCOLOMBIA_TRANSFER: "Desde tu cuenta Bancolombia",
  DAVIPLATA: "Confirma con un código por SMS",
};

function LogoDelMedio({ medio }: { medio: MedioDePago }) {
  const src = LOGO[medio];
  if (!src) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-brand-ink/20 bg-brand-cream text-brand-ink">
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <path d="M2 10h20M6 15h4" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 overflow-hidden rounded-[9px] border border-brand-ink/20 bg-white">
      <img src={src} width={36} height={36} alt="" className="size-full object-cover" />
    </span>
  );
}

const copFmt = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** El HTML del 3DS llega a veces con las entidades escapadas. */
function htmlDelReto(html: string): string {
  try {
    const texto =
      new DOMParser().parseFromString(html, "text/html").documentElement.textContent ?? "";
    return /<\w+/.test(texto) ? texto : html;
  } catch {
    return html;
  }
}

/** Error de red o del servidor: el cobro pudo crearse igual, hay que preguntar antes de reintentar. */
const errorIncierto = (e: unknown) => !(e instanceof ApiError) || e.status >= 500;

export function PasoDePago({
  info,
  pago,
  datos,
  onAprobado,
}: {
  info: InfoDirecta;
  pago: { reference: string; llave: string };
  /** Lo que ya escribió en el formulario, para no pedirlo dos veces. */
  datos: { telefono: string; documento: string; nombre: string };
  onAprobado: (e: EstadoDePago) => void;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "cargando" });
  const [estado, setEstado] = useState<EstadoDePago | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Sin elegir: se muestra la lista de medios, como en jump. Al elegir, su formulario.
  const [medio, setMedio] = useState<MedioDePago | null>(null);
  const [acepta, setAcepta] = useState(false);
  const listaDeMedios = useRef<HTMLDivElement>(null);

  // Formularios por medio.
  const [tarjeta, setTarjeta] = useState({
    numero: "",
    titular: datos.nombre,
    vence: "",
    cvc: "",
    cuotas: "1",
  });
  const [telefono, setTelefono] = useState(celularColombiano(datos.telefono) ?? "");
  const [pse, setPse] = useState({
    banco: "",
    tipoPersona: "0",
    tipoDocumento: "CC",
    documento: soloDigitos(datos.documento),
  });
  const [davi, setDavi] = useState({
    tipoDocumento: "CC",
    documento: soloDigitos(datos.documento),
  });
  const [codigo, setCodigo] = useState("");
  const [otpTexto, setOtpTexto] = useState("Enviando el código al celular de tu Daviplata…");

  // Lo que no tiene que volver a pintar la pantalla.
  const inicioEspera = useRef(0);
  const consultando = useRef(false);
  const pagueAqui = useRef(false); // este navegador acaba de pedir el cobro (y no es una vuelta)
  const yendoAlBanco = useRef(false);
  const retoVisto = useRef(false);
  const otpHecho = useRef(false);
  const aprobado = useRef(false);

  const [embebido, setEmbebido] = useState<ReturnType<typeof navegadorEmbebido>>(null);
  const [android, setAndroid] = useState(false);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    setEmbebido(navegadorEmbebido(navigator.userAgent));
    setAndroid(esAndroid(navigator.userAgent));
    // La huella antifraude se carga desde ya: al pagar con tarjeta ya está lista.
    void huellaAntifraude(info.llavePublica);
  }, [info.llavePublica]);

  /** Lleva la pantalla al paso que corresponde según el estado del pago. */
  const aplicar = useCallback(
    (e: EstadoDePago) => {
      setEstado(e);
      if (e.estado === "APPROVED") {
        if (!aprobado.current) {
          aprobado.current = true;
          onAprobado(e);
        }
        return setFase({ tipo: "aprobado" });
      }
      if (e.estado === "REVISION") return setFase({ tipo: "revision" });
      if (e.estado === "SIN_PAGO") return setFase({ tipo: "elegir" });
      if (e.estado === "DECLINED" || e.estado === "VOIDED" || e.estado === "ERROR") {
        pagueAqui.current = false;
        setAviso(describirRechazo(e.estado, e.mensaje));
        return setFase({ tipo: "elegir" });
      }
      // PENDING
      if (!inicioEspera.current) inicioEspera.current = Date.now();
      if (Date.now() - inicioEspera.current > ESPERA_MAX_MS) return setFase({ tipo: "lento" });
      if (e.tresDs && !retoVisto.current) {
        retoVisto.current = true;
        return setFase({ tipo: "tresDs", html: htmlDelReto(e.tresDs) });
      }
      if (e.otp && !otpHecho.current)
        return setFase((f) => (f.tipo === "otp" ? f : { tipo: "otp", otp: e.otp! }));
      if (e.irAlBanco) {
        // Recién pagó aquí: se va al banco solo. Si es una vuelta (ya fue y
        // regresó), se le ofrece el botón en vez de mandarlo otra vez.
        if (pagueAqui.current && !yendoAlBanco.current) {
          yendoAlBanco.current = true;
          window.location.assign(e.irAlBanco);
        }
        return setFase({ tipo: "banco", url: e.irAlBanco });
      }
      setFase((f) => (f.tipo === "tresDs" ? f : { tipo: "esperando" }));
    },
    [onAprobado],
  );

  const consultar = useCallback(async () => {
    if (consultando.current || aprobado.current) return;
    consultando.current = true;
    try {
      aplicar(await checkoutApi.estadoDePago(pago.reference, pago.llave));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setFase({ tipo: "perdido", mensaje: e.message });
      }
      // Lo demás (red, Wompi lento) se reintenta en el próximo ciclo.
    } finally {
      consultando.current = false;
    }
  }, [aplicar, pago.reference, pago.llave]);

  // Al entrar: ¿hay un pago en curso? Retoma donde iba.
  useEffect(() => {
    void consultar();
  }, [consultar]);

  const esperando = FASES_DE_ESPERA.has(fase.tipo);

  // Sondeo mientras se espera. También mientras carga: si la primera consulta
  // falla (red, un 429), se reintenta en vez de quedarse en "Preparando".
  const sondear = esperando || fase.tipo === "cargando";
  useEffect(() => {
    if (!sondear) return;
    const t = window.setInterval(() => void consultar(), SONDEO_MS);
    return () => window.clearInterval(t);
  }, [sondear, consultar]);

  // Al volver de Nequi, del banco o de otra app: se pregunta al instante. En
  // el navegador de Instagram la página a veces vuelve desde la caché
  // (`pageshow` con `persisted`) sin que corran los temporizadores.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void consultar();
    };
    const desdeCache = (e: PageTransitionEvent) => {
      if (e.persisted) {
        yendoAlBanco.current = false;
        void consultar();
      }
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("pageshow", desdeCache);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("pageshow", desdeCache);
    };
  }, [consultar]);

  // Con un pago esperando no se sale por accidente (atrás, cerrar pestaña).
  // Ir al banco sí: es parte del pago.
  useBlocker({
    // Aprobado: la navegación a la confirmación la hace esta misma página.
    shouldBlockFn: () =>
      !aprobado.current &&
      !window.confirm(
        "Tu pago está en curso. Si sales ahora puede que no veas la confirmación. ¿Salir igual?",
      ),
    enableBeforeUnload: () => !yendoAlBanco.current && !aprobado.current,
    disabled: !esperando,
  });

  // Daviplata: el código se pide al entrar al paso.
  const otpActual = fase.tipo === "otp" ? fase.otp : null;
  const llamarOtp = useCallback(
    async (url: string, body?: unknown) => {
      if (!otpActual) throw new Error("sin otp");
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${otpActual.token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    [otpActual],
  );
  const enviarOtp = useCallback(async () => {
    if (!otpActual) return;
    setOtpTexto("Enviando el código al celular de tu Daviplata…");
    try {
      await llamarOtp(otpActual.enviar);
      setOtpTexto("Escribe el código de 6 dígitos que te llegó por mensaje de texto.");
    } catch {
      setOtpTexto("No pudimos enviar el código. Toca “Reenviar código”.");
    }
  }, [llamarOtp, otpActual]);
  useEffect(() => {
    if (otpActual) void enviarOtp();
    // Solo al entrar al paso del código.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpActual?.token]);

  async function validarOtp() {
    if (!otpActual) return;
    if (!/^\d{6}$/.test(codigo)) return setError("El código tiene 6 dígitos.");
    setError(null);
    setEnviando(true);
    try {
      await llamarOtp(otpActual.validar, { code: codigo });
      otpHecho.current = true;
      setFase({ tipo: "esperando" });
      void consultar();
    } catch {
      setCodigo("");
      setError("El código no es válido. Revísalo e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  /** Arma lo que pide cada medio. Devuelve un texto de error si falta algo. */
  async function armar(): Promise<DatosDePago | string> {
    if (!medio) return "Elige un medio de pago.";
    switch (medio) {
      case "CARD": {
        if (!luhnValido(tarjeta.numero)) return "Revisa el número de la tarjeta.";
        if (tarjeta.titular.trim().length < 3)
          return "Escribe el nombre como aparece en la tarjeta.";
        const vence = vencimientoValido(tarjeta.vence);
        if (!vence) return "Revisa la fecha de vencimiento (MM/AA).";
        if (!/^\d{3,4}$/.test(tarjeta.cvc)) return "Revisa el código de seguridad (CVC).";
        const token = await tokenizarTarjeta(info.apiUrl, info.llavePublica, {
          numero: tarjeta.numero,
          cvc: tarjeta.cvc,
          mes: vence.mes,
          anio: vence.anio,
          titular: tarjeta.titular,
        });
        const huella = await huellaAntifraude(info.llavePublica);
        return {
          metodo: "CARD",
          token,
          cuotas: Number(tarjeta.cuotas) || 1,
          browserInfo: datosDelNavegador(),
          sessionId: huella.sessionId,
          deviceId: huella.deviceId,
        };
      }
      case "NEQUI": {
        const cel = celularColombiano(telefono);
        if (!cel) return "Escribe el celular de tu Nequi: 10 dígitos, empieza por 3.";
        return { metodo: "NEQUI", telefono: cel };
      }
      case "PSE": {
        if (!pse.banco) return "Elige tu banco.";
        const doc = pse.documento.trim();
        if (doc.length < 5) return "Revisa el número de documento.";
        const cel = celularColombiano(telefono);
        if (!cel) return "PSE pide un celular colombiano de 10 dígitos.";
        return {
          metodo: "PSE",
          banco: pse.banco,
          tipoPersona: pse.tipoPersona === "1" ? 1 : 0,
          tipoDocumento: pse.tipoDocumento,
          documento: doc,
          telefono: cel,
        };
      }
      case "BANCOLOMBIA_TRANSFER":
        return { metodo: "BANCOLOMBIA_TRANSFER" };
      case "DAVIPLATA": {
        const doc = davi.documento.trim();
        if (doc.length < 5) return "Revisa el número de documento.";
        return { metodo: "DAVIPLATA", tipoDocumento: davi.tipoDocumento, documento: doc };
      }
    }
  }

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    if (!acepta)
      return setError("Para pagar, acepta el reglamento de Wompi y el tratamiento de tus datos.");
    setEnviando(true);
    try {
      const cuerpo = await armar();
      if (typeof cuerpo === "string") return setError(cuerpo);
      setAviso(null);
      pagueAqui.current = true;
      retoVisto.current = false;
      otpHecho.current = false;
      inicioEspera.current = Date.now();
      try {
        const r = await checkoutApi.pagar(pago.reference, { ...cuerpo, llave: pago.llave });
        if (r.reanudado) {
          // Ya había uno en curso (otra pestaña, doble toque): se sigue con ese.
          pagueAqui.current = false;
          setAviso("Ya tenías un pago en curso. Seguimos con ese para no cobrarte dos veces.");
        }
        aplicar(r);
      } catch (err) {
        if (!errorIncierto(err)) {
          pagueAqui.current = false;
          return setError((err as Error).message);
        }
        // Se cortó la red o el servidor no contestó: el cobro pudo crearse.
        // Se pregunta antes de dejarlo reintentar, para no cobrar dos veces.
        try {
          const r = await checkoutApi.estadoDePago(pago.reference, pago.llave);
          if (
            r.estado === "SIN_PAGO" ||
            (r.estado !== "PENDING" && r.estado !== "APPROVED" && r.estado !== "REVISION")
          ) {
            pagueAqui.current = false;
            setError("No pudimos conectar con el pago. Revisa tu conexión e intenta de nuevo.");
            setEstado(r);
            return;
          }
          aplicar(r);
        } catch {
          pagueAqui.current = false;
          setError(
            "Se cortó la conexión. Estamos revisando si el pago alcanzó a salir: espera aquí antes de intentar de nuevo.",
          );
          setFase({ tipo: "esperando" });
        }
      }
    } catch (err) {
      pagueAqui.current = false;
      setError(
        err instanceof ErrorDeTarjeta
          ? err.message
          : "No pudimos procesar el pago. Intenta de nuevo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  const monto = estado ? copFmt.format(estado.amountInCents / 100) : null;
  const nombreMedio = estado?.metodo
    ? (NOMBRE_DEL_MEDIO[estado.metodo as MedioDePago] ?? null)
    : null;

  const bannerEmbebido = embebido ? (
    <div role="note" className="border-2 border-brand-ink bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
      <p>
        Estás en el navegador de {embebido}. Si el pago no avanza, ábrelo en el navegador de tu
        celular: sigues con el mismo pago, sin pagar dos veces.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            const url = enlaceParaOtroNavegador(pago);
            try {
              await navigator.clipboard.writeText(url);
              setCopiado(true);
            } catch {
              window.prompt("Copia este enlace y ábrelo en tu navegador:", url);
            }
          }}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-brand-ink bg-white px-4 text-xs font-bold text-brand-ink ${focusRing}`}
        >
          <Copy className="size-3.5" /> {copiado ? "Enlace copiado" : "Copiar enlace"}
        </button>
        {android ? (
          <a
            href={enlaceAChrome(enlaceParaOtroNavegador(pago))}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-brand-ink bg-white px-4 text-xs font-bold text-brand-ink ${focusRing}`}
          >
            <ExternalLink className="size-3.5" /> Abrir en Chrome
          </a>
        ) : null}
      </div>
    </div>
  ) : null;

  if (fase.tipo === "cargando") {
    return (
      <div role="status" className="flex items-center gap-2 py-10 text-sm font-semibold text-brand-ink/80">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Preparando tu pago…
      </div>
    );
  }

  if (fase.tipo === "aprobado") {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-full border-2 border-brand-ink bg-brand-yellow text-brand-ink shadow-hard [--hard-color:var(--brand-ink)] [--hard-x:4px]"
        >
          <Check className="size-7" strokeWidth={3} />
        </span>
        <p className="font-display text-2xl font-extrabold uppercase text-brand-ink">¡Pago aprobado!</p>
        <a href={`/checkout/return?reference=${encodeURIComponent(pago.reference)}`} className={btnPrimary}>
          Continuar
        </a>
      </div>
    );
  }

  if (fase.tipo === "perdido") {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBox>{fase.mensaje}</ErrorBox>
        <a href="/checkout" className={btnPrimary}>
          Ver planes
        </a>
        <EnlaceWhatsApp />
      </div>
    );
  }

  if (fase.tipo === "revision") {
    return (
      <div className="flex flex-col gap-3">
        <div role="status" className="border-2 border-brand-ink bg-brand-yellow-soft px-4 py-4 text-sm text-brand-ink">
          <p className="font-bold">Recibimos tu pago y lo estamos revisando.</p>
          <p className="mt-1 text-brand-ink/80">
            No vuelvas a pagar. Te escribimos por correo o WhatsApp en cuanto quede listo.
          </p>
        </div>
        <EnlaceWhatsApp />
      </div>
    );
  }

  if (fase.tipo === "lento") {
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="border-2 border-brand-ink bg-brand-yellow-soft px-4 py-4 text-sm text-brand-ink">
          <p className="font-bold">Tu pago sigue en verificación.</p>
          <p className="mt-1 text-brand-ink/80">
            Si se aprueba, te llega un correo y tu plan se activa solo. No vuelvas a pagar mientras
            tanto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            inicioEspera.current = Date.now();
            void consultar();
          }}
          className={btnSecondary}
        >
          Ver estado del pago
        </button>
        {estado && !estado.enCurso ? (
          <button
            type="button"
            onClick={() => setFase({ tipo: "elegir" })}
            className={`${linkTouch} self-start text-sm`}
          >
            No lo aprobé: probar con otro medio
          </button>
        ) : null}
        <EnlaceWhatsApp />
      </div>
    );
  }

  if (esperando) {
    const medioEnCurso = (estado?.metodo as MedioDePago | undefined) ?? undefined;
    return (
      <div className="flex flex-col gap-4">
        {bannerEmbebido}
        {aviso ? (
          <p role="status" className="border-2 border-brand-ink bg-brand-yellow-soft px-3 py-2 text-sm text-brand-ink">
            {aviso}
          </p>
        ) : null}
        {fase.tipo === "tresDs" ? (
          <>
            <p className="text-sm text-brand-ink/80">
              Tu banco pide confirmar que eres tú. Completa la verificación:
            </p>
            <iframe
              title="Verificación 3-D Secure de tu banco"
              srcDoc={fase.html}
              sandbox="allow-scripts allow-forms allow-top-navigation-by-user-activation allow-popups"
              className="min-h-[480px] w-full border-2 border-brand-ink bg-white"
            />
          </>
        ) : fase.tipo === "otp" ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[26px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-brand-ink">
              Escribe tu código
            </h2>
            <p role="status" className="text-sm text-brand-ink/80">{otpTexto}</p>
            <input
              className={`${inputClass} h-14 text-center text-2xl font-bold tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(soloDigitos(e.target.value).slice(0, 6))}
              aria-label="Código de 6 dígitos"
            />
            <ErrorBox>{error}</ErrorBox>
            <button type="button" disabled={enviando} onClick={validarOtp} className={btnPrimary}>
              {enviando ? "Confirmando…" : "Confirmar pago"}
            </button>
            <button
              type="button"
              onClick={() => void enviarOtp()}
              className={`${linkTouch} self-start text-sm`}
            >
              Reenviar código
            </button>
          </div>
        ) : fase.tipo === "banco" ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[26px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-brand-ink">
              Te llevamos a tu banco
            </h2>
            <p className="text-sm text-brand-ink/80">
              Termina el pago en la página de tu banco. Al terminar vuelves aquí solo; si no,
              regresa a esta pestaña.
            </p>
            <a
              href={fase.url}
              onClick={() => {
                yendoAlBanco.current = true;
              }}
              className={btnPrimary}
            >
              Ir a mi banco
            </a>
          </div>
        ) : estado?.metodo === "NEQUI" ? (
          <Espera
            etiqueta="Pago pendiente · Nequi"
            titulo="Revisa tu app de Nequi"
            monto={monto}
            medio={medioEnCurso}
            chip="Esperando tu aprobación"
            cuerpo={
              <>
                Te llegó una notificación{monto ? ` por ${monto}` : ""}. Apruébala en Nequi y vuelve: esta
                pantalla se actualiza sola.
              </>
            }
          />
        ) : estado?.metodo === "PSE" || estado?.metodo === "BANCOLOMBIA_TRANSFER" ? (
          <Espera
            titulo="Te llevamos a tu banco…"
            monto={monto}
            medio={medioEnCurso}
            cuerpo="Un momento: te conectamos con tu banco para terminar el pago."
          />
        ) : (
          <Espera
            titulo={`Confirmando tu pago${nombreMedio ? ` con ${nombreMedio}` : ""}…`}
            monto={monto}
            medio={medioEnCurso}
            cuerpo="Toma unos segundos. Esta pantalla se actualiza sola."
          />
        )}
        {fase.tipo !== "otp" ? <ErrorBox>{error}</ErrorBox> : null}
        {estado && !estado.enCurso && estado.estado === "PENDING" ? (
          <button
            type="button"
            onClick={() => setFase({ tipo: "elegir" })}
            className={`${linkTouch} self-start text-sm`}
          >
            No lo aprobé: probar con otro medio
          </button>
        ) : null}
        <EnlaceWhatsApp />
      </div>
    );
  }

  // Elegir medio y pagar.
  const razonDeshabilitado = !medio
    ? "Elige cómo quieres pagar."
    : !acepta
      ? "Acepta el reglamento de Wompi para poder pagar."
      : null;

  /** Los campos que pide el medio elegido; van justo debajo de su fila. */
  const campos = (
    <div className="flex flex-col gap-3 px-0.5 pb-2 pt-3">
      {medio === "CARD" ? (
        <>
          <Field label="Número de la tarjeta" htmlFor="card-number">
            <input
              id="card-number"
              className={inputClass}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={tarjeta.numero}
              onChange={(e) => setTarjeta({ ...tarjeta, numero: formatoTarjeta(e.target.value) })}
            />
          </Field>
          <Field label="Nombre en la tarjeta" htmlFor="card-holder">
            <input
              id="card-holder"
              className={inputClass}
              autoComplete="cc-name"
              value={tarjeta.titular}
              onChange={(e) => setTarjeta({ ...tarjeta, titular: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Vence" htmlFor="card-exp">
              <input
                id="card-exp"
                className={inputClass}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/AA"
                value={tarjeta.vence}
                onChange={(e) =>
                  setTarjeta({ ...tarjeta, vence: formatoVencimiento(e.target.value) })
                }
              />
            </Field>
            <Field label="CVC" htmlFor="card-cvc">
              <input
                id="card-cvc"
                className={inputClass}
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                value={tarjeta.cvc}
                onChange={(e) =>
                  setTarjeta({ ...tarjeta, cvc: soloDigitos(e.target.value).slice(0, 4) })
                }
              />
            </Field>
            <Field label="Cuotas" htmlFor="card-inst">
              <select
                id="card-inst"
                className={inputClass}
                value={tarjeta.cuotas}
                onChange={(e) => setTarjeta({ ...tarjeta, cuotas: e.target.value })}
              >
                {Array.from({ length: 36 }, (_, i) => String(i + 1)).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </>
      ) : null}

      {medio === "NEQUI" || medio === "PSE" ? (
        <Field
          label={medio === "NEQUI" ? "Celular de tu Nequi" : "Celular"}
          htmlFor="pay-phone"
          hint={
            medio === "NEQUI"
              ? "Te llega una notificación a la app para aprobar el pago."
              : undefined
          }
        >
          <input
            id="pay-phone"
            className={inputClass}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="3001234567"
            value={telefono}
            onChange={(e) => setTelefono(soloDigitos(e.target.value).slice(0, 10))}
          />
        </Field>
      ) : null}

      {medio === "PSE" ? (
        <>
          <Field label="Banco" htmlFor="pse-bank">
            <select
              id="pse-bank"
              className={inputClass}
              value={pse.banco}
              onChange={(e) => setPse({ ...pse, banco: e.target.value })}
            >
              <option value="">Elige tu banco</option>
              {info.bancos.map((b) => (
                <option key={b.codigo} value={b.codigo}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Persona" htmlFor="pse-type">
              <select
                id="pse-type"
                className={inputClass}
                value={pse.tipoPersona}
                onChange={(e) => setPse({ ...pse, tipoPersona: e.target.value })}
              >
                <option value="0">Natural</option>
                <option value="1">Jurídica</option>
              </select>
            </Field>
            <Field label="Documento" htmlFor="pse-doctype">
              <select
                id="pse-doctype"
                className={inputClass}
                value={pse.tipoDocumento}
                onChange={(e) => setPse({ ...pse, tipoDocumento: e.target.value })}
              >
                {["CC", "CE", "NIT", "PP", "TI"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Número" htmlFor="pse-doc">
              <input
                id="pse-doc"
                className={inputClass}
                inputMode="numeric"
                value={pse.documento}
                onChange={(e) =>
                  setPse({
                    ...pse,
                    documento: e.target.value.replace(/[^0-9A-Za-z-]/g, "").slice(0, 20),
                  })
                }
              />
            </Field>
          </div>
        </>
      ) : null}

      {medio === "BANCOLOMBIA_TRANSFER" ? (
        <p className="text-sm text-brand-ink/80">
          Te llevamos a Bancolombia para que apruebes el pago con tu usuario de la app o la sucursal
          virtual.
        </p>
      ) : null}

      {medio === "DAVIPLATA" ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Documento" htmlFor="dp-doctype">
            <select
              id="dp-doctype"
              className={inputClass}
              value={davi.tipoDocumento}
              onChange={(e) => setDavi({ ...davi, tipoDocumento: e.target.value })}
            >
              {["CC", "CE", "PP", "TI"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field
              label="Número"
              htmlFor="dp-doc"
              hint="El de tu Daviplata. Te enviamos un código por SMS."
            >
              <input
                id="dp-doc"
                className={inputClass}
                inputMode="numeric"
                value={davi.documento}
                onChange={(e) =>
                  setDavi({
                    ...davi,
                    documento: e.target.value.replace(/[^0-9A-Za-z-]/g, "").slice(0, 20),
                  })
                }
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={pagar} className="flex flex-col gap-4">
      {bannerEmbebido}
      {aviso ? (
        <div role="alert" className="border-2 border-red-700 bg-red-50 px-3 py-3 text-sm text-red-800">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{aviso}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setMedio(null);
              setError(null);
              listaDeMedios.current?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
            className={`${linkTouch} mt-1 text-sm text-red-800`}
          >
            Probar con otro medio
          </button>
        </div>
      ) : null}

      <div
        ref={listaDeMedios}
        role="radiogroup"
        aria-label="Medio de pago"
        className="flex flex-col gap-2"
      >
        {[...info.medios]
          // El más usado (tarjeta) va primero.
          .sort((a, b) => Number(b === MAS_USADO) - Number(a === MAS_USADO))
          .map((m) => {
            const activo = m === medio;
            return (
              <div key={m}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => {
                    setMedio(m);
                    setError(null);
                  }}
                  className={`flex min-h-[56px] w-full items-center justify-between gap-3 border-2 border-brand-ink px-3 py-2 text-left transition-colors ${focusRing} ${
                    activo
                      ? "bg-brand-ink text-brand-cream"
                      : "bg-white text-brand-ink hover:bg-brand-cream-soft"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <LogoDelMedio medio={m} />
                    <span className="flex flex-col">
                      <span className="text-[15px] font-bold">
                        {NOMBRE_DEL_MEDIO[m]}
                        {m === MAS_USADO ? (
                          <span className="ml-2 rounded-full border-[1.5px] border-brand-ink bg-brand-yellow px-2 py-px align-[1px] font-display text-[11px] font-extrabold uppercase tracking-[0.06em] text-brand-ink">
                            Más usado
                          </span>
                        ) : null}
                      </span>
                      <span className={`text-xs ${activo ? "text-brand-cream/80" : "text-brand-ink/70"}`}>
                        {DETALLE[m]}
                      </span>
                    </span>
                  </span>
                  {/* El círculo siempre ocupa su sitio: elegir no mueve nada. */}
                  <span
                    aria-hidden="true"
                    className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                      activo ? "border-brand-cream bg-brand-cream text-brand-ink" : "border-brand-ink"
                    }`}
                  >
                    {activo ? <Check className="size-3.5" strokeWidth={3.4} /> : null}
                  </span>
                </button>
                {activo ? campos : null}
              </div>
            );
          })}
      </div>

      <p className="text-xs text-brand-ink/70">
        Se cobra en pesos colombianos (TRM del día). Los datos de tu tarjeta no pasan por nuestros
        servidores.
      </p>

      <label className="flex items-start gap-3 text-[13px] text-brand-ink">
        <input
          type="checkbox"
          className={`size-6 shrink-0 accent-brand-ink ${focusRing}`}
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
        />
        <span className="pt-0.5">
          Acepto el{" "}
          <a
            href={info.terminosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline"
          >
            reglamento de Wompi
          </a>{" "}
          y autorizo el{" "}
          <a
            href={info.datosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline"
          >
            tratamiento de mis datos personales
          </a>
          .
        </span>
      </label>

      {/* Zona de pago siempre a la mano: en el teléfono queda pegada abajo. */}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-1 border-t-2 border-brand-ink bg-white px-5 pb-3 pt-3 md:-mx-7 md:-mb-7 md:px-7">
        <ErrorBox>{error}</ErrorBox>
        <p className="mb-2 mt-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-ink">
          <Lock className="size-3.5" aria-hidden /> Pago seguro con Wompi · Sin permanencia
        </p>
        <button
          type="submit"
          disabled={enviando || !!razonDeshabilitado}
          aria-describedby={razonDeshabilitado ? "razon-pago" : undefined}
          className={btnPrimary}
        >
          {enviando
            ? "Procesando…"
            : medio === "PSE" || medio === "BANCOLOMBIA_TRANSFER"
              ? "Ir a mi banco y pagar"
              : medio === "NEQUI"
                ? "Enviar solicitud a Nequi"
                : medio === "DAVIPLATA"
                  ? "Enviarme el código"
                  : `Pagar${monto ? ` ${monto}` : ""}`}
        </button>
        {razonDeshabilitado ? (
          <p id="razon-pago" className="mt-2 text-center text-[13px] font-bold text-brand-ink">
            {razonDeshabilitado}
          </p>
        ) : null}
        <p className="text-center">
          <EnlaceWhatsApp />
        </p>
      </div>
    </form>
  );
}

/** Enlace de ayuda por WhatsApp, el mismo en todas las pantallas del pago. */
function EnlaceWhatsApp() {
  return (
    <a
      href="https://wa.me/573012646770"
      target="_blank"
      rel="noopener noreferrer"
      className={`${linkPlain} min-h-9 text-xs`}
    >
      ¿Dudas? Escríbenos por WhatsApp
    </a>
  );
}

/** Tarjeta de espera: el monto, qué hay que hacer y que la pantalla se actualiza sola. */
function Espera({
  etiqueta,
  titulo,
  cuerpo,
  monto,
  medio,
  chip,
}: {
  etiqueta?: string;
  titulo: string;
  cuerpo: React.ReactNode;
  monto: string | null;
  medio?: MedioDePago;
  chip?: string;
}) {
  return (
    <section role="status" aria-live="polite" className="shadow-hard border-2 border-brand-ink bg-white p-4 md:p-5">
      {etiqueta ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">{etiqueta}</p>
      ) : null}
      <h2 className="mt-1 font-display text-[26px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-brand-ink">
        {titulo}
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <svg
          aria-hidden="true"
          viewBox="0 0 56 56"
          fill="none"
          className="size-14 shrink-0 animate-spin motion-reduce:animate-none"
        >
          <circle cx="28" cy="28" r="23" stroke="currentColor" strokeOpacity="0.2" strokeWidth="6" className="text-brand-ink" />
          <path d="M28 5a23 23 0 0 1 23 23" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-brand-ink" />
        </svg>
        {monto ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">Se cobra hoy</p>
            <p className="mt-1 font-display text-[28px] font-extrabold leading-none text-brand-ink">{monto}</p>
          </div>
        ) : null}
      </div>
      <p className="mt-4 flex items-center gap-3 text-sm text-brand-ink/80">
        {medio ? <LogoDelMedio medio={medio} /> : null}
        <span>{cuerpo}</span>
      </p>
      {chip ? (
        <p className="mt-3">
          <span className="inline-flex rounded-full border-[1.5px] border-brand-ink bg-brand-yellow px-3 py-1 text-xs font-bold text-brand-ink">
            {chip}
          </span>
        </p>
      ) : null}
    </section>
  );
}

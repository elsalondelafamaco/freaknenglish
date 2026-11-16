import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { CreditCard, Landmark, Loader2, Smartphone, ShieldCheck, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { Field, inputClass, ErrorBox } from "@/components/site/AuthShell";
import { ApiError } from "@/lib/api/client";
import { checkoutApi, type DatosDePago, type EstadoDePago, type InfoDePago } from "@/lib/api/endpoints";
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

const ICONO: Record<MedioDePago, typeof CreditCard> = {
  CARD: CreditCard,
  NEQUI: Smartphone,
  PSE: Landmark,
  BANCOLOMBIA_TRANSFER: Landmark,
  DAVIPLATA: Smartphone,
};

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** El HTML del 3DS llega a veces con las entidades escapadas. */
function htmlDelReto(html: string): string {
  try {
    const texto = new DOMParser().parseFromString(html, "text/html").documentElement.textContent ?? "";
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
  const [medio, setMedio] = useState<MedioDePago>(info.medios[0] ?? "CARD");
  const [acepta, setAcepta] = useState(false);

  // Formularios por medio.
  const [tarjeta, setTarjeta] = useState({ numero: "", titular: datos.nombre, vence: "", cvc: "", cuotas: "1" });
  const [telefono, setTelefono] = useState(celularColombiano(datos.telefono) ?? "");
  const [pse, setPse] = useState({ banco: "", tipoPersona: "0", tipoDocumento: "CC", documento: soloDigitos(datos.documento) });
  const [davi, setDavi] = useState({ tipoDocumento: "CC", documento: soloDigitos(datos.documento) });
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
      if (e.otp && !otpHecho.current) return setFase((f) => (f.tipo === "otp" ? f : { tipo: "otp", otp: e.otp! }));
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
      !window.confirm("Tu pago está en curso. Si sales ahora puede que no veas la confirmación. ¿Salir igual?"),
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
    switch (medio) {
      case "CARD": {
        if (!luhnValido(tarjeta.numero)) return "Revisa el número de la tarjeta.";
        if (tarjeta.titular.trim().length < 3) return "Escribe el nombre como aparece en la tarjeta.";
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
    if (!acepta) return setError("Para pagar, acepta el reglamento de Wompi y el tratamiento de tus datos.");
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
          if (r.estado === "SIN_PAGO" || (r.estado !== "PENDING" && r.estado !== "APPROVED" && r.estado !== "REVISION")) {
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
      setError(err instanceof ErrorDeTarjeta ? err.message : "No pudimos procesar el pago. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const monto = estado ? copFmt.format(estado.amountInCents / 100) : null;
  const nombreMedio = estado?.metodo ? (NOMBRE_DEL_MEDIO[estado.metodo as MedioDePago] ?? null) : null;

  const bannerEmbebido = embebido ? (
    <div className="rounded-2xl border border-brand-line bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
      <p>
        Estás en el navegador de {embebido}. Si el pago no avanza, ábrelo en el navegador de tu celular: sigues con
        el mismo pago, sin pagar dos veces.
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
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/20 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink"
        >
          <Copy className="size-3.5" /> {copiado ? "Enlace copiado" : "Copiar enlace"}
        </button>
        {android ? (
          <a
            href={enlaceAChrome(enlaceParaOtroNavegador(pago))}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/20 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink"
          >
            <ExternalLink className="size-3.5" /> Abrir en Chrome
          </a>
        ) : null}
      </div>
    </div>
  ) : null;

  if (fase.tipo === "cargando") {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-brand-ink/60">
        <Loader2 className="size-4 animate-spin" /> Preparando tu pago…
      </div>
    );
  }

  if (fase.tipo === "aprobado") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-brand-cream/50 px-4 py-6 text-center">
        <p className="font-semibold text-brand-ink">¡Pago aprobado!</p>
        <a
          href={`/checkout/return?reference=${encodeURIComponent(pago.reference)}`}
          className="text-sm font-semibold text-brand-ink underline"
        >
          Continuar
        </a>
      </div>
    );
  }

  if (fase.tipo === "perdido") {
    return (
      <div className="flex flex-col gap-3">
        <ErrorBox>{fase.mensaje}</ErrorBox>
        <a href="/checkout" className="text-sm font-semibold text-brand-ink underline">
          Ver planes
        </a>
      </div>
    );
  }

  if (fase.tipo === "revision") {
    return (
      <div className="rounded-2xl border border-brand-line bg-brand-yellow-soft px-4 py-4 text-sm text-brand-ink">
        <p className="font-semibold">Recibimos tu pago y lo estamos revisando.</p>
        <p className="mt-1 text-brand-ink/75">
          No vuelvas a pagar. Te escribimos por correo o WhatsApp en cuanto quede listo.
        </p>
      </div>
    );
  }

  if (fase.tipo === "lento") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-brand-line bg-brand-yellow-soft px-4 py-4 text-sm text-brand-ink">
          <p className="font-semibold">Tu pago sigue en verificación.</p>
          <p className="mt-1 text-brand-ink/75">
            Si se aprueba, te llega un correo y tu plan se activa solo. No vuelvas a pagar mientras tanto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            inicioEspera.current = Date.now();
            void consultar();
          }}
          className="inline-flex h-11 items-center justify-center rounded-full border border-brand-ink/20 text-sm font-semibold text-brand-ink"
        >
          Ver estado del pago
        </button>
        {estado && !estado.enCurso ? (
          <button
            type="button"
            onClick={() => setFase({ tipo: "elegir" })}
            className="text-sm font-semibold text-brand-ink/70 underline"
          >
            No lo aprobé: probar con otro medio
          </button>
        ) : null}
      </div>
    );
  }

  if (esperando) {
    return (
      <div className="flex flex-col gap-4">
        {bannerEmbebido}
        {aviso ? <p className="rounded-xl bg-brand-cream/60 px-3 py-2 text-sm text-brand-ink/80">{aviso}</p> : null}
        {fase.tipo === "tresDs" ? (
          <>
            <p className="text-sm text-brand-ink/75">Tu banco pide confirmar que eres tú. Completa la verificación:</p>
            <iframe
              title="Verificación 3-D Secure de tu banco"
              srcDoc={fase.html}
              sandbox="allow-scripts allow-forms allow-top-navigation-by-user-activation allow-popups"
              className="min-h-[480px] w-full rounded-2xl border border-brand-line bg-white"
            />
          </>
        ) : fase.tipo === "otp" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-brand-ink/75">{otpTexto}</p>
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
            <button
              type="button"
              disabled={enviando}
              onClick={validarOtp}
              className="inline-flex h-12 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white disabled:opacity-60"
            >
              {enviando ? "Confirmando…" : "Confirmar pago"}
            </button>
            <button type="button" onClick={() => void enviarOtp()} className="text-sm font-semibold text-brand-ink/70 underline">
              Reenviar código
            </button>
          </div>
        ) : fase.tipo === "banco" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-brand-ink/75">
              Termina el pago en la página de tu banco. Al terminar vuelves aquí solo; si no, regresa a esta pestaña.
            </p>
            <a
              href={fase.url}
              onClick={() => {
                yendoAlBanco.current = true;
              }}
              className="inline-flex h-12 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white"
            >
              Ir a mi banco
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-brand-cream/50 px-4 py-6 text-center">
            <Loader2 className="size-8 animate-spin text-brand-ink/50" />
            {estado?.metodo === "NEQUI" ? (
              <>
                <p className="font-semibold text-brand-ink">Abre Nequi y acepta el pago</p>
                <p className="text-sm text-brand-ink/70">
                  Te llegó una notificación por {monto}. Apruébala en la app y vuelve aquí: lo confirmamos solos.
                </p>
              </>
            ) : estado?.metodo === "PSE" || estado?.metodo === "BANCOLOMBIA_TRANSFER" ? (
              <p className="text-sm text-brand-ink/70">Conectando con tu banco…</p>
            ) : (
              <p className="text-sm text-brand-ink/70">
                Confirmando tu pago{nombreMedio ? ` con ${nombreMedio}` : ""}… No cierres esta página.
              </p>
            )}
          </div>
        )}
        {fase.tipo !== "otp" ? <ErrorBox>{error}</ErrorBox> : null}
        {estado && !estado.enCurso && estado.estado === "PENDING" ? (
          <button
            type="button"
            onClick={() => setFase({ tipo: "elegir" })}
            className="text-sm font-semibold text-brand-ink/70 underline"
          >
            No lo aprobé: probar con otro medio
          </button>
        ) : null}
      </div>
    );
  }

  // Elegir medio y pagar.
  return (
    <form onSubmit={pagar} className="flex flex-col gap-4">
      {bannerEmbebido}
      {aviso ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      ) : null}

      <div role="radiogroup" aria-label="Medio de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {info.medios.map((m) => {
          const Icono = ICONO[m];
          const activo = m === medio;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => {
                setMedio(m);
                setError(null);
              }}
              className={`flex h-14 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition ${
                activo ? "border-brand-ink bg-brand-ink text-white" : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40"
              }`}
            >
              <Icono className="size-4" /> {NOMBRE_DEL_MEDIO[m]}
            </button>
          );
        })}
      </div>

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
                onChange={(e) => setTarjeta({ ...tarjeta, vence: formatoVencimiento(e.target.value) })}
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
                onChange={(e) => setTarjeta({ ...tarjeta, cvc: soloDigitos(e.target.value).slice(0, 4) })}
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
          hint={medio === "NEQUI" ? "Te llega una notificación a la app para aprobar el pago." : undefined}
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
                onChange={(e) => setPse({ ...pse, documento: e.target.value.replace(/[^0-9A-Za-z-]/g, "").slice(0, 20) })}
              />
            </Field>
          </div>
        </>
      ) : null}

      {medio === "BANCOLOMBIA_TRANSFER" ? (
        <p className="rounded-xl bg-brand-cream/50 px-3 py-2 text-sm text-brand-ink/75">
          Te llevamos a Bancolombia para que apruebes el pago con tu usuario de la app o la sucursal virtual.
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
            <Field label="Número" htmlFor="dp-doc" hint="El de tu Daviplata. Te enviamos un código por SMS.">
              <input
                id="dp-doc"
                className={inputClass}
                inputMode="numeric"
                value={davi.documento}
                onChange={(e) => setDavi({ ...davi, documento: e.target.value.replace(/[^0-9A-Za-z-]/g, "").slice(0, 20) })}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <label className="flex items-start gap-2 text-sm text-brand-ink/80">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[currentColor]"
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
        />
        <span>
          Acepto el{" "}
          <a href={info.terminosUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            reglamento de Wompi
          </a>{" "}
          y autorizo el{" "}
          <a href={info.datosUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            tratamiento de mis datos personales
          </a>
          .
        </span>
      </label>

      <ErrorBox>{error}</ErrorBox>
      <button
        type="submit"
        disabled={enviando}
        className="inline-flex h-12 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft disabled:opacity-60"
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
      <p className="flex items-center justify-center gap-1.5 text-xs text-brand-ink/55">
        <ShieldCheck className="size-3.5" /> Pago procesado por Wompi (Bancolombia). Los datos de tu tarjeta no pasan
        por nuestros servidores.
      </p>
    </form>
  );
}


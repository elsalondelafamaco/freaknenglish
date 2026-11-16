/**
 * Callback de OAuth (Google → backend → storefront).
 *
 * Flujo:
 *   1. Usuario click "Sign in with Google" → redirige a `${API_URL}/auth/google`.
 *   2. Backend hace el dance OAuth y al final redirige a:
 *        `${STOREFRONT_URL}/auth/callback?token=...`
 *      (y setea la cookie de refresh).
 *   3. Este componente toma el token, hidrata, y navega según el rol.
 *      Si la cuenta no existía, el backend la crea (Google actúa como
 *      registro); el gate de `_authenticated` manda a /onboarding/profile
 *      a quien le falte teléfono/documento.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { btnPrimary } from "@/components/site/AuthShell";
import { finishOAuthLogin } from "@/lib/auth/session";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/auth/callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // El backend envía `token`; se acepta también `accessToken` por compat.
    const token = params.get("token") ?? params.get("accessToken");
    const err = params.get("error");
    // El token no debe quedar en la URL ni en el historial del navegador.
    window.history.replaceState(null, "", "/auth/callback");
    if (err) { setError(err); return; }
    if (!token) { setError("missing_token"); return; }
    (async () => {
      try {
        const u = await finishOAuthLogin(token);
        queryClient.clear();
        const target = u.roles.includes("admin")
          ? "/admin"
          : u.roles.includes("teacher")
          ? "/teacher"
          : "/app";
        nav({ to: target });
      } catch (e: any) {
        setError(e?.message ?? "callback_failed");
      }
    })();
  }, [nav]);

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-6 md:py-12">
      <div className="mx-auto max-w-md">
        <Link to="/" aria-label="Inicio" className="inline-flex min-h-11 items-center">
          <Logo className="h-8 w-auto" />
        </Link>
        {error ? (
          <div role="alert" className="mt-8">
            <h1 className="font-display text-[34px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink">
              No pudimos <span className="marker-highlight">iniciar</span> sesión
            </h1>
            <p className="mt-3 text-[15px] text-brand-ink/80">
              Algo falló al conectar con Google. Inténtalo de nuevo o entra con tu correo y contraseña.
            </p>
            {/* El código técnico queda a la vista solo para soporte. */}
            <p className="mt-2 font-mono text-xs text-brand-ink/70">Detalle: {error}</p>
            <Link to="/login" className={`${btnPrimary} mt-6`}>
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <div role="status" className="mt-16 flex flex-col items-center text-center">
            <Loader2 className="size-10 animate-spin text-brand-ink" aria-hidden />
            <h1 className="mt-5 font-display text-2xl font-extrabold uppercase tracking-[-0.02em] text-brand-ink">
              Conectando con tu cuenta…
            </h1>
          </div>
        )}
      </div>
    </main>
  );
}
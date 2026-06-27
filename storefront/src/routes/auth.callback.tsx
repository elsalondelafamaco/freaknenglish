/**
 * Callback de OAuth (Google → backend → storefront).
 *
 * Flujo:
 *   1. Usuario click "Sign in with Google" → redirige a `${API_URL}/auth/google`.
 *   2. Backend hace el dance OAuth y al final redirige a:
 *        `${STOREFRONT_URL}/auth/callback?accessToken=...`
 *      (y setea la cookie de refresh).
 *   3. Este componente toma el accessToken, hidrata, y navega a /app.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { finishOAuthLogin } from "@/lib/domain/auth";

export const Route = createFileRoute("/auth/callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("accessToken");
    const err = params.get("error");
    if (err) { setError(err); return; }
    if (!token) { setError("missing_token"); return; }
    (async () => {
      try {
        const u = await finishOAuthLogin(token);
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
    <main className="min-h-screen grid place-items-center bg-cream">
      <div className="rounded-2xl border border-ink/10 bg-white p-6 text-center">
        {error ? (
          <>
            <p className="font-semibold text-ink">No pudimos iniciar sesión.</p>
            <p className="mt-1 text-sm text-ink/60">{error}</p>
          </>
        ) : (
          <p className="text-ink/70">Conectando con tu cuenta…</p>
        )}
      </div>
    </main>
  );
}
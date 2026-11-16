import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  AuthShell,
  Divider,
  ErrorBox,
  Field,
  GoogleButton,
  btnPrimary,
  inputClass,
  linkPlain,
  linkTouch,
} from "@/components/site/AuthShell";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSessionSnapshot } from "@/lib/auth/session";
import { homePathFor } from "@/lib/roles";
import { useQueryClient } from "@tanstack/react-query";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Inicia sesión — FreaknEnglish" }],
  }),
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const { signIn, signInWithGoogle } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function defaultRouteForCurrentUser(): string {
    return homePathFor(getSessionSnapshot()?.roles);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      queryClient.clear();
      navigate({ to: redirect ?? defaultRouteForCurrentUser() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    try {
      await signInWithGoogle();
      navigate({ to: redirect ?? defaultRouteForCurrentUser() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Qué bueno verte de nuevo"
      highlight="verte"
      subtitle="Inicia sesión para continuar con tu aprendizaje."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/checkout" className={linkTouch}>
            Elige tu plan
          </Link>
        </>
      }
    >
      {/* El correo va primero: Google no funciona dentro del navegador de
          Instagram, de donde llega buena parte de quienes compran. */}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Correo" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
          />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Link
          to="/forgot-password"
          className={`${linkPlain} -mt-2 self-start text-[13px]`}
        >
          ¿Olvidaste tu contraseña?
        </Link>
        <ErrorBox>{error}</ErrorBox>
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      <Divider>o</Divider>
      <GoogleButton onClick={onGoogle} disabled={busy} label="Continuar con Google" />
    </AuthShell>
  );
}
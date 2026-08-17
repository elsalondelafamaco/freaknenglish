import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  AuthShell,
  Divider,
  ErrorBox,
  Field,
  GoogleButton,
  inputClass,
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
      title="Bienvenido de vuelta"
      subtitle="Inicia sesión para continuar con tu aprendizaje."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/signup" className="font-semibold text-brand-ink hover:underline">
            Crea una aquí
          </Link>
        </>
      }
    >
      <GoogleButton onClick={onGoogle} disabled={busy} label="Continuar con Google" />
      <Divider>o</Divider>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
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
        <ErrorBox>{error}</ErrorBox>
        <button
          type="submit"
          disabled={busy}
          className="mt-1 inline-flex h-11 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft disabled:opacity-60"
        >
          {busy ? "Ingresando…" : "Iniciar sesión"}
        </button>
        <Link
          to="/forgot-password"
          className="text-center text-sm text-brand-ink/70 hover:text-brand-ink"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </AuthShell>
  );
}
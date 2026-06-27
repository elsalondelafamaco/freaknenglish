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
import { authService } from "@/lib/domain/auth";

function DemoCredentials({
  onPick,
}: {
  onPick: (email: string, password: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const accounts = [
    { label: "Estudiante", email: "estudiante@freakn.dev", password: "Freakn123!" },
    { label: "Profesor", email: "profe@freakn.dev", password: "Freakn123!" },
    { label: "Administrador", email: "admin@freakn.dev", password: "Freakn123!" },
  ];
  return (
    <div className="mb-5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-brand-ink/55 transition-colors hover:text-brand-ink"
      >
        {open ? "Ocultar" : "Ver"} cuentas de prueba
      </button>
      {open ? (
        <div className="mt-2 rounded-xl border border-brand-line bg-brand-cream/40 p-3">
          <p className="text-brand-ink/70">
            Selecciona una cuenta para autocompletar el formulario.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {accounts.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => onPick(a.email, a.password)}
                className="rounded-full border border-brand-line bg-white px-2.5 py-1 font-medium text-brand-ink transition-all hover:border-brand-ink hover:bg-brand-ink hover:text-white"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Inicia sesión — Freakn English" }],
  }),
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function defaultRouteForCurrentUser(): string {
    const u = authService.getCurrentUser();
    if (u?.roles.includes("admin")) return "/admin";
    if (u?.roles.includes("teacher")) return "/teacher";
    return "/app";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
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
      <DemoCredentials onPick={(e, p) => { setEmail(e); setPassword(p); }} />
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
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AuthShell,
  Divider,
  ErrorBox,
  Field,
  GoogleButton,
  inputClass,
} from "@/components/site/AuthShell";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Crea tu cuenta — Freakn English" }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    try {
      await signUp(fullName, email, password);
      navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible crear la cuenta.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    try {
      await signInWithGoogle();
      navigate({ to: "/app" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="Empieza a hablar inglés desde el día 1."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-semibold text-brand-ink hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <GoogleButton onClick={onGoogle} disabled={busy} label="Registrarte con Google" />
      <Divider>o</Divider>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Nombre completo" htmlFor="name">
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
          />
        </Field>
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
        <Field
          label="Contraseña"
          htmlFor="password"
          hint="Mínimo 8 caracteres."
        >
          <input
            id="password"
            type="password"
            autoComplete="new-password"
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
          {busy ? "Creando cuenta…" : "Crear cuenta"}
        </button>
        <p className="text-center text-xs text-brand-ink/55">
          Al continuar aceptas nuestros Términos y la Política de Privacidad.
        </p>
      </form>
    </AuthShell>
  );
}
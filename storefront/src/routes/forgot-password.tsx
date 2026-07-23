import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell, ErrorBox, Field, inputClass } from "@/components/site/AuthShell";
import { requestPasswordReset } from "@/lib/auth/session";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "Recupera tu contraseña — Freakn English" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Recupera tu contraseña"
      subtitle="Te enviaremos un enlace para restablecerla."
      footer={
        <Link to="/login" className="font-semibold text-brand-ink hover:underline">
          Volver al inicio de sesión
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-brand-line bg-brand-cream/40 p-4 text-sm text-brand-ink">
          Si existe una cuenta con <strong>{email}</strong>, te llegará un email con instrucciones.
          <p className="mt-2 text-xs text-brand-ink/60">
            (Mock: revisa la consola del navegador para encontrar el enlace de prueba.)
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </Field>
          <ErrorBox>{error}</ErrorBox>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft disabled:opacity-60"
          >
            {busy ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell, ErrorBox, Field, btnPrimary, inputClass, linkTouch } from "@/components/site/AuthShell";
import { requestPasswordReset } from "@/lib/auth/session";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "Recupera tu contraseña — FreaknEnglish" }],
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
      highlight="contraseña"
      subtitle="Te enviaremos un enlace para restablecerla."
      footer={
        <Link to="/login" className={linkTouch}>
          Volver al inicio de sesión
        </Link>
      }
    >
      {sent ? (
        <div role="status" className="border-2 border-brand-ink bg-brand-yellow-soft p-4 text-sm text-brand-ink">
          Si existe una cuenta con <strong>{email}</strong>, te llegará un email con instrucciones.
          <p className="mt-2 text-xs text-brand-ink/70">
            Si no lo ves en unos minutos, revisa la carpeta de spam o promociones.
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
            className={btnPrimary}
          >
            {busy ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
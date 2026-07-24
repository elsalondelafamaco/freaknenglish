import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AuthShell, ErrorBox, Field, inputClass } from "@/components/site/AuthShell";
import { resetPassword } from "@/lib/auth/session";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Restablecer contraseña — FreaknEnglish" }],
  }),
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = useSearch({ from: "/reset-password" });
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("El enlace es inválido o ha expirado.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate({ to: "/login" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Define una nueva contraseña"
      subtitle="Asegúrate de que sea fácil de recordar y difícil de adivinar."
      footer={
        <Link to="/login" className="font-semibold text-brand-ink hover:underline">
          Volver al inicio de sesión
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Nueva contraseña" htmlFor="password" hint="Mínimo 8 caracteres.">
          <input
            id="password"
            type="password"
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
          className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </AuthShell>
  );
}
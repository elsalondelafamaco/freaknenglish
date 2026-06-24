import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/site/Logo";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Inicia sesión — Freakn English" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="min-h-screen bg-brand-cream flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-8 shadow-soft">
        <Link to="/" aria-label="Inicio">
          <Logo className="h-8 w-auto" />
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-brand-ink">Inicia sesión</h1>
        <p className="mt-1 text-sm text-brand-ink/65">
          Pantalla placeholder. La autenticación real se conectará en la próxima fase.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white hover:bg-brand-ink-soft"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
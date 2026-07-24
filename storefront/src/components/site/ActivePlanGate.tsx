import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { subscriptionsApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Un usuario logueado con plan activo (fuera de la ventana de renovación de
 * 5 días) no debe poder avanzar por el checkout: se le avisa desde el inicio
 * y se le sugiere cerrar sesión si quiere comprar otro plan.
 */
export function useActivePlanGate() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["me", "subscription"],
    queryFn: () => subscriptionsApi.mine(),
    enabled: !!user,
  });
  const sub = q.data as { status?: string; currentPeriodEnd?: string } | null | undefined;
  const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
  const blocked = sub?.status === "active" && daysLeft != null && daysLeft > 5;
  return { blocked, end };
}

export function ActivePlanScreen({ end }: { end: Date | null }) {
  const { signOut } = useAuth();
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-16">
      <div className="mx-auto max-w-lg">
        <Link to="/" aria-label="Inicio">
          <Logo className="h-8 w-auto" />
        </Link>
        <div className="mt-8 rounded-3xl border border-brand-line bg-white p-8 text-center shadow-soft">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-success/10 text-2xl">✅</div>
          <h1 className="mt-4 text-2xl font-bold text-brand-ink">Ya tienes un plan activo</h1>
          <p className="mt-2 text-sm text-brand-ink/65">
            {end
              ? `Tu suscripción está vigente hasta el ${end.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}. Podrás renovar cuando falten 5 días o menos.`
              : "Tu suscripción está vigente. Podrás renovar cuando esté por vencer."}
          </p>
          <Link
            to="/app"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white transition hover:bg-brand-ink-soft"
          >
            Ir a mi portal
          </Link>
          <p className="mt-4 text-xs text-brand-ink/55">
            ¿Quieres comprar un plan para otra persona?{" "}
            <button
              type="button"
              onClick={() => void signOut()}
              className="font-semibold text-brand-ink underline hover:text-brand-ink-soft"
            >
              Cierra sesión
            </button>{" "}
            y hazlo con otra cuenta.
          </p>
        </div>
      </div>
    </main>
  );
}

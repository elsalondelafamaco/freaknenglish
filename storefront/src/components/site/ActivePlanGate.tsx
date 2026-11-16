import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { subscriptionsApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { homePathFor } from "@/lib/roles";
import { btnPrimary, focusRing } from "./AuthShell";
import { Check } from "lucide-react";

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
  const { signOut, user } = useAuth();
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-6 md:py-12">
      <div className="mx-auto max-w-md">
        <Link to="/" aria-label="Inicio" className={`inline-flex min-h-11 items-center ${focusRing}`}>
          <Logo className="h-8 w-auto" />
        </Link>
        <div className="shadow-hard mt-8 border-2 border-brand-ink bg-white p-6 text-center md:p-8">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border-2 border-brand-ink bg-brand-ink text-brand-cream dark:text-white">
            <Check className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-display text-[28px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink">
            Ya tienes un <span className="marker-highlight">plan</span> activo
          </h1>
          <p className="mt-3 text-sm text-brand-ink/80">
            {end
              ? `Tu suscripción está vigente hasta el ${end.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}. Podrás renovar cuando falten 5 días o menos.`
              : "Tu suscripción está vigente. Podrás renovar cuando esté por vencer."}
          </p>
          <Link to={homePathFor(user?.roles)} className={`${btnPrimary} mt-6`}>
            Ir a mi portal
          </Link>
          <p className="mt-4 text-xs text-brand-ink/70">
            ¿Quieres comprar un plan para otra persona?{" "}
            <button
              type="button"
              onClick={() => void signOut()}
              className={`inline-flex min-h-11 items-center font-bold text-brand-ink underline underline-offset-2 hover:text-brand-ink-soft ${focusRing}`}
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

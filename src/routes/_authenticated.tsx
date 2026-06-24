import { useEffect, useRef, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/app/AppShell";

/**
 * Gate de rutas autenticadas.
 *
 * Mock: revisa `useAuth` y redirige a `/login` con `?redirect=...` si no hay
 * sesión. Como la sesión vive en `localStorage`, esperamos un microtick para
 * evitar parpadeos durante hidratación.
 *
 * @migration En Postgres/NextAuth, leer `auth()` en el server layout y
 * redireccionar antes de SSR.
 */
export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  // Capture the path we came in on, once, so the redirect target doesn't
  // recurse if the router re-renders during navigation.
  const initialPath = useRef<string>(
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app",
  );
  const redirected = useRef(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && !redirected.current) {
      redirected.current = true;
      navigate({
        to: "/login",
        search: { redirect: initialPath.current },
        replace: true,
      });
      return;
    }
    if (isAuthenticated) setChecked(true);
  }, [isAuthenticated, loading, navigate]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream">
        <div className="size-8 animate-spin rounded-full border-2 border-brand-ink/20 border-t-brand-ink" />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
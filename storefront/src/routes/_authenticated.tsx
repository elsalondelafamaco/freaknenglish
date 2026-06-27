import { useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
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
  // Private portals — keep search engines out.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
    if (isAuthenticated && user) {
      // Route users to the portal that matches their role. Admins and
      // teachers should not see the student dashboard at /app, and vice versa.
      const isAdmin = user.roles.includes("admin");
      const isTeacher = user.roles.includes("teacher");
      const isStudent = user.roles.includes("student");
      let target: string | null = null;
      if (pathname.startsWith("/admin") && !isAdmin) target = isTeacher ? "/teacher" : "/app";
      else if (pathname.startsWith("/teacher") && !isTeacher && !isAdmin) target = "/app";
      else if (pathname.startsWith("/app") && !isStudent) target = isAdmin ? "/admin" : "/teacher";

      if (target && !redirected.current) {
        redirected.current = true;
        navigate({ to: target as never, replace: true });
        return;
      }
      setChecked(true);
    }
  }, [isAuthenticated, loading, navigate, user, pathname]);

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
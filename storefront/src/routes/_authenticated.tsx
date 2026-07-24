import { useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/app/AppShell";
import { BackendDownBanner, PlatformError } from "@/components/app/PlatformError";
import { subscriptionsApi, surveysApi } from "@/lib/api/endpoints";
import { useQuery } from "@tanstack/react-query";
import { SatisfactionDialog } from "@/components/app/SatisfactionDialog";

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
  // Cualquier error no controlado dentro del portal (una query que revienta,
  // un render roto por datos faltantes) cae aquí en vez de dejar pantalla blanca.
  errorComponent: () => <PlatformError />,
});

function AuthenticatedLayout() {
  const { isAuthenticated, loading, user, backendDown } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Capture the path we came in on, once, so the redirect target doesn't
  // recurse if the router re-renders during navigation.
  const initialPath = useRef<string>(
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app",
  );
  const redirected = useRef(false);
  const [checked, setChecked] = useState(false);

  // Estudiantes: consultamos su suscripción real para decidir gating.
  const isStudent = !!user?.roles.includes("student");
  const { data: mySub } = useQuery({
    queryKey: ["me", "subscription"],
    queryFn: () => subscriptionsApi.mine(),
    enabled: isStudent && isAuthenticated,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: pendingSurvey, refetch: refetchSurvey } = useQuery({
    queryKey: ["me", "survey-pending"],
    queryFn: () => surveysApi.pending(),
    enabled: isStudent && isAuthenticated,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (loading) return;
    // Backend caído: no sabemos si hay sesión — no expulses a /login.
    if (backendDown && !isAuthenticated) return;
    if (!isAuthenticated) {
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
      const roleIsStudent = user.roles.includes("student");
      let target: string | null = null;
      if (pathname.startsWith("/admin") && !isAdmin) target = isTeacher ? "/teacher" : "/app";
      else if (pathname.startsWith("/teacher") && !isTeacher && !isAdmin) target = "/app";
      else if (pathname.startsWith("/app") && !roleIsStudent) target = isAdmin ? "/admin" : "/teacher";

      // Onboarding gate para estudiantes.
      if (!target && roleIsStudent && !pathname.startsWith("/onboarding")) {
        const missingProfile = !user.phone || !user.documentNumber;
        const hasActiveSub = !!mySub && (mySub as any).status === "active";
        const hasSchedule = user.scheduleAssignmentStatus === "auto_assigned"
          || user.scheduleAssignmentStatus === "manual_pending";
        if (missingProfile) target = "/onboarding/profile";
        // Sin suscripción activa: puede ENTRAR a la app pero solo al dashboard
        // (/app), que muestra su estado y el botón para elegir plan.
        else if (!hasActiveSub) {
          if (pathname !== "/app") target = "/app";
        }
        else if (hasActiveSub && !hasSchedule) target = "/onboarding/schedule";
      }

      if (target && !redirected.current) {
        redirected.current = true;
        navigate({ to: target as never, replace: true });
        return;
      }
      setChecked(true);
    }
  }, [isAuthenticated, loading, navigate, user, pathname, mySub, backendDown]);

  // El backend no respondió al restaurar la sesión: UI de error con acciones.
  if (!loading && backendDown && !isAuthenticated) {
    return <PlatformError />;
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream">
        <div className="size-8 animate-spin rounded-full border-2 border-brand-ink/20 border-t-brand-ink" />
      </div>
    );
  }

  return (
    <AppShell>
      {backendDown ? <BackendDownBanner /> : null}
      <Outlet />
      {isStudent && pendingSurvey?.pending && user ? (
        <SatisfactionDialog
          userId={user.id}
          onSubmitted={() => void refetchSurvey()}
        />
      ) : null}
    </AppShell>
  );
}
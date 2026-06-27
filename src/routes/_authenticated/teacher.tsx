import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Layout del portal de profesores. Verifica que el usuario tenga rol
 * `teacher` (o `admin`); de lo contrario redirige a `/app`.
 *
 * @migration En Postgres + JWT, este chequeo se hace en el middleware
 * server-side leyendo `user_roles`.
 */
export const Route = createFileRoute("/_authenticated/teacher")({
  component: TeacherLayout,
});

function TeacherLayout() {
  const { hasRole, loading } = useAuth();
  const navigate = useNavigate();
  const allowed = hasRole("teacher") || hasRole("admin");

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/app", replace: true });
  }, [loading, allowed, navigate]);

  if (!allowed) return null;
  return <Outlet />;
}
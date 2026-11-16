import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

// Todas las secciones del admin viven en el menú lateral (grupos Hoy, Personas,
// Oferta y Operación), así que aquí solo queda la guarda de rol; cada pantalla
// pone su propio título.
function AdminLayout() {
  const { hasRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !hasRole("admin")) navigate({ to: "/app", replace: true });
  }, [loading, hasRole, navigate]);

  if (!hasRole("admin")) return null;

  return <Outlet />;
}

import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, BookOpen, Users, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "Analytics", icon: BarChart3, end: true },
  { to: "/admin/users", label: "CRM", icon: Users },
  { to: "/admin/content", label: "CMS", icon: BookOpen },
  { to: "/admin/payroll", label: "Nómina", icon: Wallet },
] as const;

function AdminLayout() {
  const { hasRole, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !hasRole("admin")) navigate({ to: "/app", replace: true });
  }, [loading, hasRole, navigate]);

  if (!hasRole("admin")) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/55">
          Panel admin
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink">
          Freakn' Operations
        </h1>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-brand-line">
        {TABS.map((t) => {
          const active = t.end ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "border-brand-ink text-brand-ink"
                  : "border-transparent text-brand-ink/60 hover:text-brand-ink"
              }`}
            >
              <Icon className="size-4" /> {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
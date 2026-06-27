import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";

const STUDENT_NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/calendar", label: "Calendario", icon: CalendarDays },
  { to: "/app/learning", label: "Aprendizaje", icon: Sparkles },
  { to: "/app/settings", label: "Configuración", icon: Settings },
] as const;

const TEACHER_NAV = [
  { to: "/teacher", label: "Hoy", icon: LayoutDashboard },
  { to: "/teacher/schedule", label: "Agenda", icon: CalendarDays },
  { to: "/teacher/students", label: "Estudiantes", icon: Users },
] as const;

const ADMIN_NAV = [
  { to: "/admin", label: "Analytics", icon: LayoutDashboard },
  { to: "/admin/users", label: "CRM", icon: Users },
  { to: "/admin/content", label: "CMS", icon: Sparkles },
  { to: "/admin/payroll", label: "Nómina", icon: ShieldCheck },
  { to: "/admin/notifications", label: "Automaciones", icon: Mail },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const NAV = user?.roles.includes("admin")
    ? ADMIN_NAV
    : user?.roles.includes("teacher")
      ? TEACHER_NAV
      : STUDENT_NAV;

  return (
    <div className="min-h-screen bg-brand-surface">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-brand-line bg-white p-5 lg:flex">
        <Link to="/" aria-label="Inicio">
          <Logo className="h-8 w-auto" />
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <NavItem key={item.to} {...item} active={active} />
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-brand-cream/60 p-4">
          <div className="text-sm font-semibold text-brand-ink">{user?.fullName}</div>
          <div className="truncate text-xs text-brand-ink/65">{user?.email}</div>
          <button
            onClick={signOut}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink/70 hover:text-brand-ink"
          >
            <LogOut className="size-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Topbar — mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-line bg-white px-4 py-3 lg:hidden">
        <Link to="/" aria-label="Inicio">
          <Logo className="h-7 w-auto" />
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full p-2 text-brand-ink hover:bg-brand-cream/50"
          aria-label="Abrir menú"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {open ? (
        <div className="lg:hidden mx-4 mt-2 rounded-2xl border border-brand-line bg-white p-3 shadow-soft">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <NavItem
                  key={item.to}
                  {...item}
                  active={active}
                  onClick={() => setOpen(false)}
                />
              );
            })}
            <button
              onClick={signOut}
              className="mt-2 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/40"
            >
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      ) : null}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-5 py-8 lg:py-12">{children}</div>
      </main>
    </div>
  );
}

type Icon = (typeof STUDENT_NAV)[number]["icon"];

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  to: string;
  label: string;
  icon: Icon;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to as never}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-brand-ink text-white"
          : "text-brand-ink/75 hover:bg-brand-cream/50 hover:text-brand-ink",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Mail,
  Menu,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { ImpersonationBanner } from "@/components/app/ImpersonationBanner";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { InstallAppButton } from "@/components/app/InstallAppButton";

const STUDENT_NAV = [
  { to: "/app", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/app/calendar", label: "Calendario", icon: CalendarDays, end: false },
  { to: "/app/learning", label: "Aprendizaje", icon: Sparkles, end: false },
  { to: "/boards", label: "Boards", icon: LayoutGrid, end: false },
  { to: "/app/settings", label: "Configuración", icon: Settings, end: false },
] as const;

const TEACHER_NAV = [
  { to: "/teacher", label: "Hoy", icon: LayoutDashboard, end: true },
  { to: "/teacher/schedule", label: "Agenda", icon: CalendarDays, end: false },
  { to: "/teacher/students", label: "Estudiantes", icon: Users, end: false },
  { to: "/boards", label: "Boards", icon: LayoutGrid, end: false },
  { to: "/teacher/availability", label: "Disponibilidad", icon: Settings, end: false },
] as const;

const ADMIN_NAV = [
  { to: "/admin", label: "Analítica", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Usuarios", icon: Users, end: false },
  { to: "/admin/content", label: "Contenido", icon: Sparkles, end: false },
  { to: "/admin/payroll", label: "Nómina", icon: ShieldCheck, end: false },
  { to: "/admin/notifications", label: "Notificaciones", icon: Mail, end: false },
  { to: "/admin/surveys", label: "Encuestas", icon: Smile, end: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    try {
      await queryClient.cancelQueries();
    } catch { /* ignore */ }
    queryClient.clear();
    try {
      await signOut();
    } catch { /* ignore, we still navigate */ }
    await navigate({ to: "/login", replace: true });
    void router.invalidate();
  }

  const NAV = user?.roles.includes("admin")
    ? ADMIN_NAV
    : user?.roles.includes("teacher")
      ? TEACHER_NAV
      : STUDENT_NAV;

  return (
    <div className="min-h-screen bg-brand-surface">
      <ImpersonationBanner />
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-brand-line bg-white p-5 lg:flex">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Inicio">
            <Logo className="h-8 w-auto" />
          </Link>
          <NotificationsBell />
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.end
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            return <NavItem key={item.to} {...item} active={active} />;
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-brand-cream/60 p-4">
          <div className="text-sm font-semibold text-brand-ink">{user?.fullName}</div>
          <div className="truncate text-xs text-brand-ink/65">{user?.email}</div>
          <div className="mt-3"><InstallAppButton /></div>
          <button
            onClick={handleSignOut}
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
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full p-2 text-brand-ink hover:bg-brand-cream/50"
            aria-label="Abrir menú"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {open ? (
        <div className="lg:hidden mx-4 mt-2 rounded-2xl border border-brand-line bg-white p-3 shadow-soft">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = item.end
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
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
              onClick={handleSignOut}
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
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "bg-brand-ink text-white shadow-soft"
          : "text-brand-ink/75 hover:translate-x-0.5 hover:bg-brand-cream/60 hover:text-brand-ink",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
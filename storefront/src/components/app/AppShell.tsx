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
  Tag,
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
import { useLang } from "@/lib/i18n";

const STUDENT_NAV = [
  { to: "/app", label: "Inicio", tKey: "nav.home", icon: LayoutDashboard, end: true },
  { to: "/app/calendar", label: "Calendario", tKey: "nav.calendar", icon: CalendarDays, end: false },
  { to: "/app/learning", label: "Aprendizaje", tKey: "nav.learning", icon: Sparkles, end: false },
  { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid, end: false },
  { to: "/app/settings", label: "Configuración", tKey: "nav.settings", icon: Settings, end: false },
] as const;

const TEACHER_NAV = [
  { to: "/teacher", label: "Hoy", tKey: "nav.today", icon: LayoutDashboard, end: true },
  { to: "/teacher/calendar", label: "Calendario", tKey: "nav.calendar", icon: CalendarDays, end: false },
  { to: "/teacher/schedule", label: "Agenda", tKey: "nav.schedule", icon: CalendarDays, end: false },
  { to: "/teacher/students", label: "Estudiantes", tKey: "nav.students", icon: Users, end: false },
  { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid, end: false },
  { to: "/teacher/availability", label: "Disponibilidad", tKey: "nav.availability", icon: Settings, end: false },
  { to: "/teacher/absences", label: "Ausencias", tKey: "nav.absences", icon: CalendarDays, end: false },
] as const;

const ADMIN_NAV = [
  { to: "/admin", label: "Analítica", tKey: "nav.analytics", icon: LayoutDashboard, end: true },
  { to: "/admin/calendar", label: "Calendario", tKey: "nav.calendar", icon: CalendarDays, end: false },
  { to: "/admin/users", label: "Usuarios", tKey: "nav.users", icon: Users, end: false },
  { to: "/admin/content", label: "Contenido", tKey: "nav.content", icon: Sparkles, end: false },
  { to: "/admin/payroll", label: "Nómina", tKey: "nav.payroll", icon: ShieldCheck, end: false },
  { to: "/admin/plans", label: "Planes", tKey: "nav.plans", icon: Tag, end: false },
  { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid, end: false },
  { to: "/admin/surveys", label: "Encuestas", tKey: "nav.surveys", icon: Smile, end: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useLang();
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
            return <NavItem key={item.to} {...item} label={t((item as any).tKey, item.label)} active={active} />;
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-brand-cream/60 p-4">
          <div className="text-sm font-semibold text-brand-ink">{user?.fullName}</div>
          <div className="truncate text-xs text-brand-ink/65">{user?.email}</div>
          <div className="mt-3"><InstallAppButton /></div>
          <div className="mt-3 flex items-center gap-1 text-xs">
            <span className="text-brand-ink/50">{t("common.language")}:</span>
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded px-1.5 py-0.5 font-semibold ${lang === l ? "bg-brand-ink text-white" : "text-brand-ink/60 hover:bg-white"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={handleSignOut}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink/70 hover:text-brand-ink"
          >
            <LogOut className="size-3.5" /> {t("action.signout")}
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
                  label={t((item as any).tKey, item.label)}
                  active={active}
                  onClick={() => setOpen(false)}
                />
              );
            })}
            <button
              onClick={handleSignOut}
              className="mt-2 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/40"
            >
              <LogOut className="size-4" /> {t("action.signout")}
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
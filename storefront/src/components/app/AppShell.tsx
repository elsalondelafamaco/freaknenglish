import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  LayoutDashboard,
  LayoutGrid,
  HardDrive,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Tag,
  Smile,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/lib/auth/AuthProvider";
import { scheduleApi, subscriptionsApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { ImpersonationBanner } from "@/components/app/ImpersonationBanner";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { InstallAppButton } from "@/components/app/InstallAppButton";
import { ThemeToggle } from "@/components/app/ThemeToggle";
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
  { to: "/teacher/content", label: "Contenido", tKey: "nav.content", icon: Sparkles, end: false },
  { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid, end: false },
  { to: "/teacher/availability", label: "Disponibilidad", tKey: "nav.availability", icon: Settings, end: false },
] as const;

const ADMIN_NAV = [
  { to: "/admin", label: "Analítica", tKey: "nav.analytics", icon: LayoutDashboard, end: true },
  { to: "/admin/calendar", label: "Calendario", tKey: "nav.calendar", icon: CalendarDays, end: false },
  { to: "/admin/schedule", label: "Solicitudes", tKey: "nav.requests", icon: Mail, end: false },
  { to: "/admin/users", label: "Usuarios", tKey: "nav.users", icon: Users, end: false },
  { to: "/admin/carts", label: "Carritos", tKey: "nav.carts", icon: ShoppingCart, end: false },
  { to: "/admin/content", label: "Contenido", tKey: "nav.content", icon: Sparkles, end: false },
  { to: "/admin/storage", label: "Storage", tKey: "nav.storage", icon: HardDrive, end: false },
  { to: "/admin/payroll", label: "Nómina", tKey: "nav.payroll", icon: ShieldCheck, end: false },
  { to: "/admin/plans", label: "Planes", tKey: "nav.plans", icon: Tag, end: false },
  { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid, end: false },
  { to: "/admin/surveys", label: "Encuestas", tKey: "nav.surveys", icon: Smile, end: false },
  { to: "/admin/notifications", label: "Notificaciones", tKey: "nav.notifications", icon: Mail, end: false },
  { to: "/admin/cleanup", label: "Cleanup", tKey: "nav.cleanup", icon: Trash2, end: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useLang();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Sidebar colapsado (solo iconos). Se recuerda entre sesiones: quien lo
  // colapsa para ganar ancho no quiere volver a hacerlo en cada carga.
  const [colapsado, setColapsado] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("freakn.sidebar.colapsado") === "1",
  );
  const alternarSidebar = () => {
    setColapsado((v) => {
      const next = !v;
      try { window.localStorage.setItem("freakn.sidebar.colapsado", next ? "1" : "0"); } catch { /* modo privado */ }
      return next;
    });
  };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Detalle de módulo (/app/learning/<id>): el HTML de la lección va a sangre.
  const isLessonViewer = /^\/app\/learning\/[^/]+/.test(pathname);

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

  // Estudiante sin suscripción activa: no tiene acceso a la plataforma, así
  // que el sidebar solo muestra Inicio (estado/planes) y Configuración.
  // Comparte queryKey con _authenticated.tsx (misma cache, cero requests extra).
  const isStudent = !!user?.roles.includes("student");
  const { data: mySub } = useQuery({
    queryKey: ["me", "subscription"],
    queryFn: () => subscriptionsApi.mine(),
    enabled: isStudent,
    staleTime: 0,
  });
  const studentHasAccess = !!mySub && (mySub as any).status === "active";

  // Admin: cantidad de solicitudes pendientes (badge rojo en "Solicitudes").
  const isAdmin = !!user?.roles.includes("admin");
  const { data: pendingRequests } = useQuery({
    queryKey: ["admin", "schedule-requests"],
    queryFn: () => scheduleApi.adminPending(),
    enabled: isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const requestsCount = isAdmin ? (pendingRequests?.length ?? 0) : 0;

  // Multi-rol: el sidebar es la UNIÓN de lo que habilita cada rol, no solo el
  // principal. Un admin que además da clases ve los módulos de admin Y los de
  // profesor; sin esto, sus módulos de profe quedaban inalcanzables.
  const NAV = (() => {
    const roles = user?.roles ?? [];
    type NavItem =
      | (typeof ADMIN_NAV)[number]
      | (typeof TEACHER_NAV)[number]
      | (typeof STUDENT_NAV)[number];
    const secciones: ReadonlyArray<NavItem>[] = [];
    if (roles.includes("admin")) secciones.push(ADMIN_NAV);
    if (roles.includes("teacher")) secciones.push(TEACHER_NAV);
    if (roles.includes("student")) {
      secciones.push(
        studentHasAccess
          ? STUDENT_NAV
          : STUDENT_NAV.filter((i) => i.to === "/app" || i.to === "/app/settings"),
      );
    }
    if (secciones.length === 0) {
      return STUDENT_NAV.filter((i) => i.to === "/app" || i.to === "/app/settings");
    }
    const vistos = new Set<string>();
    return secciones.flat().filter((i) => !vistos.has(i.to) && vistos.add(i.to));
  })();

  return (
    <div className="min-h-screen bg-brand-surface">
      <ImpersonationBanner />
      {/* Sidebar — desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden flex-col border-r border-brand-line bg-white transition-[width] duration-200 lg:flex",
          colapsado ? "w-16 p-2" : "w-64 p-5",
        )}
      >
        <div className={cn("flex items-center", colapsado ? "justify-center" : "justify-between")}>
          {colapsado ? null : (
            <Link to="/" aria-label="Inicio">
              <Logo className="h-8 w-auto" />
            </Link>
          )}
          {colapsado ? null : <NotificationsBell />}
        </div>
        <button
          type="button"
          onClick={alternarSidebar}
          title={colapsado ? "Expandir menú" : "Colapsar menú"}
          aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
          className={cn(
            "mt-2 flex items-center gap-2 rounded-xl py-2 text-xs font-semibold text-brand-ink/60 transition hover:bg-brand-cream/60 hover:text-brand-ink",
            colapsado ? "justify-center px-2" : "px-3",
          )}
        >
          {colapsado ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Colapsar</>}
        </button>
        <nav className={cn("flex flex-col gap-1", colapsado ? "mt-3" : "mt-5")}>
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
                badge={item.to === "/admin/schedule" ? requestsCount : 0}
                compacto={colapsado}
              />
            );
          })}
        </nav>
        <div className={cn("mt-auto rounded-2xl bg-brand-cream/60 p-4", colapsado ? "hidden" : "")}>
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
            <ThemeToggle className="ml-auto size-7" />
          </div>
          <button
            onClick={handleSignOut}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink/70 hover:text-brand-ink"
          >
            <LogOut className="size-3.5" /> {t("action.signout")}
          </button>
        </div>

        {/* Colapsado no cabe la tarjeta del usuario, pero notificaciones, tema
            y salir tienen que seguir a mano: van como iconos sueltos. */}
        {colapsado ? (
          <div className="mt-auto flex flex-col items-center gap-2 pb-1">
            <NotificationsBell />
            <ThemeToggle className="size-7" />
            <button
              onClick={handleSignOut}
              title={t("action.signout", "Cerrar sesión")}
              aria-label={t("action.signout", "Cerrar sesión")}
              className="rounded-xl p-2 text-brand-ink/60 transition hover:bg-brand-cream/60 hover:text-brand-ink"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : null}
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
                  badge={item.to === "/admin/schedule" ? requestsCount : 0}
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

      <main className={cn("transition-[padding] duration-200", colapsado ? "lg:pl-16" : "lg:pl-64")}>
        {/* Board y aprendizaje usan todo el ancho (se sienten estrechos con
            max-w-6xl); el visor de lección va a sangre en mobile para que el
            HTML del deck aproveche los 375px completos. El resto conserva el
            contenedor centrado. */}
        <div
          className={cn(
            "mx-auto",
            isLessonViewer
              ? "max-w-none px-0 py-0 sm:px-4 sm:py-6 lg:px-6 lg:py-10"
              : pathname.startsWith("/boards") || pathname.startsWith("/app/learning")
                ? "max-w-none px-2 py-6 sm:px-4 lg:px-6 lg:py-10"
                : "max-w-6xl px-4 py-6 sm:px-5 lg:py-10",
          )}
        >
          {children}
        </div>
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
  badge = 0,
  onClick,
  compacto = false,
}: {
  to: string;
  label: string;
  icon: Icon;
  active: boolean;
  badge?: number;
  onClick?: () => void;
  /** Sidebar colapsado: solo el icono, con el nombre en el tooltip. */
  compacto?: boolean;
}) {
  return (
    <Link
      to={to as never}
      onClick={onClick}
      title={compacto ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl py-2 text-sm font-medium transition-all duration-200",
        compacto ? "justify-center px-2" : "px-3",
        "relative",
        active
          ? "bg-brand-ink text-white shadow-soft"
          : "text-brand-ink/75 hover:translate-x-0.5 hover:bg-brand-cream/60 hover:text-brand-ink",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {compacto ? null : label}
      {badge > 0 ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-red-500 font-bold text-white",
            compacto
              ? "absolute right-1 top-1 size-2 p-0 text-transparent"
              : "ml-auto h-5 min-w-5 px-1.5 text-[11px]",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
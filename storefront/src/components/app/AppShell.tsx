import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bot,
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileBarChart,
  Globe,
  HardDrive,
  HeartPulse,
  Home,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  ShoppingCart,
  Smile,
  Sparkles,
  Tag,
  Trash2,
  User,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/site/Logo";
import { focusRing } from "@/components/site/AuthShell";
import { useAuth } from "@/lib/auth/AuthProvider";
import { scheduleApi, subscriptionsApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { ImpersonationBanner } from "@/components/app/ImpersonationBanner";
import { NotificationsBell } from "@/components/app/NotificationsBell";
import { InstallAppButton } from "@/components/app/InstallAppButton";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useLang } from "@/lib/i18n";

type NavEntry = { to: string; label: string; tKey: string; icon: LucideIcon; end?: boolean };
type NavGroup = { key: string; tKey?: string; label?: string; items: readonly NavEntry[] };

// ── Estudiante ──────────────────────────────────────────────────────────
// En el celular viajan 5 en la barra de abajo; el resto (Reportes, Boards)
// queda en el menú del encabezado.
const STUDENT_NAV: readonly NavEntry[] = [
  { to: "/app", label: "Inicio", tKey: "nav.home", icon: Home, end: true },
  { to: "/app/calendar", label: "Calendario", tKey: "nav.calendar", icon: CalendarDays },
  { to: "/app/learning", label: "Aprender", tKey: "nav.learning", icon: Sparkles },
  { to: "/app/material", label: "Material", tKey: "nav.mymaterial", icon: BookOpen },
  { to: "/app/reports", label: "Reportes", tKey: "nav.myreports", icon: FileBarChart },
  { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid },
  { to: "/app/settings", label: "Perfil", tKey: "nav.settings", icon: User },
];
const STUDENT_BOTTOM = ["/app", "/app/calendar", "/app/learning", "/app/material", "/app/settings"];
// Sin suscripción activa solo hay estado/planes y cuenta.
const STUDENT_SIN_PLAN = ["/app", "/app/settings"];

// ── Profesor ────────────────────────────────────────────────────────────
// Calendario = vista de semana donde se arrastra para reprogramar.
// Agenda = la lista de clases donde se valida la asistencia.
const TEACHER_NAV: readonly NavEntry[] = [
  { to: "/teacher", label: "Hoy", tKey: "nav.today", icon: LayoutDashboard, end: true },
  { to: "/teacher/calendar", label: "Calendario", tKey: "nav.calendar", icon: CalendarDays },
  { to: "/teacher/schedule", label: "Agenda", tKey: "nav.schedule", icon: ClipboardCheck },
  { to: "/teacher/students", label: "Estudiantes", tKey: "nav.students", icon: Users },
  { to: "/teacher/content", label: "Contenido", tKey: "nav.content", icon: Sparkles },
  { to: "/teacher/material", label: "Material extra", tKey: "nav.material", icon: BookOpen },
  { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid },
  { to: "/teacher/availability", label: "Disponibilidad", tKey: "nav.availability", icon: Clock },
];

// ── Admin ───────────────────────────────────────────────────────────────
const ADMIN_GROUPS: readonly NavGroup[] = [
  {
    key: "admin-hoy",
    tKey: "navgroup.today",
    label: "Hoy",
    items: [
      { to: "/admin", label: "Analítica", tKey: "nav.analytics", icon: LayoutDashboard, end: true },
      { to: "/admin/schedule", label: "Solicitudes", tKey: "nav.requests", icon: Mail },
      { to: "/admin/carts", label: "Carritos", tKey: "nav.carts", icon: ShoppingCart },
    ],
  },
  {
    key: "admin-personas",
    tKey: "navgroup.people",
    label: "Personas",
    items: [
      { to: "/admin/users", label: "Usuarios", tKey: "nav.users", icon: Users },
      { to: "/admin/payroll", label: "Nómina", tKey: "nav.payroll", icon: Wallet },
    ],
  },
  {
    key: "admin-oferta",
    tKey: "navgroup.offer",
    label: "Oferta",
    items: [
      { to: "/admin/plans", label: "Planes", tKey: "nav.plans", icon: Tag },
      { to: "/admin/promos", label: "Promociones", tKey: "nav.promos", icon: Percent },
      { to: "/admin/content", label: "Contenido", tKey: "nav.content", icon: Sparkles },
      { to: "/admin/resources", label: "Material extra", tKey: "nav.material", icon: BookOpen },
      { to: "/admin/site", label: "Sitio", tKey: "nav.site", icon: Globe },
      { to: "/admin/content-prompt", label: "Prompt IA", tKey: "nav.prompt", icon: Bot },
    ],
  },
  {
    key: "admin-operacion",
    tKey: "navgroup.ops",
    label: "Operación",
    items: [
      { to: "/admin/calendar", label: "Calendario", tKey: "nav.calendar", icon: CalendarDays },
      { to: "/admin/schedule-health", label: "Salud del horario", tKey: "nav.scheduleHealth", icon: HeartPulse },
      { to: "/admin/surveys", label: "Encuestas", tKey: "nav.surveys", icon: Smile },
      { to: "/admin/notifications", label: "Notificaciones", tKey: "nav.notifications", icon: Mail },
      { to: "/boards", label: "Boards", tKey: "nav.boards", icon: LayoutGrid },
      { to: "/admin/storage", label: "Storage", tKey: "nav.storage", icon: HardDrive },
      { to: "/admin/cleanup", label: "Cleanup", tKey: "nav.cleanup", icon: Trash2 },
    ],
  },
];

const esActivo = (item: NavEntry, pathname: string) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");

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

  // El menú del celular se cierra solo al cambiar de pantalla y con Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
  // que el sidebar solo muestra Inicio (estado/planes) y Perfil.
  // Comparte queryKey con _authenticated.tsx (misma cache, cero requests extra).
  const isStudent = !!user?.roles.includes("student");
  const { data: mySub } = useQuery({
    queryKey: ["me", "subscription"],
    queryFn: () => subscriptionsApi.mine(),
    enabled: isStudent,
    staleTime: 0,
  });
  const studentHasAccess = !!mySub && (mySub as any).status === "active";

  // Admin: cantidad de solicitudes pendientes (insignia amarilla en "Solicitudes").
  const isAdmin = !!user?.roles.includes("admin");
  const isTeacher = !!user?.roles.includes("teacher");
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
  // profesor; sin esto, sus módulos de profe quedaban inalcanzables. Con más de
  // un rol, cada bloque lleva su encabezado para no mezclar los menús.
  const GRUPOS: NavGroup[] = (() => {
    const incluyeEstudiante = isStudent || (!isAdmin && !isTeacher);
    const varios = [isAdmin, isTeacher, incluyeEstudiante].filter(Boolean).length > 1;
    const grupos: NavGroup[] = [];
    if (isAdmin) grupos.push(...ADMIN_GROUPS);
    if (isTeacher) {
      grupos.push({
        key: "teacher",
        tKey: varios ? "navgroup.teacher" : undefined,
        label: "Como profe",
        items: TEACHER_NAV,
      });
    }
    if (incluyeEstudiante) {
      grupos.push({
        key: "student",
        tKey: varios ? "navgroup.student" : undefined,
        label: "Como estudiante",
        items: studentHasAccess ? STUDENT_NAV : STUDENT_NAV.filter((i) => STUDENT_SIN_PLAN.includes(i.to)),
      });
    }
    const vistos = new Set<string>();
    return grupos
      .map((g) => ({ ...g, items: g.items.filter((i) => !vistos.has(i.to) && vistos.add(i.to)) }))
      .filter((g) => g.items.length > 0);
  })();

  // Estudiante "puro": barra de abajo en el celular, con máximo 5 destinos.
  const soloEstudiante = !isAdmin && !isTeacher;
  const bottomItems: NavEntry[] = soloEstudiante
    ? (GRUPOS.flatMap((g) => g.items).filter((i) => STUDENT_BOTTOM.includes(i.to)))
    : [];
  const mostrarBottom =
    bottomItems.length > 0 && !pathname.startsWith("/boards") && !pathname.startsWith("/app/checkpoint");
  // Lo que no cabe abajo vive en el menú del encabezado.
  const gruposMenu: NavGroup[] = soloEstudiante
    ? [
        {
          key: "mas",
          tKey: "navgroup.more",
          label: "Más",
          items: GRUPOS.flatMap((g) => g.items).filter((i) => !STUDENT_BOTTOM.includes(i.to)),
        },
      ].filter((g) => g.items.length > 0)
    : GRUPOS;

  return (
    <div className="min-h-screen bg-brand-cream">
      <ImpersonationBanner />
      {/* Sidebar — desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden flex-col border-r-2 border-brand-ink bg-white transition-[width] duration-200 lg:flex",
          colapsado ? "w-16 p-2" : "w-64 p-4",
        )}
      >
        <div className={cn("flex items-center", colapsado ? "justify-center" : "justify-between pl-2")}>
          {colapsado ? null : (
            <Link to="/" aria-label="Inicio" className={cn("inline-flex min-h-11 items-center", focusRing)}>
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
            "mt-1 flex min-h-10 items-center gap-2 rounded-full text-xs font-semibold text-brand-ink/70 transition hover:bg-brand-cream hover:text-brand-ink",
            colapsado ? "justify-center px-2" : "px-3.5",
            focusRing,
          )}
        >
          {colapsado ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Colapsar</>}
        </button>
        <nav
          aria-label={t("nav.main", "Principal")}
          className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3", colapsado ? "mt-2" : "mt-1")}
        >
          <NavLista
            grupos={GRUPOS}
            pathname={pathname}
            requestsCount={requestsCount}
            compacto={colapsado}
            t={t}
          />
        </nav>
        <div className={cn("mt-2 shrink-0 border-2 border-brand-ink bg-brand-cream p-3.5", colapsado ? "hidden" : "")}>
          <div className="truncate text-[13px] font-bold text-brand-ink">{user?.fullName}</div>
          <div className="truncate text-xs text-brand-ink/70">{user?.email}</div>
          <div className="mt-3"><InstallAppButton /></div>
          <div className="mt-3 flex items-center gap-1 text-xs">
            <span className="text-brand-ink/70">{t("common.language")}:</span>
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cn(
                  "inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 font-bold transition-colors",
                  lang === l ? "bg-brand-ink text-brand-cream dark:text-white" : "text-brand-ink/70 hover:bg-white",
                  focusRing,
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
            <ThemeToggle className="ml-auto size-9" />
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className={cn("mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-brand-ink/80 hover:text-brand-ink", focusRing)}
          >
            <LogOut className="size-3.5" /> {t("action.signout")}
          </button>
        </div>

        {/* Colapsado no cabe la tarjeta del usuario, pero notificaciones, tema
            y salir tienen que seguir a mano: van como iconos sueltos. */}
        {colapsado ? (
          <div className="mt-auto flex shrink-0 flex-col items-center gap-2 pb-1">
            {/* Pegada al fondo de la pantalla: el panel tiene que subir. */}
            <NotificationsBell haciaArriba />
            <ThemeToggle className="size-9" />
            <button
              type="button"
              onClick={handleSignOut}
              title={t("action.signout", "Cerrar sesión")}
              aria-label={t("action.signout", "Cerrar sesión")}
              className={cn("inline-flex size-11 items-center justify-center rounded-full text-brand-ink/70 transition hover:bg-brand-cream hover:text-brand-ink", focusRing)}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : null}
      </aside>

      {/* Encabezado — mobile. 61px de alto exactos: el board se ancla a esa cifra. */}
      <header className="sticky top-0 z-30 flex h-[61px] items-center justify-between border-b-2 border-brand-ink bg-white px-4 lg:hidden">
        <Link to="/" aria-label="Inicio" className={cn("inline-flex min-h-11 items-center", focusRing)}>
          <Logo className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn("inline-flex size-11 items-center justify-center rounded-full text-brand-ink hover:bg-brand-cream", focusRing)}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="menu-movil"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {open ? (
        <div
          id="menu-movil"
          className="shadow-hard mx-4 mt-3 border-2 border-brand-ink bg-white p-3 [--hard-x:4px] lg:hidden"
        >
          <div className="px-2 pb-2">
            <div className="truncate text-[13px] font-bold text-brand-ink">{user?.fullName}</div>
            <div className="truncate text-xs text-brand-ink/70">{user?.email}</div>
          </div>
          <nav aria-label={t("nav.menu", "Menú")}>
            <NavLista
              grupos={gruposMenu}
              pathname={pathname}
              requestsCount={requestsCount}
              onNavigate={() => setOpen(false)}
              t={t}
            />
          </nav>
          <div className="mt-2 flex items-center gap-1 border-t border-brand-ink/15 px-2 pt-2 text-xs">
            <span className="text-brand-ink/70">{t("common.language")}:</span>
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cn(
                  "inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 font-bold transition-colors",
                  lang === l ? "bg-brand-ink text-brand-cream dark:text-white" : "text-brand-ink/70 hover:bg-brand-cream",
                  focusRing,
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
            <ThemeToggle className="ml-auto size-11" />
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className={cn("mt-1 inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-bold text-brand-ink/80 hover:bg-brand-cream", focusRing)}
          >
            <LogOut className="size-4" /> {t("action.signout")}
          </button>
        </div>
      ) : null}

      <main
        className={cn(
          "transition-[padding] duration-200",
          colapsado ? "lg:pl-16" : "lg:pl-64",
          mostrarBottom && "pb-[calc(74px+env(safe-area-inset-bottom))] lg:pb-0",
        )}
      >
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

      {/* Barra de abajo — solo estudiantes, solo celular. */}
      {mostrarBottom ? (
        <nav
          aria-label={t("nav.main", "Principal")}
          className="fixed inset-x-0 bottom-0 z-30 flex min-h-[74px] items-center justify-around border-t-2 border-brand-ink bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {bottomItems.map((item) => {
            const active = esActivo(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as never}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-[58px] flex-col items-center gap-1 px-1 py-1.5 text-[11px] no-underline",
                  active ? "font-extrabold text-brand-ink" : "font-semibold text-brand-ink/70",
                  focusRing,
                )}
              >
                <Icon className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />
                <span className={cn("border-b-[3px] pb-px", active ? "border-brand-ink" : "border-transparent")}>
                  {t(item.tKey, item.label)}
                </span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

/** Los grupos del menú, con su encabezado chico. Sirve al sidebar y al menú del celular. */
function NavLista({
  grupos,
  pathname,
  requestsCount,
  compacto = false,
  onNavigate,
  t,
}: {
  grupos: NavGroup[];
  pathname: string;
  requestsCount: number;
  compacto?: boolean;
  onNavigate?: () => void;
  t: (key: string, fallback?: string) => string;
}) {
  return (
    <>
      {grupos.map((g, i) => {
        const titulo = g.tKey ? t(g.tKey, g.label) : null;
        return (
          <div key={g.key} className={cn("flex flex-col gap-0.5", i > 0 ? "mt-1" : "")}>
            {titulo ? (
              compacto ? (
                i > 0 ? <hr className="mx-2 my-2 border-t border-brand-ink/20" /> : null
              ) : (
                <p className="ml-3.5 mt-3 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">
                  {titulo}
                </p>
              )
            ) : i > 0 ? (
              <hr className="mx-2 my-2 border-t border-brand-ink/20" />
            ) : null}
            {g.items.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={t(item.tKey, item.label)}
                icon={item.icon}
                active={esActivo(item, pathname)}
                badge={item.to === "/admin/schedule" ? requestsCount : 0}
                onClick={onNavigate}
                compacto={compacto}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

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
  icon: LucideIcon;
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
      aria-label={compacto ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 items-center gap-2.5 rounded-full text-sm font-semibold no-underline transition-colors lg:h-10",
        compacto ? "mx-auto w-11 justify-center px-0 lg:w-11" : "px-3.5",
        focusRing,
        active
          ? "shadow-hard bg-brand-ink text-brand-cream [--hard-x:3px] hover:text-brand-cream dark:text-white"
          : "text-brand-ink hover:bg-brand-cream hover:text-brand-ink",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
      {compacto ? null : label}
      {badge > 0 ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-full border-[1.5px] border-brand-ink bg-brand-yellow font-bold text-brand-ink",
            compacto ? "absolute right-0.5 top-0.5 size-3 p-0 text-transparent" : "ml-auto h-5 min-w-5 px-1.5 text-[11px]",
          )}
        >
          {compacto ? null : badge > 99 ? "99+" : badge}
          <span className="sr-only">{` (${badge} ${badge === 1 ? "pendiente" : "pendientes"})`}</span>
        </span>
      ) : null}
    </Link>
  );
}

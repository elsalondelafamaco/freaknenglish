import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "es" | "en";
const STORAGE_KEY = "freakn.lang";

type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = {
  es: {
    "nav.home": "Inicio",
    "nav.calendar": "Calendario",
    "nav.learning": "Aprendizaje",
    "nav.boards": "Boards",
    "nav.settings": "Configuración",
    "nav.today": "Hoy",
    "nav.schedule": "Agenda",
    "nav.students": "Estudiantes",
    "nav.availability": "Disponibilidad",
    "nav.absences": "Ausencias",
    "nav.analytics": "Analítica",
    "nav.users": "Usuarios",
    "nav.content": "Contenido",
    "nav.payroll": "Nómina",
    "nav.plans": "Planes",
    "nav.requests": "Solicitudes",
    "nav.notifications": "Notificaciones",
    "nav.surveys": "Encuestas",
    "action.signout": "Cerrar sesión",
    "common.language": "Idioma",
  },
  en: {
    "nav.home": "Home",
    "nav.calendar": "Calendar",
    "nav.learning": "Learning",
    "nav.boards": "Boards",
    "nav.settings": "Settings",
    "nav.today": "Today",
    "nav.schedule": "Schedule",
    "nav.students": "Students",
    "nav.availability": "Availability",
    "nav.absences": "Time off",
    "nav.analytics": "Analytics",
    "nav.users": "Users",
    "nav.content": "Content",
    "nav.payroll": "Payroll",
    "nav.plans": "Plans",
    "nav.requests": "Requests",
    "nav.notifications": "Notifications",
    "nav.surveys": "Surveys",
    "action.signout": "Sign out",
    "common.language": "Language",
  },
};

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
}
const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Server + primer render: siempre "es" para evitar mismatch de hidratación.
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved === "es" || saved === "en") setLangState(saved);
    } catch { /* ignore */ }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  };

  const t = (key: string, fallback?: string) =>
    DICTS[lang][key] ?? DICTS.es[key] ?? fallback ?? key;

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) return { lang: "es", setLang: () => {}, t: (k, f) => DICTS.es[k] ?? f ?? k };
  return c;
}
export const useT = () => useLang().t;

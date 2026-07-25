/**
 * Tema claro/oscuro de toda la web (home + plataforma).
 *
 * - Preferencia guardada en localStorage ("light" | "dark"); sin preferencia
 *   se usa la del sistema (prefers-color-scheme).
 * - Se aplica poniendo/quitando la clase `dark` en <html> (custom variant de
 *   Tailwind v4 + overrides en styles.css).
 * - Para evitar flash al cargar, __root inyecta THEME_BOOT_SCRIPT en <head>.
 */

const KEY = "freakn.theme";

export type Theme = "light" | "dark";

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)});var d=t? t==="dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* modo privado */
  }
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

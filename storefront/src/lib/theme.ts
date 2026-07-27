/**
 * Tema claro/oscuro de toda la web (home + plataforma).
 *
 * - Preferencia guardada en localStorage ("light" | "dark"); sin preferencia
 *   se usa CLARO (la marca se diseñó en claro; el oscuro es opt-in).
 * - Se aplica poniendo/quitando la clase `dark` en <html> (custom variant de
 *   Tailwind v4 + overrides en styles.css).
 * - Para evitar flash al cargar, __root inyecta THEME_BOOT_SCRIPT en <head>.
 */

const KEY = "freakn.theme";

export type Theme = "light" | "dark";

// Sin preferencia guardada el tema es CLARO. No se sigue el
// `prefers-color-scheme` del sistema: la marca se diseñó en claro y ese es el
// primer contacto que debe ver cualquier visitante; el oscuro es opt-in.
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)});document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`;

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

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, toggleTheme, type Theme } from "@/lib/theme";

/** Botón sol/luna para alternar el tema. Se usa en la home y en la app. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => setThemeState(getTheme()), []);

  return (
    <button
      type="button"
      onClick={() => setThemeState(toggleTheme())}
      className={`inline-flex size-9 items-center justify-center rounded-full border border-brand-line bg-white text-brand-ink/70 transition hover:-translate-y-0.5 hover:text-brand-ink ${className}`}
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label="Cambiar tema"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

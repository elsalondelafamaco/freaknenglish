import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * D9 · Muestra "Instalar app" cuando el navegador dispara `beforeinstallprompt`.
 * Se oculta si el usuario ya instaló la app o el navegador no lo soporta.
 */
export function InstallAppButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const installed = () => setEvt(null);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!evt) return null;
  return (
    <button
      onClick={async () => {
        await evt.prompt();
        await evt.userChoice;
        setEvt(null);
      }}
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
    >
      <Download className="size-3.5" /> Instalar app
    </button>
  );
}
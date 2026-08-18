import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { usersApi, authApi } from "@/lib/api/endpoints";
import { setAccessToken } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export function ImpersonationBanner() {
  const { refresh } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => usersApi.me() });
  const me = meQ.data as any;

  if (!me?.impersonatorId) return null;

  async function exit() {
    // Borra el vale de suplantación en el servidor y devuelve el token del
    // admin. Un `refresh` normal ya no basta: mientras el vale exista, el
    // backend sigue devolviendo la sesión del suplantado.
    try {
      const r = await authApi.stopImpersonation();
      setAccessToken(r.accessToken);
    } catch {
      /* ignore */
    }
    // Vaciar, no invalidar sólo ["me"]: al volver a ser admin, todo lo que se
    // cacheó como el otro usuario (sus clases, sus alumnos, su progreso) sigue
    // en memoria y se pinta bajo la sesión del admin hasta que caduque.
    qc.clear();
    await refresh();
    router.navigate({ to: "/admin/users" });
  }

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-xs font-medium text-brand-ink shadow-soft">
      <ShieldAlert className="size-4" />
      <span>
        Estás viendo la plataforma como <strong>{me.fullName}</strong> ({me.role})
      </span>
      <button onClick={exit} className="rounded-full bg-brand-ink px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-ink/90">
        Salir de impersonación
      </button>
    </div>
  );
}

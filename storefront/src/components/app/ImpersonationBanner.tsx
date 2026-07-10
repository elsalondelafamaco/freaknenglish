import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import {
  getImpersonation,
  onImpersonationChange,
  stopImpersonation,
} from "@/lib/domain/admin-actions";
import { readDb } from "@/lib/domain/repository";
import type { User } from "@/lib/domain/types";
import { useAuth } from "@/lib/auth/AuthProvider";

export function ImpersonationBanner() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [state, setState] = useState(() => getImpersonation());

  useEffect(() => onImpersonationChange(() => setState(getImpersonation())), []);

  if (!state) return null;

  const users = readDb().users as Record<string, User>;
  const target = users[state.targetId];

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-xs font-medium text-brand-ink shadow-soft">
      <ShieldAlert className="size-4" />
      <span>
        Estás viendo la plataforma como{" "}
        <strong>{target?.fullName ?? state.targetId}</strong> ({target?.roles.join(", ")})
      </span>
      <button
        onClick={() => {
          stopImpersonation();
          setState(null);
          refresh();
          router.navigate({ to: "/admin/users" });
        }}
        className="rounded-full bg-brand-ink px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-ink/90"
      >
        Salir de impersonación
      </button>
    </div>
  );
}
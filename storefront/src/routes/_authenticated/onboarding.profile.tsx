import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { usersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding/profile")({
  head: () => ({ meta: [{ title: "Completar perfil — FreaknEnglish" }] }),
  component: OnboardingProfile,
});

function OnboardingProfile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [documentNumber, setDocumentNumber] = useState(user?.documentNumber ?? "");

  const save = useMutation({
    mutationFn: () => usersApi.updateMe({ phone, documentNumber }),
    onSuccess: () => {
      toast.success("Perfil actualizado");
      refresh();
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al guardar"),
  });

  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="text-3xl font-bold text-brand-ink">Completa tu perfil</h1>
      <p className="mt-2 text-brand-ink/65">
        Necesitamos tu documento y teléfono para procesar tu suscripción y contactarte por tus clases.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!phone.trim() || !documentNumber.trim()) return toast.error("Todos los campos son obligatorios");
          save.mutate();
        }}
      >
        <div>
          <label className="text-sm font-medium">Número de documento</label>
          <input
            className="mt-1 w-full rounded-xl border border-brand-line px-4 py-2"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Teléfono</label>
          <input
            className="mt-1 w-full rounded-xl border border-brand-line px-4 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={save.isPending}
          className="w-full rounded-full bg-brand-ink px-6 py-3 font-semibold text-white disabled:opacity-60"
        >
          {save.isPending ? "Guardando…" : "Continuar"}
        </button>
      </form>
    </div>
  );
}
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { usersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PhoneInput, validatePhone } from "@/components/app/PhoneInput";
import { btnPrimary, inputClass } from "@/components/site/AuthShell";
import { PageHeader, cardPrimary } from "@/components/app/AppUi";
import { cn } from "@/lib/utils";
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
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-4 md:py-8">
      <PageHeader title="Completa tu perfil" highlight="perfil">
        Necesitamos tu documento y teléfono para procesar tu suscripción y contactarte por tus clases.
      </PageHeader>
      <form
        className={cn(cardPrimary, "space-y-4 p-5 md:p-7")}
        onSubmit={(e) => {
          e.preventDefault();
          if (!documentNumber.trim()) return toast.error("Todos los campos son obligatorios");
          const phoneError = validatePhone(phone);
          if (phoneError) return toast.error(phoneError);
          save.mutate();
        }}
      >
        <div>
          <label htmlFor="documento" className="mb-1.5 block text-[13px] font-bold text-brand-ink">
            Número de documento
          </label>
          <input
            id="documento"
            className={inputClass}
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor="telefono" className="mb-1.5 block text-[13px] font-bold text-brand-ink">
            Teléfono
          </label>
          <PhoneInput id="telefono" value={phone} onChange={setPhone} required />
        </div>
        <button type="submit" disabled={save.isPending} className={btnPrimary}>
          {save.isPending ? "Guardando…" : "Continuar"}
        </button>
      </form>
    </div>
  );
}

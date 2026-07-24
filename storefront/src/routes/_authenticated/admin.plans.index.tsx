import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { adminApi, exchangeApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/admin/plans/")({
  head: () => ({ meta: [{ title: "Planes — Admin Freakn'" }] }),
  component: AdminPlans,
});

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function AdminPlans() {
  const qc = useQueryClient();
  const plansQ = useQuery({ queryKey: ["admin", "plans"], queryFn: () => adminApi.plans() });
  const trmQ = useQuery({ queryKey: ["trm"], queryFn: () => exchangeApi.trm() });
  const trm = trmQ.data?.valueCop ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-ink">Planes y precios</h2>
        <p className="text-xs text-brand-ink/55">
          El precio se define en <strong>USD</strong>; al cobrar se convierte a COP con la TRM del momento.
          {trm ? <> TRM actual: <strong>{copFmt.format(trm)}</strong>/USD.</> : null}
        </p>
      </div>

      {plansQ.isLoading ? (
        <p className="text-sm text-brand-ink/60">Cargando…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {(plansQ.data ?? []).map((p: any) => (
            <PlanCard key={p.id} plan={p} trm={trm} onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "plans"] })} />
          ))}
        </div>
      )}

      <ContactCard />
    </div>
  );
}

function ContactCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "contact"], queryFn: () => adminApi.contactSettings() });
  const [num, setNum] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (q.data) { setNum(q.data.whatsappNumber); setMsg(q.data.whatsappMessage); } }, [q.data]);
  const saveM = useMutation({
    mutationFn: () => adminApi.updateContact({ whatsappNumber: num, whatsappMessage: msg }),
    onSuccess: () => { toast.success("Contacto actualizado"); qc.invalidateQueries({ queryKey: ["admin", "contact"] }); qc.invalidateQueries({ queryKey: ["contact"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5">
      <h3 className="text-sm font-semibold text-brand-ink">Contacto / WhatsApp</h3>
      <p className="text-xs text-brand-ink/55">Número y mensaje del botón “Escríbenos” en todo el sitio.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Número (solo dígitos, con país)
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="573001234567" className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Mensaje precargado
          <input value={msg} onChange={(e) => setMsg(e.target.value)} className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
        </label>
      </div>
      <button onClick={() => saveM.mutate()} disabled={saveM.isPending} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60">
        <Save className="size-3.5" /> {saveM.isPending ? "Guardando…" : "Guardar contacto"}
      </button>
    </section>
  );
}

function PlanCard({ plan, trm, onSaved }: { plan: any; trm: number; onSaved: () => void }) {
  const [name, setName] = useState(plan.name ?? "");
  const [priceUsd, setPriceUsd] = useState<number>(plan.priceUsd ?? 0);
  const [isActive, setIsActive] = useState<boolean>(plan.isActive ?? true);
  useEffect(() => {
    setName(plan.name ?? "");
    setPriceUsd(plan.priceUsd ?? 0);
    setIsActive(plan.isActive ?? true);
  }, [plan.id]);

  const saveM = useMutation({
    mutationFn: () => adminApi.updatePlan(plan.id, { name, priceUsd, isActive }),
    onSuccess: () => { toast.success("Plan actualizado"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const cop = trm ? Math.round(priceUsd * trm) : null;

  return (
    <div className="rounded-2xl border border-brand-line bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-semibold text-brand-ink">
          {plan.daysPerWeek} días/sem
        </span>
        <label className="inline-flex items-center gap-1.5 text-xs text-brand-ink/70">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Activo
        </label>
      </div>

      <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
      </label>

      <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
        Precio (USD / mes)
        <div className="mt-1 flex items-center gap-1">
          <span className="text-brand-ink/50">$</span>
          <input type="number" min={0} step="0.01" value={priceUsd} onChange={(e) => setPriceUsd(Number(e.target.value))} className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
        </div>
      </label>

      <div className="mt-2 text-xs text-brand-ink/55">
        ≈ {cop != null ? copFmt.format(cop) : "—"} <span className="opacity-60">(TRM en vivo)</span>
      </div>

      <button
        onClick={() => saveM.mutate()}
        disabled={saveM.isPending}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
      >
        <Save className="size-3.5" /> {saveM.isPending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

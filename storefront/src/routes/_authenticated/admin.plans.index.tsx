import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { horaEn12 } from "@/lib/domain/zona-horaria";
import { toast } from "sonner";
import { adminApi, exchangeApi } from "@/lib/api/endpoints";
import { Cargando, EstadoError, Interruptor, PageHeader, SeccionTitulo, btnChipInk } from "@/components/app/AppUi";
import { inputBase, pillClass } from "@/components/teacher/TeacherUi";

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
    <div className="flex flex-col gap-8">
      <PageHeader eyebrowText="Admin · Oferta" title="Planes y precios" highlight="precios">
        El precio se define en <strong>USD</strong>; al cobrar se convierte a pesos (COP) con la TRM, la tasa de cambio del día.
        {trm ? <> TRM actual: <strong>{copFmt.format(trm)}</strong> por dólar.</> : null}
      </PageHeader>

      {plansQ.isLoading ? (
        <Cargando>Cargando planes…</Cargando>
      ) : plansQ.isError ? (
        <EstadoError onRetry={() => void plansQ.refetch()}>No pudimos cargar los planes.</EstadoError>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(plansQ.data ?? []).map((p: any) => (
            <PlanCard key={p.id} plan={p} trm={trm} onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "plans"] })} />
          ))}
        </div>
      )}

      <ScheduleCard />

      <ContactCard />
    </div>
  );
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function ScheduleCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "schedule-config"], queryFn: () => adminApi.scheduleConfig() });
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState(7);
  const [endHour, setEndHour] = useState(18);
  const [maxPerDay, setMaxPerDay] = useState(1);
  useEffect(() => {
    if (q.data) {
      setDays(q.data.days);
      setStartHour(q.data.startHour);
      setEndHour(q.data.endHour);
      setMaxPerDay(q.data.maxPerDay);
    }
  }, [q.data]);
  const saveM = useMutation({
    mutationFn: () => adminApi.updateScheduleConfig({ days, startHour, endHour, maxPerDay }),
    onSuccess: () => {
      toast.success("Agenda actualizada");
      qc.invalidateQueries({ queryKey: ["admin", "schedule-config"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  return (
    <section aria-labelledby="agenda-global" className="border-2 border-brand-ink bg-white p-5">
      <SeccionTitulo id="agenda-global">Agenda global</SeccionTitulo>
      <p className="mt-1 text-xs text-brand-ink/70">Días y horas en que se pueden agendar clases (aplica al selector de horario de la compra).</p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <div id="agenda-dias" className="text-xs font-bold text-brand-ink">Días</div>
          <div role="group" aria-labelledby="agenda-dias" className="mt-1 flex flex-wrap gap-1.5">
            {DAY_LABELS.map((lbl, d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                onClick={() => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))}
                className={pillClass(days.includes(d))}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs font-bold text-brand-ink">
          Desde (hora, 0 a 23)
          <input type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className={`${inputBase} mt-1 w-24`} />
        </label>
        <label className="block text-xs font-bold text-brand-ink">
          Hasta (última clase, 0 a 23)
          <input type="number" min={0} max={23} value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} className={`${inputBase} mt-1 w-24`} />
        </label>
        <label className="block text-xs font-bold text-brand-ink">
          Máximo de clases por día
          <input type="number" min={1} max={4} value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))} className={`${inputBase} mt-1 w-24`} />
        </label>
        <button type="button" onClick={() => saveM.mutate()} disabled={saveM.isPending} className={btnChipInk}>
          <Save className="size-3.5" aria-hidden="true" /> {saveM.isPending ? "Guardando…" : "Guardar agenda"}
        </button>
      </div>
      <p className="mt-2 text-xs text-brand-ink/70">
        Última franja: {horaEn12(endHour)} a {horaEn12(endHour, 50)} · Clases de 50 min
      </p>
    </section>
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
    <section aria-labelledby="contacto-wa" className="border-2 border-brand-ink bg-white p-5">
      <SeccionTitulo id="contacto-wa">Contacto y WhatsApp</SeccionTitulo>
      <p className="mt-1 text-xs text-brand-ink/70">Número y mensaje del botón “Escríbenos” en todo el sitio.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-bold text-brand-ink">
          Número (solo dígitos, con país)
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="573001234567" inputMode="numeric" className={`${inputBase} mt-1`} />
        </label>
        <label className="block text-xs font-bold text-brand-ink">
          Mensaje precargado
          <input value={msg} onChange={(e) => setMsg(e.target.value)} className={`${inputBase} mt-1`} />
        </label>
      </div>
      <button type="button" onClick={() => saveM.mutate()} disabled={saveM.isPending} className={`${btnChipInk} mt-3`}>
        <Save className="size-3.5" aria-hidden="true" /> {saveM.isPending ? "Guardando…" : "Guardar contacto"}
      </button>
    </section>
  );
}

function PlanCard({ plan, trm, onSaved }: { plan: any; trm: number; onSaved: () => void }) {
  const [name, setName] = useState(plan.name ?? "");
  const [priceUsd, setPriceUsd] = useState<number>(plan.priceUsd ?? 0);
  const [priceCop, setPriceCop] = useState<number>(plan.priceCop ?? 0);
  const [isActive, setIsActive] = useState<boolean>(plan.isActive ?? true);
  useEffect(() => {
    setName(plan.name ?? "");
    setPriceUsd(plan.priceUsd ?? 0);
    setPriceCop(plan.priceCop ?? 0);
    setIsActive(plan.isActive ?? true);
  }, [plan.id]);

  const saveM = useMutation({
    mutationFn: () => adminApi.updatePlan(plan.id, { name, priceUsd, priceCop, isActive }),
    onSuccess: () => { toast.success("Plan actualizado"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const cop = trm ? Math.round(priceUsd * trm) : null;

  return (
    <div className="shadow-hard border-2 border-brand-ink bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-full border-[1.5px] border-brand-ink bg-white px-2.5 py-0.5 text-[11px] font-bold text-brand-ink">
          {plan.daysPerWeek} días/sem
        </span>
        <span className="inline-flex items-center gap-1">
          <span id={`plan-activo-${plan.id}`} className="text-xs font-bold text-brand-ink">{isActive ? "Activo" : "Inactivo"}</span>
          <Interruptor checked={isActive} onChange={setIsActive} labelledBy={`plan-activo-${plan.id}`} />
        </span>
      </div>

      <label className="mt-3 block text-xs font-bold text-brand-ink">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow" />
      </label>

      <label className="mt-3 block text-xs font-bold text-brand-ink">
        Precio (USD por mes)
        <div className="mt-1 flex items-center gap-1">
          <span className="text-brand-ink/70">$</span>
          <input type="number" min={0} step="0.01" value={priceUsd} onChange={(e) => setPriceUsd(Number(e.target.value))} className="w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow" />
        </div>
      </label>

      <div className="mt-2 text-xs text-brand-ink/70">
        ≈ {cop != null ? copFmt.format(cop) : "—"} <span>(con la TRM de hoy)</span>
      </div>

      {/* El COP de respaldo: es lo que se cobra y se muestra cuando el plan no
          tiene precio en dólares o no hay TRM. Hasta ahora no se podía editar
          desde aquí, así que arrastraba el valor de la semilla original y no
          coincidía con lo que pagaba el alumno. */}
      <label className="mt-3 block text-xs font-bold text-brand-ink">
        Precio de respaldo (COP)
        <input
          type="number"
          min={0}
          step="1000"
          value={priceCop}
          onChange={(e) => setPriceCop(Number(e.target.value))}
          className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
        />
        <span className="mt-1 block font-normal text-[11px] text-brand-ink/70">
          Solo se usa si el plan no tiene precio en USD o si falla la TRM.
        </span>
      </label>

      <button
        type="button"
        onClick={() => saveM.mutate()}
        disabled={saveM.isPending}
        className={`${btnChipInk} mt-4 w-full`}
      >
        <Save className="size-3.5" /> {saveM.isPending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

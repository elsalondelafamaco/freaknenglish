import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/admin/users/")({
  head: () => ({ meta: [{ title: "CRM — Admin Freakn'" }] }),
  component: AdminCRM,
});

type Level = "beginner" | "intermediate" | "advanced";

function AdminCRM() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "student" | "teacher" | "admin">("all");
  const [showCreate, setShowCreate] = useState(false);

  const usersQ = useQuery({ queryKey: ["admin", "users", q], queryFn: () => adminApi.users(q.trim() || undefined) });
  const rows = (usersQ.data ?? []) as any[];
  const filtered = rows.filter((u) => (role === "all" ? true : u.role === role));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o email…" className="w-full rounded-full border border-brand-line bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-ink focus:outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-brand-line bg-white p-1 text-xs">
            {(["all", "student", "teacher", "admin"] as const).map((r) => (
              <button key={r} onClick={() => setRole(r)} className={`rounded-full px-3 py-1.5 font-medium capitalize transition ${role === r ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:text-brand-ink"}`}>
                {r === "all" ? "Todos" : r}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5">
            <Plus className="size-3.5" /> Invitar usuario
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-cream/40 text-xs uppercase tracking-wide text-brand-ink/60">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {usersQ.isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-ink/55">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-ink/55">Sin resultados.</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="cursor-pointer hover:bg-brand-cream/30">
                  <td className="px-4 py-3">
                    <Link to="/admin/users/$id" params={{ id: u.id }} className="block">
                      <div className="font-semibold text-brand-ink hover:underline">{u.fullName}</div>
                      <div className="text-xs text-brand-ink/55">{u.email}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-ink">{u.role}</span>
                    {u.disabledAt ? <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">inactivo</span> : null}
                  </td>
                  <td className="px-4 py-3 capitalize text-brand-ink/70">{u.englishLevel ?? "—"}</td>
                  <td className="px-4 py-3 text-brand-ink/70">{u.subscription?.plan?.name ?? "—"}</td>
                  <td className="px-4 py-3">{u.subscription ? <StatusBadge status={u.subscription.status} /> : <span className="text-brand-ink/40">—</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate ? <CreateUserDialog onClose={() => setShowCreate(false)} /> : null}
    </div>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userRole, setUserRole] = useState<"student" | "teacher">("student");
  const [level, setLevel] = useState<Level>("beginner");
  // Empalme: estudiantes que ya pagaron por fuera de Wompi.
  const [withPlan, setWithPlan] = useState(false);
  const [planId, setPlanId] = useState("");
  const [planEndDate, setPlanEndDate] = useState("");

  const plansQ = useQuery({ queryKey: ["admin", "plans"], queryFn: () => adminApi.plans(), enabled: userRole === "student" });
  const plans = (plansQ.data ?? []) as Array<{ id: string; name: string }>;

  const createM = useMutation({
    mutationFn: () =>
      adminApi.createUser({
        fullName,
        email,
        role: userRole,
        level: userRole === "student" ? level : undefined,
        plan:
          userRole === "student" && withPlan && planId && planEndDate
            ? { planId, endDate: planEndDate }
            : undefined,
      }),
    onSuccess: () => {
      toast.success(
        withPlan && userRole === "student"
          ? "Usuario invitado con plan activo. Le llegó el correo de invitación."
          : "Usuario invitado. Le llegó el correo para crear su contraseña.",
      );
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={(e) => { e.preventDefault(); createM.mutate(); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-brand-ink">Invitar usuario</h2>
        <p className="mt-1 text-xs text-brand-ink/60">
          Le llegará un correo de invitación con el link para crear su contraseña y entrar. Sin plan manual, un estudiante se activa solo tras pagar por Wompi.
        </p>

        <div className="mt-4 flex gap-2">
          {(["student", "teacher"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setUserRole(r)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium capitalize ${userRole === r ? "border-brand-ink bg-brand-ink text-white" : "border-brand-line text-brand-ink/70 hover:bg-brand-cream/30"}`}>
              {r === "student" ? "Estudiante" : "Profesor"}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-semibold text-brand-ink/70">
          Nombre completo
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
        </label>
        <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none" />
        </label>
        {userRole === "student" ? (
          <>
            <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
              Nivel inicial
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none">
                <option value="beginner">Beginner (A1–A2)</option>
                <option value="intermediate">Intermediate (B1–B2)</option>
                <option value="advanced">Advanced (C1)</option>
              </select>
            </label>

            <label className="mt-4 flex items-start gap-2 rounded-xl border border-brand-line bg-brand-cream/20 p-3">
              <input
                type="checkbox"
                checked={withPlan}
                onChange={(e) => setWithPlan(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-brand-ink/75">
                <strong className="block text-brand-ink">Activar plan manualmente</strong>
                Para estudiantes que ya pagaron por fuera de Wompi. La suscripción queda activa hasta la fecha que definas.
              </span>
            </label>

            {withPlan ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-brand-ink/70">
                  Plan
                  <select value={planId} onChange={(e) => setPlanId(e.target.value)} required className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none">
                    <option value="" disabled>Selecciona…</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-brand-ink/70">
                  Activo hasta
                  <input
                    type="date"
                    value={planEndDate}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/30">Cancelar</button>
          <button type="submit" disabled={createM.isPending} className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white shadow-soft hover:-translate-y-0.5 transition disabled:opacity-60">
            {createM.isPending ? "Enviando…" : "Enviar invitación"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    pending: "bg-amber-100 text-amber-800",
    past_due: "bg-red-100 text-red-800",
    canceled: "bg-zinc-100 text-zinc-700",
    expired: "bg-zinc-100 text-zinc-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${styles[status] ?? "bg-zinc-100 text-zinc-700"}`}>{status.replace("_", " ")}</span>;
}

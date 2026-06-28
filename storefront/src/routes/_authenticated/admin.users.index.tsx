import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { listAllUsers } from "@/lib/domain/admin";
import { createUserByAdmin } from "@/lib/domain/admin-actions";
import type { EnglishLevel } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "CRM — Admin Freakn'" }] }),
  component: AdminCRM,
});

function AdminCRM() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "student" | "teacher" | "admin">("all");
  const [tick, setTick] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const rows = useMemo(() => listAllUsers(), [tick]);
  const filtered = rows.filter((r) => {
    if (role !== "all" && !r.user.roles.includes(role)) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (
      r.user.fullName.toLowerCase().includes(t) ||
      r.user.email.toLowerCase().includes(t)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="w-full rounded-full border border-brand-line bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-ink focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-brand-line bg-white p-1 text-xs">
          {(["all", "student", "teacher", "admin"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-full px-3 py-1.5 font-medium capitalize transition ${
                role === r ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:text-brand-ink"
              }`}
            >
              {r === "all" ? "Todos" : r}
            </button>
          ))}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
          >
            <Plus className="size-3.5" /> Crear usuario
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
              <th className="px-4 py-3">Clases</th>
              <th className="px-4 py-3">Última</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-brand-ink/55">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.user.id} className="cursor-pointer hover:bg-brand-cream/30">
                  <td className="px-4 py-3">
                    <Link to="/admin/users/$id" params={{ id: r.user.id }} className="block">
                      <div className="font-semibold text-brand-ink hover:underline">{r.user.fullName}</div>
                      <div className="text-xs text-brand-ink/55">{r.user.email}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.user.roles.map((rr) => (
                        <span
                          key={rr}
                          className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-ink"
                        >
                          {rr}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-brand-ink/70">
                    {r.user.level ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-brand-ink/70">{r.planLabel ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.subscription ? (
                      <StatusBadge status={r.subscription.status} />
                    ) : (
                      <span className="text-brand-ink/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-ink/80">{r.classes}</td>
                  <td className="px-4 py-3 text-brand-ink/60">
                    {r.lastClassAt
                      ? new Date(r.lastClassAt).toLocaleDateString("es-CO")
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate ? (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setTick((t) => t + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userRole, setUserRole] = useState<"student" | "teacher">("student");
  const [level, setLevel] = useState<EnglishLevel>("beginner");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      createUserByAdmin({ fullName, email, role: userRole, level });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-brand-ink">Crear usuario</h2>
        <p className="mt-1 text-xs text-brand-ink/60">
          Se enviará un email para configurar contraseña. Crear un estudiante
          <strong> no activa la suscripción</strong> — eso ocurre tras un pago Wompi.
        </p>

        <div className="mt-4 flex gap-2">
          {(["student", "teacher"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setUserRole(r)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium capitalize ${
                userRole === r
                  ? "border-brand-ink bg-brand-ink text-white"
                  : "border-brand-line text-brand-ink/70 hover:bg-brand-cream/30"
              }`}
            >
              {r === "student" ? "Estudiante" : "Profesor"}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-semibold text-brand-ink/70">
          Nombre completo
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
        </label>
        {userRole === "student" ? (
          <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
            Nivel inicial
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as EnglishLevel)}
              className="mt-1 w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            >
              <option value="beginner">Beginner (A1–A2)</option>
              <option value="intermediate">Intermediate (B1–B2)</option>
              <option value="advanced">Advanced (C1)</option>
            </select>
          </label>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/30"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white shadow-soft hover:-translate-y-0.5 transition"
          >
            Crear
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    trialing: "bg-blue-100 text-blue-800",
    pending: "bg-amber-100 text-amber-800",
    past_due: "bg-red-100 text-red-800",
    canceled: "bg-zinc-100 text-zinc-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
        styles[status] ?? "bg-zinc-100 text-zinc-700"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
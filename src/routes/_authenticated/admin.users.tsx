import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { listAllUsers } from "@/lib/domain/admin";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "CRM — Admin Freakn'" }] }),
  component: AdminCRM,
});

function AdminCRM() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "student" | "teacher" | "admin">("all");
  const rows = useMemo(() => listAllUsers(), []);
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
                <tr key={r.user.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-ink">{r.user.fullName}</div>
                    <div className="text-xs text-brand-ink/55">{r.user.email}</div>
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
      <p className="text-xs text-brand-ink/50">
        Datos en vivo del repositorio mock. En producción, esta vista paginará server-side.
      </p>
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
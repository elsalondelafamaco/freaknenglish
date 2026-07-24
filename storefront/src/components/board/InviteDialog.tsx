import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { boardsApi } from "@/lib/api/endpoints";

export function InviteDialog({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await boardsApi.inviteByEmail(boardId, email.trim(), role);
      toast.success(`${res.user.fullName || res.user.email} invitado como ${role}`);
      setEmail("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo invitar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-brand-line px-3 py-1 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
      >
        <UserPlus className="size-3.5" /> Invitar
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-brand-ink/40 p-4" onClick={() => setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-ink">Invitar al board</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-brand-ink/40 hover:text-brand-ink">
                <X className="size-4" />
              </button>
            </header>
            <label className="mb-2 block text-xs font-medium text-brand-ink/70">Email del usuario</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alguien@correo.com"
              className="mb-3 w-full rounded-lg border border-brand-line px-3 py-2 text-sm outline-none focus:border-brand-ink"
            />
            <label className="mb-2 block text-xs font-medium text-brand-ink/70">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="mb-4 w-full rounded-lg border border-brand-line px-3 py-2 text-sm"
            >
              <option value="editor">Editor (puede editar)</option>
              <option value="viewer">Viewer (solo lectura)</option>
            </select>
            <button
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Invitando…" : "Invitar"}
            </button>
            <p className="mt-2 text-[11px] text-brand-ink/50">
              El usuario debe existir. Solo el owner del board puede invitar.
            </p>
          </form>
        </div>
      ) : null}
    </>
  );
}

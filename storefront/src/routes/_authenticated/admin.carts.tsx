import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, ShoppingCart, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";
import { formatCop } from "@/lib/domain/plans";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/carts")({
  head: () => ({ meta: [{ title: "Carritos abandonados — Admin Freakn'" }] }),
  component: AdminCarts,
});

function AdminCarts() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "carts"],
    queryFn: () => adminApi.abandonedCarts(),
    refetchInterval: 60_000,
  });

  const remind = useMutation({
    mutationFn: (body: { intentId?: string; userId?: string }) => adminApi.sendCartReminder(body),
    onSuccess: () => {
      toast.success("Recordatorio enviado");
      qc.invalidateQueries({ queryKey: ["admin", "carts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo enviar"),
  });

  return (
    <div>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Carritos abandonados</h1>
        <p className="mt-1 text-sm text-brand-ink/65">
          Ventas por recuperar: checkouts sin pagar y registros que nunca compraron. El
          recordatorio automático sale solo a las 4 horas; desde aquí puedes reenviarlo cuando quieras.
        </p>
      </header>

      {isLoading ? (
        <div className="mt-10 text-center text-sm text-brand-ink/50">Cargando…</div>
      ) : (
        <>
          <Section
            icon={ShoppingCart}
            title={`Checkouts sin pagar (${data?.carts.length ?? 0})`}
            empty="No hay checkouts pendientes de pago. 🎉"
          >
            {data?.carts.map((c) => (
              <Row
                key={c.intentId}
                name={c.fullName}
                email={c.email}
                phone={c.phone}
                meta={`${c.planName} · ${formatCop(c.amountInCents / 100)} · ${fmtDate(c.createdAt)}`}
                reminder={c.reminder}
                sending={remind.isPending}
                onRemind={() => remind.mutate({ intentId: c.intentId })}
              />
            ))}
          </Section>

          <Section
            icon={UserPlus}
            title={`Registrados sin compra (${data?.registered.length ?? 0})`}
            empty="Todos los registrados tienen plan. 🎉"
          >
            {data?.registered.map((u) => (
              <Row
                key={u.userId}
                name={u.fullName}
                email={u.email}
                phone={u.phone}
                meta={`Registro: ${fmtDate(u.createdAt)}${u.lastLoginAt ? ` · Último ingreso: ${fmtDate(u.lastLoginAt)}` : ""}`}
                reminder={u.reminder}
                sending={remind.isPending}
                onRemind={() => remind.mutate({ userId: u.userId })}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function Section({
  icon: Icon,
  title,
  empty,
  children,
}: {
  icon: typeof ShoppingCart;
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-lg font-bold text-brand-ink">
        <Icon className="size-5" /> {title}
      </h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-brand-line bg-white shadow-soft">
        {hasItems ? (
          <div className="divide-y divide-brand-line/60">{children}</div>
        ) : (
          <div className="p-8 text-center text-sm text-brand-ink/50">{empty}</div>
        )}
      </div>
    </section>
  );
}

function Row({
  name,
  email,
  phone,
  meta,
  reminder,
  sending,
  onRemind,
}: {
  name: string;
  email: string;
  phone: string | null;
  meta: string;
  reminder: { status: string; at: string } | null;
  sending: boolean;
  onRemind: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-brand-ink">{name || "—"}</div>
        <div className="truncate text-xs text-brand-ink/60">
          {email}
          {phone ? ` · ${phone}` : ""}
        </div>
        <div className="mt-0.5 text-xs text-brand-ink/50">{meta}</div>
      </div>
      <div className="flex items-center gap-2">
        {reminder ? (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              reminder.status === "sent"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700",
            )}
          >
            Recordado {fmtDate(reminder.at)}
          </span>
        ) : (
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            Sin recordatorio
          </span>
        )}
        <button
          onClick={onRemind}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          <Mail className="size-3.5" /> {reminder ? "Reenviar" : "Enviar recordatorio"}
        </button>
      </div>
    </div>
  );
}

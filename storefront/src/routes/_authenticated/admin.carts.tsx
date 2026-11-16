import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, ShoppingCart, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";
import { formatCop } from "@/lib/domain/plans";
import { Cargando, EstadoError, PageHeader, Vacio } from "@/components/app/AppUi";
import { Seccion, btnRowInk } from "@/components/teacher/TeacherUi";
import { ChipEstado } from "@/components/admin/AdminUi";

export const Route = createFileRoute("/_authenticated/admin/carts")({
  head: () => ({ meta: [{ title: "Carritos abandonados — Admin Freakn'" }] }),
  component: AdminCarts,
});

function AdminCarts() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
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
    <div className="flex flex-col gap-8">
      <PageHeader eyebrowText="Admin · Hoy" title="Ventas por recuperar" highlight="recuperar">
        Checkouts sin pagar y registros que nunca compraron. El recordatorio automático sale solo a las 4 horas;
        desde aquí puedes reenviarlo cuando quieras.
      </PageHeader>

      {isLoading ? (
        <Cargando>Cargando carritos…</Cargando>
      ) : isError ? (
        <EstadoError onRetry={() => void refetch()}>No pudimos cargar los carritos abandonados.</EstadoError>
      ) : (
        <>
          <Lista
            id="sin-pagar"
            icon={ShoppingCart}
            title={`Checkouts sin pagar (${data?.carts.length ?? 0})`}
            vacio="No hay checkouts pendientes de pago."
            principal
          >
            {data?.carts.map((c) => (
              <Fila
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
          </Lista>

          <Lista
            id="sin-compra"
            icon={UserPlus}
            title={`Registrados sin compra (${data?.registered.length ?? 0})`}
            vacio="Todos los registrados tienen plan."
          >
            {data?.registered.map((u) => (
              <Fila
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
          </Lista>
        </>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function Lista({
  id,
  icon: Icon,
  title,
  vacio,
  principal,
  children,
}: {
  id: string;
  icon: typeof ShoppingCart;
  title: string;
  vacio: string;
  principal?: boolean;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <Seccion
      id={id}
      principal={!!principal}
      titulo={
        <span className="inline-flex items-center gap-2">
          <Icon className="size-5" aria-hidden="true" /> {title}
        </span>
      }
    >
      {hasItems ? (
        <div className="divide-y divide-brand-ink/15 border-t border-brand-ink/15">{children}</div>
      ) : (
        <div className="p-4 pt-0">
          <Vacio>{vacio}</Vacio>
        </div>
      )}
    </Seccion>
  );
}

function Fila({
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
        <div className="font-bold text-brand-ink">{name || "—"}</div>
        <div className="truncate text-xs text-brand-ink/70">
          {email}
          {phone ? ` · ${phone}` : ""}
        </div>
        <div className="mt-0.5 text-xs text-brand-ink/70">{meta}</div>
      </div>
      <div className="flex items-center gap-2">
        {reminder ? (
          <ChipEstado atencion={reminder.status !== "sent"}>Recordado {fmtDate(reminder.at)}</ChipEstado>
        ) : (
          <ChipEstado atencion>Sin recordatorio</ChipEstado>
        )}
        <button
          type="button"
          onClick={onRemind}
          disabled={sending}
          aria-label={`${reminder ? "Reenviar recordatorio" : "Enviar recordatorio"} a ${name || email}`}
          className={btnRowInk}
        >
          <Mail className="size-3.5" aria-hidden="true" /> {reminder ? "Reenviar" : "Enviar recordatorio"}
        </button>
      </div>
    </div>
  );
}

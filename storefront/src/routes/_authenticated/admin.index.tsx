import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Smile,
  TrendingUp,
  Users,
} from "lucide-react";
import { computeKpis, formatCop } from "@/lib/domain/admin";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Analítica — Admin Freakn'" }] }),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const k = useMemo(() => computeKpis(), []);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card
        icon={<Users className="size-4" />}
        label="Estudiantes"
        value={k.students.toString()}
        sub={`${k.totalUsers} usuarios totales · ${k.teachers} profes`}
      />
      <Card
        icon={<CreditCard className="size-4" />}
        label="Suscripciones activas"
        value={k.activeSubscriptions.toString()}
        highlight
      />
      <Card
        icon={<TrendingUp className="size-4" />}
        label="MRR estimado"
        value={formatCop(k.mrrCop)}
        sub="Suma mensual de planes activos"
      />
      <Card
        icon={<GraduationCap className="size-4" />}
        label="Clases este mes"
        value={k.classesThisMonth.toString()}
      />
      <Card
        icon={<CheckCircle2 className="size-4" />}
        label="Tasa de asistencia"
        value={`${k.completionRate}%`}
        sub="Clases completadas vs. realizadas"
      />
      <Card
        icon={<Smile className="size-4" />}
        label="NPS"
        value={k.npsScore == null ? "—" : `${k.npsScore}`}
        sub={k.npsScore == null ? "Sin respuestas aún" : "(promotores - detractores)"}
      />
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight ? "border-brand-ink bg-brand-cream/30" : "border-brand-line bg-white"
      }`}
    >
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink/60">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-brand-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-brand-ink/55">{sub}</div> : null}
    </div>
  );
}
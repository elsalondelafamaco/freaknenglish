import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  LayoutGrid,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { classesApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => ({ meta: [{ title: "Calendario — FreaknEnglish" }] }),
  component: CalendarPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const startsSoon = (c: any) => {
  const diff = new Date(c.startsAt).getTime() - Date.now();
  return diff < 15 * 60_000 && diff > -60 * 60_000; // 15 min antes → 1 h después
};

type Tab = "upcoming" | "taken" | "all";

function CalendarPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [reporting, setReporting] = useState<any | null>(null);
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: () => classesApi.list() });

  const classes = (classesQ.data ?? []) as any[];
  const now = Date.now();
  const { upcoming, taken, other } = useMemo(() => {
    const upcoming = classes
      .filter((c) => ["scheduled", "rescheduled"].includes(c.status) && new Date(c.endsAt).getTime() >= now)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    const taken = classes
      .filter((c) => c.status === "validated")
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    const other = classes
      .filter((c) => !upcoming.includes(c) && c.status !== "validated")
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { upcoming, taken, other };
  }, [classes, now]);

  // El link de Meet/Zoom lo asigna tu profesor a tu perfil.
  const meetUrl = (user as any)?.meetingUrl as string | undefined;

  const next = upcoming[0];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Calendario</h1>
          <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
            Tus clases 1 a 1 con {classes[0]?.teacher?.fullName ?? "tu profe"} — todas en vivo.
          </p>
        </div>
        <div className="flex gap-4 text-center">
          <Stat label="Tomadas" value={taken.length} />
          <Stat label="Próximas" value={upcoming.length} />
        </div>
      </header>

      {/* Próxima clase destacada con acceso rápido */}
      {next ? (
        <section className="rounded-3xl bg-brand-ink p-6 text-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {startsSoon(next) ? "¡Tu clase es ahora!" : "Tu próxima clase"}
              </div>
              <div className="mt-1 text-xl font-bold capitalize">{fmtDate(next.startsAt)}</div>
              <div className="mt-0.5 text-sm text-white/70">
                50 minutos · {next.teacher?.fullName ?? "tu profe"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {meetUrl ? (
                <a
                  href={meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition hover:-translate-y-0.5",
                    startsSoon(next)
                      ? "bg-brand-yellow text-brand-ink animate-pulse"
                      : "bg-white text-brand-ink",
                  )}
                >
                  <Video className="size-4" /> Entrar a clase
                </a>
              ) : (
                <span className="rounded-full bg-white/10 px-4 py-2.5 text-xs text-white/70">
                  Tu profe aún no configura el link de la clase
                </span>
              )}
              {next.meetingUrl ? (
                <a
                  href={next.meetingUrl}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <LayoutGrid className="size-4" /> Ver board
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1.5">
        {([
          ["upcoming", `Próximas (${upcoming.length})`],
          ["taken", `Tomadas (${taken.length})`],
          ["all", "Todas"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              tab === key
                ? "bg-brand-ink text-white shadow-soft"
                : "bg-white text-brand-ink/65 border border-brand-line hover:border-brand-ink/40",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {classesQ.isLoading ? (
        <div className="text-sm text-brand-ink/55">Cargando…</div>
      ) : (
        <>
          {tab === "upcoming" ? (
            upcoming.length === 0 ? (
              <Empty text="No tienes clases programadas todavía." />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {upcoming.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-2xl border border-brand-line bg-white p-5 transition hover:shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-bold capitalize text-brand-ink">
                          <Clock className="size-4 text-brand-ink/50" /> {fmtDate(c.startsAt)}
                        </div>
                        <div className="mt-1 text-xs text-brand-ink/55">
                          {c.teacher?.fullName ?? "tu profe"} · 50 min
                        </div>
                      </div>
                      {c.status === "rescheduled" ? (
                        <StatusPill status="rescheduled" />
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {meetUrl ? (
                        <a
                          href={meetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-ink-soft"
                        >
                          <Video className="size-3.5" /> Entrar
                        </a>
                      ) : null}
                      {c.meetingUrl ? (
                        <a
                          href={c.meetingUrl}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/20 px-4 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-cream/40"
                        >
                          <LayoutGrid className="size-3.5" /> Board
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "taken" ? (
            taken.length === 0 ? (
              <Empty text="Aún no tienes clases tomadas — ¡tu primera está cerca!" />
            ) : (
              <ClassTable
                classes={taken}
                onReport={(c) => setReporting(c)}
              />
            )
          ) : null}

          {tab === "all" ? (
            classes.length === 0 ? (
              <Empty text="Aún no tienes clases." />
            ) : (
              <ClassTable
                classes={[...upcoming, ...taken, ...other]}
                onReport={(c) => (c.status === "validated" || c.status === "no_show" ? setReporting(c) : undefined)}
              />
            )
          ) : null}
        </>
      )}

      {reporting ? (
        <ReportDialog
          session={reporting}
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            qc.invalidateQueries({ queryKey: ["classes"] });
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-brand-line bg-white px-5 py-3">
      <div className="text-2xl font-bold text-brand-ink">{value}</div>
      <div className="text-xs text-brand-ink/55">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-brand-line p-8 text-center text-sm text-brand-ink/55">
      {text}
    </div>
  );
}

function ClassTable({ classes, onReport }: { classes: any[]; onReport?: (c: any) => void }) {
  return (
    <ul className="divide-y divide-brand-line rounded-2xl border border-brand-line bg-white">
      {classes.map((c) => {
        const reportable = onReport && ["validated", "no_show"].includes(c.status);
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div className="flex items-center gap-3">
              {c.status === "validated" ? (
                <CheckCircle2 className="size-4 shrink-0 text-brand-success" />
              ) : (
                <CalendarDays className="size-4 shrink-0 text-brand-ink/40" />
              )}
              <div>
                <div className="font-semibold capitalize text-brand-ink">{fmtDate(c.startsAt)}</div>
                <div className="text-xs text-brand-ink/55">{c.teacher?.fullName ?? "tu profe"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={c.status} />
              {reportable ? (
                <button
                  onClick={() => onReport!(c)}
                  className="inline-flex items-center gap-1 rounded-full border border-brand-line px-3 py-1.5 text-[11px] font-semibold text-brand-ink/70 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  <Flag className="size-3" /> Reportar
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    validated: { label: "Tomada", cls: "bg-brand-success/15 text-brand-success" },
    cancelled: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
    no_show: { label: "No asististe", cls: "bg-orange-100 text-orange-700" },
    rescheduled: { label: "Reprogramada", cls: "bg-brand-yellow/60 text-brand-ink" },
    scheduled: { label: "Programada", cls: "bg-brand-cream text-brand-ink/70" },
  };
  const v = map[status] ?? { label: status, cls: "bg-brand-cream text-brand-ink/70" };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${v.cls}`}>{v.label}</span>;
}

/** Reporte de una clase: envía nota al equipo admin (correo + notificación). */
function ReportDialog({ session, onClose, onDone }: { session: any; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const report = useMutation({
    mutationFn: () => classesApi.report(session.id, note.trim()),
    onSuccess: () => {
      toast.success("Reporte enviado — el equipo lo revisará y te contactará.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo enviar el reporte"),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar clase</DialogTitle>
          <DialogDescription>
            Clase del {fmtDate(session.startsAt)}. Cuéntanos qué pasó — el equipo de
            FreaknEnglish recibirá tu reporte de inmediato.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Ej: mi profe no se conectó, la clase se marcó como tomada pero no la recibí…"
          className="w-full rounded-xl border border-brand-line px-4 py-3 text-sm focus:border-brand-ink focus:outline-none"
        />
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-full border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-ink"
          >
            Cancelar
          </button>
          <button
            disabled={!note.trim() || report.isPending}
            onClick={() => report.mutate()}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Flag className="size-3.5" /> {report.isPending ? "Enviando…" : "Enviar reporte"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

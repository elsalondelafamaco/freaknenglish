import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  Mail,
  Pencil,
  Power,
  KeyRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type {
  ClassSession,
  SatisfactionSurvey,
  Subscription,
  User,
  EnglishLevel,
  AppRole,
} from "@/lib/domain/types";
import { getPlan, formatCop } from "@/lib/domain/plans";
type PaymentIntent = Record<string, any>;
import { adminApi, classesApi, scheduleApi } from "@/lib/api/endpoints";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SchedulePickerGrid } from "@/components/schedule/SchedulePickerGrid";
import type { SlotRef } from "@/lib/api/endpoints";
import { homePathFor, rolesOfRow } from "@/lib/roles";
import { ActivityResultsSection, CheckpointAttemptsSection, CheckpointGatesSection, LessonPlanSection, StudentReportsSection, StudentResourcesSection } from "./teacher.students.$studentId";
import { setAccessToken } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  head: () => ({ meta: [{ title: "Perfil de usuario — Admin" }] }),
  component: AdminUserDetail,
});

type TabId = "overview" | "subscription" | "schedule" | "payments" | "classes" | "learning" | "reports" | "nps" | "notes" | "students";

function AdminUserDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { user: me, refresh } = useAuth();
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [banConfirmOpen, setBanConfirmOpen] = useState(false);
  const [verComoOpen, setVerComoOpen] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [resetInfo, setResetInfo] = useState<{ link: string | null } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [remote, setRemote] = useState<any | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([adminApi.userDetail(id), adminApi.users()])
      .then(([detail, users]) => {
        if (cancelled) return;
        setRemote(detail);
        setRemoteUsers(users ?? []);
      })
      .catch((err) => {
        console.error("[admin user detail]", err);
        if (!cancelled) setRemote(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  const data = useMemo(() => {
    if (remote?.user) {
      const user = adaptAdminUser(remote.user);
      const isStudent = user.roles.includes("student");
      const isTeacher = user.roles.includes("teacher");
      const teachers = remoteUsers.map(adaptAdminUser).filter((u) => u.roles.includes("teacher") && !u.deletedAt);
      const students = (remote.assignedStudents ?? []).map(adaptAdminUser);
      const classes = (remote.classes ?? []).map(adaptAdminClass);
      const payments = (remote.payments ?? []).map(adaptAdminPayment);
      const surveys = (remote.surveys ?? []).map(adaptAdminSurvey);
      const notes = (remote.notes ?? []).map(adaptAdminNote);
      const progress = (remote.progress ?? []).map((p: any) => ({
        userId: user.id,
        lessonId: p.lessonId ?? p.lesson?.id ?? p.id,
        completedAt: p.completedAt ?? p.updatedAt ?? p.createdAt ?? new Date().toISOString(),
      }));
      const assignedTeacher = remote.user.assignedTeacher ? adaptAdminUser({ ...remote.user.assignedTeacher, role: "teacher" }) : null;
      const classTotals = (remote.classTotals ?? {}) as Record<string, number>;
      return { user, isStudent, isTeacher, sub: adaptAdminSubscription(remote.user.subscription), payments, classes, classTotals, teachers, students, assignedTeacher, surveys, notes, progress };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick, remote, remoteUsers]);

  if (!data) {
    return (
      <div className="text-sm text-brand-ink/70">
        <Link to="/admin/users" className="underline">← Volver</Link>
        <p className="mt-4">{loading ? "Cargando usuario…" : "Usuario no encontrado."}</p>
      </div>
    );
  }

  const {
    user,
    isStudent,
    isTeacher,
    sub,
    payments,
    classes,
    classTotals,
    teachers,
    students,
    assignedTeacher,
    surveys,
    notes,
    progress,
  } = data;

  const isDisabled = !!user.disabledAt;
  const isDeleted = !!user.deletedAt;

  function bump() {
    setTick((t) => t + 1);
  }

  async function onAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    try {
      await adminApi.assignTeacher(user.id, e.target.value || null);
      bump();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  /**
   * Entrar a la plataforma como otro usuario.
   *
   * Antes esto pedía confirmación con `confirm()` del navegador, que bloquea
   * el render entero mientras está abierto y que Chrome suprime en varias
   * situaciones — cuando lo suprime devuelve `false` y el botón se quedaba
   * sin hacer absolutamente nada, sin aviso. El resto de la pantalla ya
   * confirmaba con Dialog propio; esto era lo único que faltaba.
   *
   * Y hay que VACIAR la caché de react-query al cambiar de identidad: se
   * cambia el token pero los datos cacheados siguen siendo los del admin,
   * incluido `["me"]` — que es justo lo que mira la barra amarilla para
   * saber si mostrar el botón de salir. Con la caché sucia se entraba a la
   * otra cuenta sin forma visible de volver.
   */
  async function onImpersonate() {
    if (!me || entrando) return;
    setEntrando(true);
    try {
      const r = await adminApi.impersonate(user.id);
      setAccessToken(r.accessToken);
      qc.clear();
      await refresh();
      setVerComoOpen(false);
      router.navigate({ to: homePathFor(user.roles), replace: true });
    } catch (err) {
      // Sin esto, un 429 o un 403 dejaban una promesa rechazada en la consola
      // y cero señales en pantalla: el botón "no hacía nada".
      toast.error(`No se pudo entrar como ${user.fullName}: ${(err as Error).message}`);
    } finally {
      setEntrando(false);
    }
  }

  async function onToggleActive() {
    try {
      await adminApi.setUserStatus(user.id, !user.disabledAt);
      toast.success(user.disabledAt ? "Ban retirado — la cuenta vuelve a tener acceso." : "Usuario baneado — pierde todo acceso de inmediato.");
      setBanConfirmOpen(false);
      bump();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onSetClassStatus(
    classId: string,
    status: "validated" | "no_show" | "scheduled" | "cancelled" | "pending_reschedule",
  ) {
    try {
      await classesApi.adminSetStatus(classId, status);
      toast.success("Estado de la clase actualizado (nómina ajustada).");
      bump();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onRequestNps() {
    try {
      await adminApi.requestNps(user.id);
      toast.success("Encuesta solicitada: le llegará el correo y la verá al entrar a la plataforma.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onResetPassword() {
    try {
      const r = await adminApi.resetPassword(user.id);
      setResetInfo({ link: r.link ?? null });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onResetNps() {
    if (!confirm(`¿Reiniciar la encuesta NPS de ${user.fullName}? La verá de nuevo cuando corresponda.`)) return;
    await adminApi.resetNps(user.id);
    bump();
  }

  const TABS: { id: TabId; label: string; show: boolean }[] = [
    { id: "overview", label: "Resumen", show: true },
    { id: "subscription", label: "Suscripción", show: isStudent },
    { id: "schedule", label: "Horario", show: isStudent },
    { id: "payments", label: "Pagos", show: isStudent },
    { id: "classes", label: "Clases", show: true },
    { id: "learning", label: "Aprendizaje", show: isStudent },
    { id: "reports", label: "Reportes", show: isStudent },
    { id: "nps", label: "Encuestas (NPS)", show: isStudent },
    { id: "notes", label: "Notas del profe", show: isStudent },
    { id: "students", label: `Estudiantes (${students.length})`, show: isTeacher },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-brand-ink/70 hover:text-brand-ink"
      >
        <ArrowLeft className="size-4" /> Volver al CRM
      </Link>

      <header className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-brand-ink">{user.fullName}</h1>
            {isDeleted ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                Eliminado
              </span>
            ) : isDisabled ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Desactivado
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Activo
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-ink/65">
            <span className="inline-flex items-center gap-1">
              <Mail className="size-3.5" /> {user.email}
            </span>
            {user.roles.map((r) => (
              <span
                key={r}
                className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-ink"
              >
                {r}
              </span>
            ))}
            {user.level ? (
              <span className="capitalize text-brand-ink/55">Nivel: {user.level}</span>
            ) : null}
            {user.phone ? <span className="text-brand-ink/55">Tel: {user.phone}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-ink/80 transition hover:-translate-y-0.5 hover:bg-brand-cream/30"
          >
            <Pencil className="size-3.5" /> Editar
          </button>
          <button
            onClick={onResetPassword}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-ink/80 transition hover:-translate-y-0.5 hover:bg-brand-cream/30"
          >
            <KeyRound className="size-3.5" /> Resetear clave
          </button>
          <button
            onClick={() => (isDisabled ? void onToggleActive() : setBanConfirmOpen(true))}
            disabled={isDeleted}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-ink/80 transition hover:-translate-y-0.5 hover:bg-brand-cream/30 disabled:opacity-50"
          >
            <Power className="size-3.5" /> {isDisabled ? "Quitar ban" : "Banear"}
          </button>
          {user.id !== me?.id ? (
            <button
              onClick={() => setVerComoOpen(true)}
              disabled={isDeleted || isDisabled || entrando}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              <Eye className="size-3.5" /> Ver como este usuario
            </button>
          ) : null}
        </div>
      </header>

      {/* Confirmación de "ver como" — misma UI propia que el resto. */}
      <Dialog open={verComoOpen} onOpenChange={(o) => { if (!entrando) setVerComoOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Entrar como {user.fullName}?</DialogTitle>
            <DialogDescription>
              Vas a ver la plataforma con su cuenta y sus permisos durante una
              hora. Lo que hagas queda registrado a su nombre. Para volver a tu
              sesión, usa el botón de la barra amarilla de arriba.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setVerComoOpen(false)}
              disabled={entrando}
              className="rounded-full border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => void onImpersonate()}
              disabled={entrando}
              className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink/90 disabled:opacity-60"
            >
              {entrando ? "Entrando…" : "Sí, entrar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de ban con UI propia (nada de window.confirm). */}
      <Dialog open={banConfirmOpen} onOpenChange={setBanConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Banear a {user.fullName}?</DialogTitle>
            <DialogDescription>
              Pierde acceso inmediato a toda la plataforma (web y API) y no
              podrá iniciar sesión. Puedes quitarle el ban cuando quieras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setBanConfirmOpen(false)}
              className="rounded-full border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-ink"
            >
              Cancelar
            </button>
            <button
              onClick={() => void onToggleActive()}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Sí, banear
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resultado del reset de clave: correo enviado + link visible. */}
      <Dialog open={!!resetInfo} onOpenChange={(o) => { if (!o) { setResetInfo(null); setLinkCopied(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperación de contraseña</DialogTitle>
            <DialogDescription>
              {resetInfo?.link
                ? "Le enviamos el correo de recuperación. Si lo necesitas, este es el link directo:"
                : "Le enviamos el correo de recuperación a su email."}
            </DialogDescription>
          </DialogHeader>
          {resetInfo?.link ? (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={resetInfo.link}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-xl border border-brand-line bg-brand-cream/30 px-3 py-2 text-xs text-brand-ink"
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resetInfo.link!);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  } catch {
                    toast.error("No se pudo copiar");
                  }
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-ink px-3 py-2 text-xs font-semibold text-white"
              >
                {linkCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {linkCopied ? "Copiado" : "Copiar"}
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <nav className="flex flex-wrap gap-2 border-b border-brand-line">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? "border-brand-ink text-brand-ink"
                : "border-transparent text-brand-ink/60 hover:text-brand-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Identidad">
            <dl className="space-y-1 text-sm text-brand-ink/75">
              <Row k="Nombre">{user.fullName}</Row>
              <Row k="Email">{user.email}</Row>
              <Row k="Teléfono">{user.phone ?? "—"}</Row>
              <Row k="Nivel">{user.level ?? "—"}</Row>
              <Row k="Creado">{new Date(user.createdAt).toLocaleDateString("es-CO")}</Row>
              <Row k="Último login">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-CO") : "—"}
              </Row>
            </dl>
          </Card>
          {isStudent ? (
            <Card title="Profesor asignado">
              <p className="text-xs text-brand-ink/60">
                Determina quién recibe las clases recurrentes.
              </p>
              <select
                value={user.assignedTeacherId ?? ""}
                onChange={onAssign}
                disabled={isDeleted}
                className="mt-3 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none disabled:opacity-50"
              >
                <option value="">— Sin asignar —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
              {assignedTeacher ? (
                <p className="mt-2 text-xs text-brand-ink/55">Actual: {assignedTeacher.fullName}</p>
              ) : null}
            </Card>
          ) : null}
          <Card title="Actividad">
            <dl className="space-y-1 text-sm text-brand-ink/75">
              <Row k="Clases totales">{classes.length}</Row>
              <Row k="Completadas">
                {classes.filter((c: ClassSession) => c.status === "completed").length}
              </Row>
              <Row k="Próximas">
                {classes.filter((c: ClassSession) => c.status === "scheduled").length}
              </Row>
              {isStudent ? (
                <>
                  <Row k="Pagos">{payments.length}</Row>
                  <Row k="NPS respondidos">{surveys.length}</Row>
                </>
              ) : null}
            </dl>
          </Card>
        </div>
      ) : null}

      {tab === "subscription" && isStudent ? (
        <>
          <Card title="Suscripción">
            {sub ? (
              <dl className="grid gap-1 text-sm text-brand-ink/75 md:grid-cols-2">
                <Row k="Plan">{getPlan(sub.planId)?.name ?? sub.planId}</Row>
                <Row k="Estado">{sub.status.replace("_", " ")}</Row>
                <Row k="Inicio">
                  {sub.startedAt ? new Date(sub.startedAt).toLocaleDateString("es-CO") : "—"}
                </Row>
                <Row k="Activa hasta">
                  {sub.currentPeriodEnd ? (
                    new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")
                  ) : sub.status === "active" ? (
                    // El mes no arranca hasta que tenga profesor asignado.
                    <span className="text-amber-700 dark:text-amber-300">
                      En espera de profesor — el mes aún no empieza a correr
                    </span>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row k="Ref. Wompi">{sub.wompiReference ?? "—"}</Row>
              </dl>
            ) : (
              <p className="text-sm text-brand-ink/55">
                Sin suscripción. Actívala manualmente abajo (pagos por fuera de
                Wompi) o espera un pago Wompi aprobado.
              </p>
            )}
          </Card>
          {sub ? <PauseControls userId={user.id} sub={sub} onSaved={bump} /> : null}
          <SubscriptionEditor userId={user.id} sub={sub} onSaved={bump} />
        </>
      ) : null}

      {tab === "schedule" && isStudent ? <ScheduleEditor userId={user.id} onSaved={bump} /> : null}

      {tab === "payments" && isStudent ? (
        <Card title={`Historial de pagos (${payments.length})`}>
          {payments.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Aún no hay intentos de pago registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-brand-ink/55">
                  <tr>
                    <th className="py-2">Fecha</th>
                    <th>Plan</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-line">
                  {payments
                    .slice()
                    .sort(
                      (a: PaymentIntent, b: PaymentIntent) =>
                        new Date(b.createdAt ?? 0).getTime() -
                        new Date(a.createdAt ?? 0).getTime(),
                    )
                    .map((p: PaymentIntent) => (
                      <tr key={p.reference}>
                        <td className="py-2 text-brand-ink/70">
                          {p.createdAt
                            ? new Date(p.createdAt).toLocaleDateString("es-CO")
                            : "—"}
                        </td>
                        <td className="text-brand-ink/80">{getPlan(p.planId)?.name ?? p.planId}</td>
                        <td className="text-brand-ink/80">{formatCop(p.amountCop)}</td>
                        <td>
                          <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold">
                            {p.status}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-brand-ink/55">{p.reference}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "classes" ? (
        <Card title={isTeacher ? "Clases de sus estudiantes" : "Clases"}>
          {/* Totales reales (todas las clases, no solo las listadas) */}
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["validated", "Tomadas", "bg-emerald-50 text-emerald-700 border-emerald-200"],
              ["no_show", "No tomadas", "bg-orange-50 text-orange-700 border-orange-200"],
              ["scheduled", "Programadas", "bg-brand-cream/60 text-brand-ink/70 border-brand-line"],
              ["rescheduled", "Reprogramadas", "bg-yellow-50 text-yellow-700 border-yellow-200"],
              ["cancelled", "Canceladas", "bg-red-50 text-red-700 border-red-200"],
            ].map(([key, label, cls]) => (
              <span key={key} className={`rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
                {label}: {classTotals?.[key] ?? 0}
              </span>
            ))}
          </div>
          <p className="mb-3 text-xs text-brand-ink/50">
            Tomada y No tomada cuentan para la nómina del profesor. Cambiar el estado
            aquí ajusta la nómina del período correspondiente.
          </p>
          {classes.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Sin clases registradas.</p>
          ) : (
            <ul className="divide-y divide-brand-line">
              {classes
                .slice()
                .sort(
                  (a: ClassSession, b: ClassSession) =>
                    new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
                )
                .slice(0, 30)
                .map((c: ClassSession) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <div className="font-medium text-brand-ink">{c.topic ?? "Clase"}</div>
                      <div className="text-xs text-brand-ink/55">
                        {new Date(c.startsAt).toLocaleString("es-CO")} • {c.durationMin} min
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Cambiar fecha desde el admin: es la única salida cuando
                          una clase quedó en un día que el calendario del profe
                          no muestra (fin de semana) o cuando hay que arreglar
                          una reprogramación mal digitada. */}
                      <ClassDateEditor
                        session={c}
                        onMoved={() => { bump(); toast.success("Clase movida"); }}
                      />
                      {/* Ajuste manual: se refleja en nómina y métricas */}
                      <select
                        value={c.status}
                        onChange={(e) => void onSetClassStatus(c.id, e.target.value as any)}
                        className="rounded-full border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold capitalize text-brand-ink"
                      >
                        <option value="scheduled">Programada</option>
                        <option value="validated">Tomada</option>
                        <option value="no_show">No tomada</option>
                        <option value="rescheduled" disabled>Reprogramada</option>
                        {/* Congelada: sale de nómina y de métricas hasta que se
                            le ponga fecha nueva. */}
                        <option value="pending_reschedule">Por reprogramar</option>
                        <option value="cancelled">Cancelada</option>
                      </select>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "learning" && isStudent ? (
        <>
          <Card title={`Lecciones completadas (${progress.length})`}>
            {progress.length === 0 ? (
              <p className="text-sm text-brand-ink/55">El estudiante no ha completado lecciones.</p>
            ) : (
              <ul className="grid gap-1 text-sm md:grid-cols-2">
                {progress.map((p: { lessonId: string; completedAt: string }) => (
                  <li key={p.lessonId} className="text-brand-ink/70">
                    <span className="font-mono text-xs text-brand-ink/40">{p.lessonId}</span>{" "}
                    <span className="text-brand-ink/55">
                      — {new Date(p.completedAt).toLocaleDateString("es-CO")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {/* Respuestas y resultados de actividades interactivas (todas, admin) */}
          <div className="mt-4">
            <ActivityResultsSection studentId={user.id} />
          </div>
          <div className="mt-4">
            <LessonPlanSection studentId={user.id} />
          </div>
          <div className="mt-4">
            <CheckpointGatesSection studentId={user.id} />
          </div>
          <div className="mt-4">
            <CheckpointAttemptsSection studentId={user.id} />
          </div>
          {/* El material que su profe le dejó: el admin lo ve y también puede
              agregar o quitar, igual que en el portal del profesor. */}
          <div className="mt-4">
            <StudentResourcesSection studentId={user.id} />
          </div>
        </>
      ) : null}

      {tab === "reports" && isStudent ? (
        <StudentReportsSection studentId={user.id} />
      ) : null}

      {tab === "nps" && isStudent ? (
        <Card title={`Encuestas de satisfacción (${surveys.length})`}>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-brand-ink/55">
              Estas respuestas son privadas. El profesor no las puede ver.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onRequestNps}
                className="rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
              >
                Solicitar encuesta ahora
              </button>
              <button
                type="button"
                onClick={onResetNps}
                className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink/75 transition hover:-translate-y-0.5 hover:bg-brand-cream/40"
              >
                Reiniciar encuesta
              </button>
            </div>
          </div>
          {surveys.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Aún no ha respondido encuestas.</p>
          ) : (
            <ul className="space-y-3">
              {surveys
                .slice()
                .sort(
                  (a: SatisfactionSurvey, b: SatisfactionSurvey) =>
                    new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
                )
                .map((s: SatisfactionSurvey) => (
                  <li key={s.id} className="rounded-xl bg-brand-cream/40 p-3 text-sm">
                    <div className="flex justify-between text-xs text-brand-ink/55">
                      <span>{new Date(s.submittedAt).toLocaleDateString("es-CO")}</span>
                      <span>NPS {s.nps}/10</span>
                    </div>
                    <dl className="mt-2 grid gap-1 text-xs md:grid-cols-2">
                      <Row k="Profesor">{s.teacherScore ?? "—"}/5</Row>
                      <Row k="Contenido">{s.contentScore ?? "—"}/5</Row>
                      <Row k="Plataforma">{s.platformScore ?? "—"}/5</Row>
                    </dl>
                    {s.comment ? (
                      <p className="mt-2 italic text-brand-ink/75">"{s.comment}"</p>
                    ) : null}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "notes" && isStudent ? (
        <Card title={`Notas del profesor (${notes.length})`}>
          {notes.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Sin feedback registrado todavía.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n: import("@/lib/domain/types").ClassNote) => (
                <li key={n.id} className="rounded-xl bg-brand-cream/40 p-3 text-sm">
                  <div className="flex justify-between text-xs text-brand-ink/55">
                    <span>{new Date(n.createdAt).toLocaleDateString("es-CO")}</span>
                    <span>{n.rating ? `Rating ${n.rating}/5` : ""}</span>
                  </div>
                  <p className="mt-1 text-brand-ink/80">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "students" && isTeacher ? (
        <Card title={`Estudiantes asignados (${students.length})`}>
          {students.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Aún no tiene estudiantes asignados.</p>
          ) : (
            <ul className="divide-y divide-brand-line">
              {students.map((s: User) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <Link
                    to="/admin/users/$id"
                    params={{ id: s.id }}
                    className="font-medium text-brand-ink hover:underline"
                  >
                    {s.fullName}
                  </Link>
                  <span className="text-xs text-brand-ink/55">{s.email}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {editing ? (
        <EditUserDialog
          user={user}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            bump();
            // Si el admin se editó a sí mismo, hay que recargar SU sesión: el
            // sidebar y los guards salen de `user.roles`, así que sin esto
            // seguiría viendo los módulos del rol que acaba de quitarse.
            if (me?.id === user.id) void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-brand-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-ink/55">{k}</dt>
      <dd className="text-right text-brand-ink/85">{children}</dd>
    </div>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [level, setLevel] = useState<EnglishLevel>(user.level ?? "beginner");
  const [roles, setRoles] = useState<AppRole[]>(user.roles);
  const [durationMin, setDurationMin] = useState<string>(
    user.classDurationMin ? String(user.classDurationMin) : "",
  );
  const [error, setError] = useState<string | null>(null);

  function toggleRole(r: AppRole) {
    setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      // El primero por precedencia es el rol PRINCIPAL (define a dónde entra
      // al loguearse); el resto van como extras. Así un admin puede además
      // dar clases sin necesitar una segunda cuenta.
      const principal = (["admin", "teacher", "student"] as const).find((r) => roles.includes(r)) ?? "student";
      await adminApi.updateUser(user.id, {
        fullName,
        phone: phone || undefined,
        role: principal,
        // "moderator" es legacy del tipo del cliente y no existe en el backend.
        extraRoles: (["admin", "teacher", "student"] as const).filter(
          (r) => r !== principal && roles.includes(r),
        ),
        englishLevel: roles.includes("student") ? level : null,
        // Vacío = volver al estándar de 50 min (null en la base).
        classDurationMin: roles.includes("student")
          ? durationMin.trim() === ""
            ? null
            : Number(durationMin)
          : undefined,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-brand-ink">Editar usuario</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Nombre completo">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            />
          </Field>
          <Field label="Teléfono">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            />
          </Field>
          <Field label="Roles">
            <div className="flex flex-wrap gap-2">
              {(["student", "teacher", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRole(r)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${
                    roles.includes(r)
                      ? "border-brand-ink bg-brand-ink text-white"
                      : "border-brand-line text-brand-ink/70"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>
          {roles.includes("student") ? (
            <>
              <Field label="Nivel">
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as EnglishLevel)}
                  className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </Field>
              <Field label="Duración de clase (min)">
                <input
                  type="number"
                  min={25}
                  max={180}
                  step={5}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  placeholder="50 (estándar)"
                  className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-brand-ink/50">
                  Vacío = 50 min. Aplica a las clases futuras ya programadas y a las nuevas.
                  Una clase larga puede ocupar la hora siguiente del profe: revisa su agenda.
                </p>
              </Field>
            </>
          ) : null}
        </div>
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
            className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Edición manual de la suscripción (empalme de estudiantes que pagan por
 * fuera de Wompi, extensiones, cortesías). El admin puede cambiar plan,
 * estado y fecha de vencimiento en cualquier momento.
 */
/**
 * Editor del horario semanal de un estudiante ya creado.
 *
 * Antes el horario solo se podía fijar al darlo de alta: para moverle una
 * franja o pasarlo de 2 a 3 días había que borrarlo y volverlo a crear, y el
 * admin ni siquiera puede borrar. Subir el plan por su cuenta tampoco servía,
 * porque las clases seguían siendo las del horario viejo.
 *
 * Al guardar, el backend rehace las clases futuras: quita las que ya no
 * corresponden y crea las que faltan, sin tocar las pasadas ni las validadas.
 */
function ScheduleEditor({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["schedule", "config"], queryFn: () => scheduleApi.config() });
  const schQ = useQuery({
    queryKey: ["admin", "student-schedule", userId],
    queryFn: () => scheduleApi.adminStudentSchedule(userId),
  });

  const [selected, setSelected] = useState<SlotRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Arranca desde lo guardado; a partir del primer clic manda la selección local.
  const actual = schQ.data?.blocks ?? [];
  const sel = selected ?? actual;
  const need = schQ.data?.daysPerWeek ?? 0;
  const dirty =
    selected !== null &&
    JSON.stringify([...sel].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour)) !==
      JSON.stringify([...actual].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour));

  const saveM = useMutation({
    mutationFn: () => scheduleApi.adminSetStudentSchedule(userId, sel),
    onSuccess: (r) => {
      setError(null);
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["admin", "student-schedule", userId] });
      qc.invalidateQueries({ queryKey: ["admin", "schedule", "audit"] });
      toast.success(
        `Horario actualizado. ${r.creadas} clase(s) creada(s), ${r.eliminadas} eliminada(s).`,
      );
      onSaved();
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "No se pudo guardar el horario"),
  });

  if (cfgQ.isLoading || schQ.isLoading) {
    return (
      <Card title="Horario semanal">
        <p className="text-sm text-brand-ink/55">Cargando…</p>
      </Card>
    );
  }
  if (!cfgQ.data || !schQ.data) {
    return (
      <Card title="Horario semanal">
        <p className="text-sm text-brand-ink/55">No se pudo cargar.</p>
      </Card>
    );
  }
  if (need === 0) {
    return (
      <Card title="Horario semanal">
        <p className="text-sm text-brand-ink/55">
          El estudiante no tiene plan. Asígnale uno en la pestaña Suscripción antes de fijar su
          horario.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Horario semanal">
      <p className="mb-3 text-sm text-brand-ink/65">
        Plan <b>{schQ.data.planName ?? "—"}</b> · {need} clase(s) por semana de{" "}
        <b>{schQ.data.durationMin} min</b>. Al guardar se rehacen las clases futuras: se quitan las
        que ya no corresponden y se crean las que falten. Las clases pasadas y las validadas no se
        tocan.
      </p>

      <SchedulePickerGrid
        cfg={cfgQ.data}
        need={need}
        selected={sel}
        onChange={(next) => {
          setSelected(next);
          setError(null);
        }}
      />

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => saveM.mutate()}
          disabled={!dirty || sel.length !== need || saveM.isPending}
          className="inline-flex h-10 items-center rounded-full bg-brand-ink px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          {saveM.isPending ? "Guardando…" : "Guardar horario"}
        </button>
        {dirty ? (
          <button
            onClick={() => {
              setSelected(null);
              setError(null);
            }}
            className="text-sm text-brand-ink/60 hover:text-brand-ink"
          >
            Descartar
          </button>
        ) : null}
        <span className="text-xs text-brand-ink/55">
          {sel.length}/{need} franjas seleccionadas
        </span>
      </div>
    </Card>
  );
}

function SubscriptionEditor({
  userId,
  sub,
  onSaved,
}: {
  userId: string;
  sub: Subscription | null;
  onSaved: () => void;
}) {
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [planId, setPlanId] = useState<string>(sub?.planId ?? "");
  const [status, setStatus] = useState<string>(sub?.status ?? "active");
  const [endDate, setEndDate] = useState<string>(
    sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString().slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    adminApi
      .plans()
      .then((p: any[]) => setPlans(p ?? []))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    setPlanId(sub?.planId ?? "");
    setStatus(sub?.status ?? "active");
    setEndDate(sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString().slice(0, 10) : "");
  }, [sub?.planId, sub?.status, sub?.currentPeriodEnd]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      await adminApi.setSubscription(userId, {
        planId,
        status: status as any,
        currentPeriodEnd: endDate || null,
      });
      setOk(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={sub ? "Modificar suscripción (manual)" : "Activar plan manualmente"}>
      <p className="mb-4 text-xs text-brand-ink/55">
        Para estudiantes que pagan por fuera de Wompi: define el plan y hasta qué
        fecha queda activo. Un pago Wompi posterior extiende desde esa fecha.
      </p>
      <form onSubmit={onSave} className="grid gap-4 md:grid-cols-3">
        <Field label="Plan">
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            required
            className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          >
            <option value="" disabled>
              Selecciona…
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          >
            <option value="active">Activa</option>
            <option value="pending">Pendiente</option>
            <option value="past_due">En mora</option>
            <option value="canceled">Cancelada</option>
            <option value="expired">Vencida</option>
            {/* Se congela desde el bloque de arriba, que además libera la
                franja y quita las clases; aquí solo se muestra el estado. */}
            <option value="paused" disabled>
              Congelada
            </option>
          </select>
        </Field>
        <Field label="Activa hasta">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
        </Field>
        <div className="md:col-span-3 flex items-center justify-end gap-3">
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          {ok ? <p className="text-xs text-green-700">Suscripción guardada ✓</p> : null}
          <button
            type="submit"
            disabled={saving || !planId}
            className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {saving ? "Guardando…" : sub ? "Guardar cambios" : "Activar plan"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-brand-ink/70">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

// ─── Adapters backend → shape del dominio ─────────────────────────────

function adaptAdminUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl ?? undefined,
    phone: u.phone ?? undefined,
    // Rol principal + extras. Antes se ignoraban los extras y el editor
    // mostraba "teacher" SIN marcar en un admin que sí lo tenía: parecía que
    // ya estaba quitado, no había nada que desmarcar y el rol seguía vivo en
    // la base. Los listados de profesores tenían el mismo agujero.
    roles: rolesOfRow(u),
    level: (u.englishLevel ?? undefined) as EnglishLevel | undefined,
    classDurationMin: u.classDurationMin ?? undefined,
    onboardedAt: u.onboardedAt ?? undefined,
    assignedTeacherId: u.assignedTeacherId ?? undefined,
    disabledAt: u.disabledAt ?? undefined,
    deletedAt: u.deletedAt ?? undefined,
    lastLoginAt: u.lastLoginAt ?? undefined,
    createdAt: u.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Cambia la fecha de una clase desde el admin.
 *
 * El profesor solo puede mover clases desde su calendario, y ese calendario
 * oculta sábado y domingo: una clase que cayera ahí (por un error al digitar
 * la fecha, por ejemplo) quedaba inalcanzable. Ahora el sistema ya no deja
 * mandarlas al fin de semana, y esto es la salida para las que ya quedaron.
 */
function ClassDateEditor({ session, onMoved }: { session: ClassSession; onMoved: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(() => toDatetimeLocal(session.startsAt));
  const [busy, setBusy] = useState(false);

  async function mover() {
    setBusy(true);
    try {
      const inicio = new Date(valor);
      if (Number.isNaN(inicio.getTime())) throw new Error("Fecha inválida");
      const fin = new Date(inicio.getTime() + (session.durationMin || 50) * 60_000);
      await classesApi.reschedule(session.id, inicio.toISOString(), fin.toISOString());
      setAbierto(false);
      onMoved();
    } catch (err) {
      toast.error((err as Error).message ?? "No se pudo mover la clase");
    } finally {
      setBusy(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => { setValor(toDatetimeLocal(session.startsAt)); setAbierto(true); }}
        className="rounded-full border border-brand-line bg-white px-2.5 py-1 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
      >
        Cambiar fecha
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input
        type="datetime-local"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="rounded-xl border border-brand-line bg-white px-2 py-1 text-xs focus:border-brand-ink focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void mover()}
        disabled={busy}
        className="rounded-full bg-brand-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
      >
        {busy ? "…" : "Mover"}
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="rounded-full border border-brand-line px-2.5 py-1 text-xs text-brand-ink/70 hover:bg-brand-cream/40"
      >
        Cancelar
      </button>
    </span>
  );
}

/** ISO → valor para <input type="datetime-local"> en hora local. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * Congelar / reanudar el plan.
 *
 * Congelar es lo que resuelve el caso de "el estudiante pausó y el sistema le
 * sigue marcando las clases como tomadas": borra sus clases futuras, libera su
 * franja para otro estudiante y saca la suscripción de la generación semanal.
 * La fecha de vencimiento NO se corre sola — al reanudar se muestran los días
 * pausados para que el admin la ajuste abajo con criterio.
 */
function PauseControls({
  userId,
  sub,
  onSaved,
}: {
  userId: string;
  sub: Subscription;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const pausada = sub.status === "paused";

  async function pausar() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await adminApi.pauseSubscription(userId, reason.trim() || undefined);
      setInfo(
        `Plan congelado. Se quitaron ${r.classesRemoved} clase(s) futura(s) y se liberaron ${r.slotsFreed} franja(s) del profesor.`,
      );
      setReason("");
      onSaved();
    } catch (err) {
      setError((err as Error).message ?? "No se pudo congelar");
    } finally {
      setBusy(false);
    }
  }

  async function reanudar() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await adminApi.resumeSubscription(userId);
      setInfo(
        `Plan reanudado tras ${r.daysPaused} día(s) pausado. Se recuperaron ${r.slotsRestored} franja(s). ` +
          `Si corresponde, corre la fecha de "Activa hasta" ${r.daysPaused} día(s) abajo.`,
      );
      onSaved();
    } catch (err) {
      setError((err as Error).message ?? "No se pudo reanudar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={pausada ? "Plan congelado" : "Congelar plan"}>
      {pausada ? (
        <p className="mb-4 text-xs text-brand-ink/60">
          Congelado el{" "}
          {sub.pausedAt ? new Date(sub.pausedAt).toLocaleDateString("es-CO") : "—"}
          {sub.pauseReason ? ` · ${sub.pauseReason}` : ""}. No se le generan clases y su franja
          quedó libre. Al reanudar puede que haya que asignarle horario nuevo si otro estudiante
          la tomó.
        </p>
      ) : (
        <p className="mb-4 text-xs text-brand-ink/60">
          Para estudiantes que pausan sin fecha de regreso. Quita sus clases futuras del calendario
          y de la agenda del profesor, libera su franja y evita que el sistema se las dé por
          tomadas. El plan no se pierde.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {!pausada ? (
          <Field label="Motivo (opcional)">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Viaje, incapacidad…"
              className="w-full rounded-xl border border-brand-line px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            />
          </Field>
        ) : null}
        <button
          type="button"
          onClick={pausada ? reanudar : pausar}
          disabled={busy}
          className={`rounded-full px-5 py-2 text-sm font-semibold shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60 ${
            pausada ? "bg-brand-ink text-white" : "border border-sky-300 bg-sky-50 text-sky-900"
          }`}
        >
          {busy ? "Procesando…" : pausada ? "Reanudar plan" : "Congelar plan"}
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
      {info ? <p className="mt-3 text-xs text-green-700">{info}</p> : null}
    </Card>
  );
}

function adaptAdminSubscription(s: any): Subscription | null {
  if (!s) return null;
  return {
    id: s.id,
    userId: s.userId,
    planId: (s.plan?.id ?? s.planId) as Subscription["planId"],
    status: (s.status ?? "pending") as Subscription["status"],
    startedAt: s.startedAt ?? undefined,
    currentPeriodEnd: s.currentPeriodEnd ?? undefined,
    wompiReference: s.wompiReference ?? undefined,
    pausedAt: s.pausedAt ?? null,
    pauseReason: s.pauseReason ?? null,
  };
}

function adaptAdminClass(c: any): ClassSession {
  return {
    id: c.id,
    studentId: c.studentId,
    teacherId: c.teacherId,
    teacherName: c.teacher?.fullName ?? "",
    startsAt: c.startsAt ?? c.scheduledAt ?? new Date().toISOString(),
    // Duración real endsAt − startsAt (hay estudiantes con clases de más de 50).
    durationMin:
      c.endsAt && c.startsAt
        ? Math.max(1, Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60_000))
        : (c.durationMin ?? 50),
    status: (c.status ?? "scheduled") as ClassSession["status"],
    studentConfirmedAt: c.studentConfirmedAt ?? undefined,
    teacherValidatedAt: c.teacherValidatedAt ?? undefined,
    topic: c.topic ?? undefined,
    meetingUrl: c.meetingUrl ?? undefined,
  };
}

function adaptAdminPayment(p: any): PaymentIntent {
  const created = p.createdAt ?? new Date().toISOString();
  return {
    id: p.id,
    userId: p.userId ?? "",
    planId: p.planId,
    reference: p.reference,
    amountCop: Math.round((p.amountInCents ?? 0) / 100),
    customer: {
      fullName: p.customerName ?? "",
      email: p.customerEmail ?? "",
      phone: p.customerPhone ?? undefined,
      document: p.customerDocument ?? undefined,
    },
    status: (p.status ?? "PENDING") as PaymentIntent["status"],
    createdAt: created,
    updatedAt: p.updatedAt ?? p.approvedAt ?? created,
  };
}

function adaptAdminSurvey(s: any): SatisfactionSurvey {
  return {
    id: s.id,
    userId: s.userId,
    monthKey: s.monthKey ?? (s.createdAt ?? "").slice(0, 7),
    nps: s.nps ?? s.score ?? 0,
    teacherScore: s.teacherScore ?? undefined,
    contentScore: s.contentScore ?? undefined,
    platformScore: s.platformScore ?? undefined,
    comment: s.comment ?? undefined,
    submittedAt: s.submittedAt ?? s.createdAt ?? new Date().toISOString(),
  };
}

function adaptAdminNote(n: any): import("@/lib/domain/types").ClassNote {
  return {
    id: n.id,
    classId: n.classId ?? undefined,
    studentId: n.studentId,
    teacherId: n.teacherId,
    // El backend guarda el texto en `notes` (ClassNote.notes); `body` es el
    // shape del dominio del storefront.
    body: n.notes ?? n.body ?? "",
    rating: n.rating ?? undefined,
    createdAt: n.createdAt ?? new Date().toISOString(),
  };
}
import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Eye,
  Mail,
  Pencil,
  Power,
  Trash2,
  KeyRound,
} from "lucide-react";
import { readDb } from "@/lib/domain/repository";
import type {
  ClassSession,
  SatisfactionSurvey,
  Subscription,
  User,
  EnglishLevel,
  AppRole,
} from "@/lib/domain/types";
import { getPlan, formatCop } from "@/lib/domain/plans";
import type { PaymentIntent } from "@/lib/domain/subscriptions";
import { adminApi } from "@/lib/api/endpoints";
import { setAccessToken } from "@/lib/api/client";
import { hydrateFromBackend } from "@/lib/api/bootstrap";
import { startImpersonation } from "@/lib/domain/admin-actions";
import { listNotesForStudent } from "@/lib/domain/classes";
import { listProgress } from "@/lib/domain/learning";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  head: () => ({ meta: [{ title: "Perfil de usuario — Admin" }] }),
  component: AdminUserDetail,
});

type TabId = "overview" | "subscription" | "payments" | "classes" | "learning" | "nps" | "notes" | "students";

function AdminUserDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { user: me, refresh } = useAuth();
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
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
      return { user, isStudent, isTeacher, sub: adaptAdminSubscription(remote.user.subscription), payments, classes, teachers, students, assignedTeacher, surveys, notes, progress };
    }
    const db = readDb();
    const users = db.users as Record<string, User>;
    const user = users[id];
    if (!user) return null;
    const isStudent = user.roles.includes("student");
    const isTeacher = user.roles.includes("teacher");
    const subs = Object.values(db.subscriptions as Record<string, Subscription>);
    const payments = Object.values(db.paymentIntents as Record<string, PaymentIntent>).filter(
      (p) => p.userId === user.id,
    );
    const classes = Object.values(db.classes as Record<string, ClassSession>).filter(
      (c) => c.studentId === user.id || c.teacherId === user.id,
    );
    const teachers = Object.values(users).filter(
      (u) => u.roles.includes("teacher") && !u.deletedAt,
    );
    const students = isTeacher
      ? Object.values(users).filter(
          (u) => u.roles.includes("student") && u.assignedTeacherId === user.id && !u.deletedAt,
        )
      : [];
    const sub = subs.find((s) => s.userId === user.id) ?? null;
    const assignedTeacher = user.assignedTeacherId ? users[user.assignedTeacherId] ?? null : null;
    const surveys = Object.values(
      db.satisfactionSurveys as Record<string, SatisfactionSurvey>,
    ).filter((s) => s.userId === user.id);
    const notes = isStudent ? listNotesForStudent(user.id) : [];
    const progress = isStudent ? listProgress(user.id) : [];
    return {
      user,
      isStudent,
      isTeacher,
      sub,
      payments,
      classes,
      teachers,
      students,
      assignedTeacher,
      surveys,
      notes,
      progress,
    };
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

  async function onImpersonate() {
    if (!me) return;
    if (!confirm(`Vas a navegar como ${user.fullName}. ¿Continuar?`)) return;
    const r = await adminApi.impersonate(user.id);
    setAccessToken(r.accessToken);
    startImpersonation(me.id, user.id);
    await hydrateFromBackend(r.target.role);
    refresh();
    const dest = user.roles.includes("admin")
      ? "/admin"
      : user.roles.includes("teacher")
        ? "/teacher"
        : "/app";
    router.navigate({ to: dest, replace: true });
  }

  async function onToggleActive() {
    try {
      await adminApi.setUserStatus(user.id, !user.disabledAt);
      bump();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function onDelete() {
    if (!confirm(`¿Eliminar a ${user.fullName}? Quedará en soft-delete (recuperable en backend).`)) return;
    await adminApi.softDeleteUser(user.id);
    bump();
  }

  async function onResetPassword() {
    const r = await adminApi.resetPassword(user.id);
    alert(r.link ? `Link de recuperación generado:\n${r.link}` : "Email de recuperación enviado.");
  }

  async function onResetNps() {
    if (!confirm(`¿Reiniciar la encuesta NPS de ${user.fullName}? La verá de nuevo cuando corresponda.`)) return;
    await adminApi.resetNps(user.id);
    bump();
  }

  const TABS: { id: TabId; label: string; show: boolean }[] = [
    { id: "overview", label: "Resumen", show: true },
    { id: "subscription", label: "Suscripción", show: isStudent },
    { id: "payments", label: "Pagos", show: isStudent },
    { id: "classes", label: "Clases", show: true },
    { id: "learning", label: "Aprendizaje", show: isStudent },
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
            onClick={onToggleActive}
            disabled={isDeleted}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-ink/80 transition hover:-translate-y-0.5 hover:bg-brand-cream/30 disabled:opacity-50"
          >
            <Power className="size-3.5" /> {isDisabled ? "Activar" : "Desactivar"}
          </button>
          {user.id !== me?.id ? (
            <button
              onClick={onImpersonate}
              disabled={isDeleted || isDisabled}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              <Eye className="size-3.5" /> Ver como este usuario
            </button>
          ) : null}
          {user.id !== me?.id && !isDeleted ? (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50"
            >
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          ) : null}
        </div>
      </header>

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
                {classes.filter((c) => c.status === "completed").length}
              </Row>
              <Row k="Próximas">
                {classes.filter((c) => c.status === "scheduled").length}
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
        <Card title="Suscripción">
          {sub ? (
            <dl className="grid gap-1 text-sm text-brand-ink/75 md:grid-cols-2">
              <Row k="Plan">{getPlan(sub.planId)?.name ?? sub.planId}</Row>
              <Row k="Estado">{sub.status.replace("_", " ")}</Row>
              <Row k="Inicio">
                {sub.startedAt ? new Date(sub.startedAt).toLocaleDateString("es-CO") : "—"}
              </Row>
              <Row k="Próximo cobro">
                {sub.currentPeriodEnd
                  ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")
                  : "—"}
              </Row>
              <Row k="Ref. Wompi">{sub.wompiReference ?? "—"}</Row>
            </dl>
          ) : (
            <p className="text-sm text-brand-ink/55">
              Sin suscripción. La activación ocurre tras un pago Wompi aprobado.
            </p>
          )}
        </Card>
      ) : null}

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
                      (a, b) =>
                        new Date(b.createdAt ?? 0).getTime() -
                        new Date(a.createdAt ?? 0).getTime(),
                    )
                    .map((p) => (
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
        <Card title={`Clases (${classes.length})`}>
          {classes.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Sin clases registradas.</p>
          ) : (
            <ul className="divide-y divide-brand-line">
              {classes
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
                )
                .slice(0, 30)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium text-brand-ink">{c.topic ?? "Clase"}</div>
                      <div className="text-xs text-brand-ink/55">
                        {new Date(c.startsAt).toLocaleString("es-CO")} • {c.durationMin} min
                      </div>
                    </div>
                    <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold capitalize">
                      {c.status}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "learning" && isStudent ? (
        <Card title={`Lecciones completadas (${progress.length})`}>
          {progress.length === 0 ? (
            <p className="text-sm text-brand-ink/55">El estudiante no ha completado lecciones.</p>
          ) : (
            <ul className="grid gap-1 text-sm md:grid-cols-2">
              {progress.map((p) => (
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
      ) : null}

      {tab === "nps" && isStudent ? (
        <Card title={`Encuestas de satisfacción (${surveys.length})`}>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-brand-ink/55">
              Estas respuestas son privadas. El profesor no las puede ver.
            </p>
            <button
              type="button"
              onClick={onResetNps}
              className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink/75 transition hover:-translate-y-0.5 hover:bg-brand-cream/40"
            >
              Reiniciar encuesta
            </button>
          </div>
          {surveys.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Aún no ha respondido encuestas.</p>
          ) : (
            <ul className="space-y-3">
              {surveys
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
                )
                .map((s) => (
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
              {notes.map((n) => (
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
              {students.map((s) => (
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
  const [error, setError] = useState<string | null>(null);

  function toggleRole(r: AppRole) {
    setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminApi.updateUser(user.id, {
        fullName,
        phone: phone || undefined,
        role: (["admin", "teacher", "student"] as const).find((r) => roles.includes(r)) ?? "student",
        englishLevel: roles.includes("student") ? level : null,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-brand-ink/70">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

// ─── Adapters backend → shape del dominio ─────────────────────────────

function roleToRoles(role: string | undefined): AppRole[] {
  const r = (role ?? "student") as AppRole;
  return [r];
}

function adaptAdminUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl ?? undefined,
    phone: u.phone ?? undefined,
    roles: roleToRoles(u.role),
    level: (u.englishLevel ?? undefined) as EnglishLevel | undefined,
    onboardedAt: u.onboardedAt ?? undefined,
    assignedTeacherId: u.assignedTeacherId ?? undefined,
    disabledAt: u.disabledAt ?? undefined,
    deletedAt: u.deletedAt ?? undefined,
    lastLoginAt: u.lastLoginAt ?? undefined,
    createdAt: u.createdAt ?? new Date().toISOString(),
  };
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
  };
}

function adaptAdminClass(c: any): ClassSession {
  return {
    id: c.id,
    studentId: c.studentId,
    teacherId: c.teacherId,
    teacherName: c.teacher?.fullName ?? "",
    startsAt: c.startsAt ?? c.scheduledAt ?? new Date().toISOString(),
    durationMin: c.durationMin ?? 50,
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
    body: n.body ?? "",
    rating: n.rating ?? undefined,
    createdAt: n.createdAt ?? new Date().toISOString(),
  };
}
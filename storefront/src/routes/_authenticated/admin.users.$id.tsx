import { useMemo, useState } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Eye, Mail, UserCog } from "lucide-react";
import { readDb } from "@/lib/domain/repository";
import type { ClassSession, Subscription, User } from "@/lib/domain/types";
import { getPlan } from "@/lib/domain/plans";
import {
  assignTeacherToStudent,
  startImpersonation,
} from "@/lib/domain/admin-actions";
import { listNotesForStudent } from "@/lib/domain/classes";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  head: () => ({ meta: [{ title: "Perfil de usuario — Admin Freakn'" }] }),
  component: AdminUserDetail,
});

function AdminUserDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { user: me, refresh } = useAuth();
  const [tick, setTick] = useState(0);

  const data = useMemo(() => {
    const db = readDb();
    const users = db.users as Record<string, User>;
    const subs = Object.values(db.subscriptions as Record<string, Subscription>);
    const classes = Object.values(db.classes as Record<string, ClassSession>);
    const user = users[id];
    if (!user) return null;
    const isStudent = user.roles.includes("student");
    const isTeacher = user.roles.includes("teacher");
    const teachers = Object.values(users).filter((u) => u.roles.includes("teacher"));
    const sub = subs.find((s) => s.userId === user.id);
    const userClasses = classes.filter(
      (c) => c.studentId === user.id || c.teacherId === user.id,
    );
    const students = isTeacher
      ? Object.values(users).filter(
          (u) => u.roles.includes("student") && u.assignedTeacherId === user.id,
        )
      : [];
    const notes = isStudent ? listNotesForStudent(user.id) : [];
    const assignedTeacher = user.assignedTeacherId
      ? users[user.assignedTeacherId]
      : null;
    return { user, isStudent, isTeacher, teachers, sub, userClasses, students, notes, assignedTeacher };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);

  if (!data) {
    return (
      <div className="text-sm text-brand-ink/70">
        <Link to="/admin/users" className="underline">← Volver</Link>
        <p className="mt-4">Usuario no encontrado.</p>
      </div>
    );
  }

  const { user, isStudent, isTeacher, teachers, sub, userClasses, students, notes, assignedTeacher } = data;

  function onAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    try {
      assignTeacherToStudent(user.id, value);
      setTick((t) => t + 1);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function onImpersonate() {
    if (!me) return;
    if (!confirm(`Vas a navegar como ${user.fullName}. ¿Continuar?`)) return;
    startImpersonation(me.id, user.id);
    refresh();
    const dest = user.roles.includes("admin")
      ? "/admin"
      : user.roles.includes("teacher")
        ? "/teacher"
        : "/app";
    router.navigate({ to: dest });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-brand-ink/70 hover:text-brand-ink"
      >
        <ArrowLeft className="size-4" /> Volver al CRM
      </Link>

      <header className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-brand-ink">{user.fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-ink/65">
            <span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> {user.email}</span>
            {user.roles.map((r) => (
              <span key={r} className="rounded-full bg-brand-cream px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-ink">{r}</span>
            ))}
            {user.level ? (
              <span className="text-brand-ink/55 capitalize">Nivel: {user.level}</span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          {user.id !== me?.id ? (
            <button
              onClick={onImpersonate}
              className="inline-flex items-center gap-2 rounded-full border border-brand-ink bg-white px-4 py-2 text-xs font-semibold text-brand-ink shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-cream/40"
            >
              <Eye className="size-4" /> Ver como este usuario
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        {/* Suscripción */}
        {isStudent ? (
          <section className="rounded-2xl border border-brand-line bg-white p-5">
            <h2 className="text-sm font-semibold text-brand-ink">Suscripción</h2>
            {sub ? (
              <dl className="mt-3 space-y-1 text-sm text-brand-ink/75">
                <div className="flex justify-between"><dt>Plan</dt><dd className="font-medium">{getPlan(sub.planId)?.name}</dd></div>
                <div className="flex justify-between"><dt>Estado</dt><dd className="font-medium capitalize">{sub.status.replace("_"," ")}</dd></div>
                <div className="flex justify-between"><dt>Próximo cobro</dt><dd>{sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO") : "—"}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-brand-ink/55">Sin suscripción. Para activarla se necesita un pago Wompi.</p>
            )}
          </section>
        ) : null}

        {/* Profesor asignado */}
        {isStudent ? (
          <section className="rounded-2xl border border-brand-line bg-white p-5">
            <h2 className="text-sm font-semibold text-brand-ink">Profesor asignado</h2>
            <p className="mt-2 text-xs text-brand-ink/60">
              Determina quién recibe las clases recurrentes de este estudiante.
            </p>
            <select
              value={user.assignedTeacherId ?? ""}
              onChange={onAssign}
              className="mt-3 w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            >
              <option value="">— Sin asignar —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </select>
            {assignedTeacher ? (
              <p className="mt-2 text-xs text-brand-ink/55">Actual: {assignedTeacher.fullName}</p>
            ) : null}
          </section>
        ) : null}

        {/* Stats */}
        <section className="rounded-2xl border border-brand-line bg-white p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Actividad</h2>
          <dl className="mt-3 space-y-1 text-sm text-brand-ink/75">
            <div className="flex justify-between"><dt>Clases totales</dt><dd>{userClasses.length}</dd></div>
            <div className="flex justify-between"><dt>Completadas</dt><dd>{userClasses.filter(c=>c.status==="completed").length}</dd></div>
            <div className="flex justify-between"><dt>Próximas</dt><dd>{userClasses.filter(c=>c.status==="scheduled").length}</dd></div>
          </dl>
        </section>
      </div>

      {/* Estudiantes del profesor */}
      {isTeacher ? (
        <section className="rounded-2xl border border-brand-line bg-white p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Estudiantes asignados ({students.length})</h2>
          {students.length === 0 ? (
            <p className="mt-2 text-sm text-brand-ink/55">Aún no tiene estudiantes asignados.</p>
          ) : (
            <ul className="mt-3 divide-y divide-brand-line">
              {students.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to="/admin/users/$id" params={{ id: s.id }} className="font-medium text-brand-ink hover:underline">
                    {s.fullName}
                  </Link>
                  <span className="text-xs text-brand-ink/55">{s.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Notas (estudiantes) */}
      {isStudent && notes.length > 0 ? (
        <section className="rounded-2xl border border-brand-line bg-white p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Feedback reciente del profesor</h2>
          <ul className="mt-3 space-y-3">
            {notes.slice(0, 5).map((n) => (
              <li key={n.id} className="rounded-xl bg-brand-cream/40 p-3 text-sm">
                <div className="flex justify-between text-xs text-brand-ink/55">
                  <span>{new Date(n.createdAt).toLocaleDateString("es-CO")}</span>
                  <span>Rating {n.rating}/5</span>
                </div>
                <p className="mt-1 text-brand-ink/80">{n.notes}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-[11px] text-brand-ink/45">
        <UserCog className="mr-1 inline size-3.5" />
        Las asignaciones y la impersonación se persisten en backend al conectar producción.
      </p>
    </div>
  );
}
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { adminApi, scheduleApi, type SlotRef } from "@/lib/api/endpoints";
import { SchedulePickerGrid } from "@/components/schedule/SchedulePickerGrid";
import { rolesOfRow, rowHasRole } from "@/lib/roles";
import { Cargando, EstadoError, PageHeader, Vacio, btnChip, btnChipInk, focusRing } from "@/components/app/AppUi";
import { btnRow, inputBase, td, th } from "@/components/teacher/TeacherUi";
import { ChipEstado, Segmentado } from "@/components/admin/AdminUi";

/** Los roles llegan en inglés desde la API; al dueño se le muestran en español. */
const NOMBRE_DE_ROL: Record<string, string> = { student: "Estudiante", teacher: "Profe", admin: "Admin" };

export const Route = createFileRoute("/_authenticated/admin/users/")({
  head: () => ({ meta: [{ title: "Usuarios — Admin Freakn'" }] }),
  component: AdminCRM,
});

type Level = "beginner" | "intermediate" | "advanced";

function AdminCRM() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "student" | "teacher" | "admin">("all");
  const [showCreate, setShowCreate] = useState(false);

  // Los eliminados quedan fuera por defecto; el interruptor los trae de vuelta
  // para poder revisarlos o revertir un borrado.
  const [verEliminados, setVerEliminados] = useState(false);
  const usersQ = useQuery({
    queryKey: ["admin", "users", q, verEliminados],
    queryFn: () => adminApi.users(q.trim() || undefined, verEliminados),
  });
  const rows = (usersQ.data ?? []) as any[];
  // Filtra por roles EFECTIVOS: un admin que además da clases debe salir tanto
  // en "admin" como en "teacher".
  const filtered = rows.filter((u) => (role === "all" ? true : rowHasRole(u, role)));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrowText={`Admin · Personas${usersQ.data ? ` · ${filtered.length} de ${rows.length}` : ""}`}
        title="Usuarios"
        highlight="Usuarios"
        aside={
          <button type="button" onClick={() => setShowCreate(true)} className={btnChipInk}>
            <Plus className="size-3.5" aria-hidden="true" /> Invitar usuario
          </button>
        }
      >
        Estudiantes, profes y administradores. Abre una persona para ver su plan, sus clases y sus pagos.
      </PageHeader>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/70" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar por nombre o email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className={`${inputBase} pl-9`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmentado
            etiqueta="Filtrar por rol"
            valor={role}
            onChange={setRole}
            opciones={[
              { valor: "all" as const, texto: "Todos" },
              { valor: "student" as const, texto: "Estudiantes" },
              { valor: "teacher" as const, texto: "Profes" },
              { valor: "admin" as const, texto: "Admin" },
            ]}
          />
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-bold text-brand-ink">
            <input
              type="checkbox"
              checked={verEliminados}
              onChange={(e) => setVerEliminados(e.target.checked)}
              className={`size-5 accent-brand-ink ${focusRing}`}
            />
            Ver eliminados
          </label>
        </div>
      </div>

      {usersQ.isError ? (
        <EstadoError onRetry={() => void usersQ.refetch()}>No pudimos cargar los usuarios.</EstadoError>
      ) : usersQ.isLoading ? (
        <Cargando>Cargando usuarios…</Cargando>
      ) : filtered.length === 0 ? (
        <Vacio titulo="Sin resultados">Prueba con otro nombre o email, o cambia el filtro de rol.</Vacio>
      ) : (
        <div className="overflow-x-auto border-2 border-brand-ink bg-white">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr>
                <th className={th}>Usuario</th>
                <th className={th}>Rol</th>
                <th className={th}>Nivel</th>
                <th className={th}>Plan</th>
                <th className={th}>Estado</th>
                <th className={`${th} text-right`}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-brand-cream-soft">
                  <td className={td}>
                    <Link to="/admin/users/$id" params={{ id: u.id }} className={`block ${focusRing}`}>
                      <div className="font-bold text-brand-ink hover:underline">{u.fullName}</div>
                      <div className="text-xs text-brand-ink/70">{u.email}</div>
                    </Link>
                  </td>
                  <td className={td}>
                    {/* Todos los roles, no solo el principal: si no, un admin
                        que además da clases se veía como simple "admin". */}
                    <div className="flex flex-wrap gap-1">
                      {rolesOfRow(u).map((r) => (
                        <ChipEstado key={r}>{NOMBRE_DE_ROL[String(r).toLowerCase()] ?? r}</ChipEstado>
                      ))}
                      {u.disabledAt ? <ChipEstado atencion>inactivo</ChipEstado> : null}
                      {u.deletedAt ? <ChipEstado>eliminado</ChipEstado> : null}
                    </div>
                  </td>
                  <td className={`${td} capitalize`}>{u.englishLevel ?? "—"}</td>
                  <td className={td}>{u.subscription?.plan?.name ?? "—"}</td>
                  <td className={td}>{u.subscription ? <StatusBadge status={u.subscription.status} /> : <span className="text-brand-ink/70">—</span>}</td>
                  <td className={`${td} text-right`}>
                    <Link
                      to="/admin/users/$id"
                      params={{ id: u.id }}
                      aria-label={`Ver a ${u.fullName}`}
                      className={btnRow}
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate ? <CreateUserDialog onClose={() => setShowCreate(false)} /> : null}
    </div>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userRole, setUserRole] = useState<"student" | "teacher" | "admin">("student");
  // Un admin puede además dar clases: se crea con role=admin + extraRoles=[teacher].
  const [alsoTeacher, setAlsoTeacher] = useState(false);
  const [level, setLevel] = useState<Level>("beginner");
  // Empalme: estudiantes que ya pagaron por fuera de Wompi.
  const [withPlan, setWithPlan] = useState(false);
  const [planId, setPlanId] = useState("");
  const [planStartDate, setPlanStartDate] = useState("");
  const [planEndDate, setPlanEndDate] = useState("");
  // Horario + profesor en el mismo alta (antes había que hacerlo en 3 pantallas).
  const [schedule, setSchedule] = useState<SlotRef[]>([]);
  const [teacherId, setTeacherId] = useState("");
  // Duración por clase (planes internos tipo 2×75). 50 = estándar.
  const [durationMin, setDurationMin] = useState(50);

  const plansQ = useQuery({ queryKey: ["admin", "plans"], queryFn: () => adminApi.plans(), enabled: userRole === "student" });
  const plans = (plansQ.data ?? []) as Array<{ id: string; name: string; daysPerWeek?: number }>;
  const cfgQ = useQuery({
    queryKey: ["schedule", "config"],
    queryFn: () => scheduleApi.config(),
    enabled: userRole === "student" && withPlan,
  });
  const teachersQ = useQuery({
    queryKey: ["admin", "users", "teachers"],
    queryFn: () => adminApi.users().then((rows) => rows.filter((u: any) => rowHasRole(u, "teacher"))),
    enabled: userRole === "student" && withPlan,
  });
  const cfg = cfgQ.data;
  const need = plans.find((p) => p.id === planId)?.daysPerWeek ?? 0;
  const scheduleReady = need > 0 && schedule.length === need;

  const createM = useMutation({
    mutationFn: () =>
      adminApi.createUser({
        fullName,
        email,
        role: userRole,
        extraRoles: userRole === "admin" && alsoTeacher ? ["teacher"] : undefined,
        level: userRole === "student" ? level : undefined,
        plan:
          userRole === "student" && withPlan && planId && planEndDate
            ? { planId, endDate: planEndDate, startDate: planStartDate || undefined }
            : undefined,
        // El horario solo tiene sentido con plan activo; sin profesor el
        // estudiante queda en la cola de asignación manual.
        schedule: userRole === "student" && withPlan && scheduleReady ? schedule : undefined,
        teacherId: userRole === "student" && withPlan && scheduleReady && teacherId ? teacherId : undefined,
        classDurationMin:
          userRole === "student" && withPlan && durationMin !== 50 ? durationMin : undefined,
      }),
    onSuccess: (r: any) => {
      // Recrear a alguien que se eliminó por error reutiliza SU cuenta: hay que
      // decirlo, porque conserva su historial y su progreso anteriores.
      toast.success(
        r?.reactivado
          ? "Se reactivó su cuenta anterior (conserva su historial) y se le envió la invitación."
          : withPlan && userRole === "student"
            ? "Usuario invitado con plan activo. Le llegó el correo de invitación."
            : "Usuario invitado. Le llegó el correo para crear su contraseña.",
      );
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    // La grilla de horario mide 640px de ancho mínimo y 15 filas de alto, así
    // que el modal necesita ancho y scroll propio: con `max-w-md` y sin
    // overflow se salía de la pantalla y no se alcanzaba el botón de enviar.
    <div role="dialog" aria-modal="true" aria-labelledby="invitar-titulo" className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}
        className="shadow-hard mx-auto my-4 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border-2 border-brand-ink bg-white [--hard-x:6px]"
      >
        <div className="flex-1 overflow-y-auto p-6">
        <h2 id="invitar-titulo" className="font-display text-[22px] font-extrabold uppercase leading-tight text-brand-ink">Invitar usuario</h2>
        <p className="mt-1 text-xs text-brand-ink/70">
          Le llegará un correo de invitación con el link para crear su contraseña y entrar. Sin plan manual, un estudiante se activa solo tras pagar por Wompi.
        </p>

        <div className="mt-4">
          <Segmentado
            etiqueta="Tipo de usuario"
            valor={userRole}
            onChange={setUserRole}
            opciones={[
              { valor: "student" as const, texto: "Estudiante" },
              { valor: "teacher" as const, texto: "Profesor" },
              { valor: "admin" as const, texto: "Administrador" },
            ]}
          />
        </div>
        {userRole === "admin" ? (
          <>
            <p className="mt-2 border-2 border-brand-ink bg-brand-yellow-soft px-3 py-2 text-xs text-brand-ink">
              Un administrador ve y edita <b>todo</b>: usuarios, pagos, nómina y contenido. Invita
              solo a gente del equipo en la que confíes.
            </p>
            <label className="mt-2 flex items-start gap-2 p-3 border border-brand-ink/25 bg-brand-cream-soft">
              <input
                type="checkbox"
                checked={alsoTeacher}
                onChange={(e) => setAlsoTeacher(e.target.checked)}
                className={`mt-0.5 size-5 shrink-0 accent-brand-ink ${focusRing}`}
              />
              <span className="text-xs text-brand-ink/80">
                <strong className="block text-brand-ink">También dicta clases</strong>
                Además del panel de admin, tendrá los módulos de profesor y aparecerá en los
                listados para asignarle estudiantes y liquidarle nómina.
              </span>
            </label>
          </>
        ) : null}

        <label className="mt-4 block text-xs font-bold text-brand-ink">
          Nombre completo
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow" />
        </label>
        <label className="mt-3 block text-xs font-bold text-brand-ink">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow" />
        </label>
        {userRole === "student" ? (
          <>
            <label className="mt-3 block text-xs font-bold text-brand-ink">
              Nivel inicial
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow">
                <option value="beginner">Beginner (A1–A2)</option>
                <option value="intermediate">Intermediate (B1–B2)</option>
                <option value="advanced">Advanced (C1)</option>
              </select>
            </label>

            <label className="mt-4 flex items-start gap-2 p-3 border border-brand-ink/25 bg-brand-cream-soft">
              <input
                type="checkbox"
                checked={withPlan}
                onChange={(e) => setWithPlan(e.target.checked)}
                className={`mt-0.5 size-5 shrink-0 accent-brand-ink ${focusRing}`}
              />
              <span className="text-xs text-brand-ink/80">
                <strong className="block text-brand-ink">Activar plan manualmente</strong>
                Para estudiantes que ya pagaron por fuera de Wompi. La suscripción queda activa hasta la fecha que definas.
              </span>
            </label>

            {withPlan ? (
              <>
                <label className="mt-3 block text-xs font-bold text-brand-ink">
                  Plan
                  <select
                    value={planId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPlanId(id);
                      setSchedule([]);
                      // El plan interno de 2 días se dicta en clases de 75 min
                      // (mismo tiempo semanal que 3×50); los demás en 50.
                      setDurationMin(plans.find((p) => p.id === id)?.daysPerWeek === 2 ? 75 : 50);
                    }}
                    required
                    className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                  >
                    <option value="" disabled>Selecciona…</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-xs font-bold text-brand-ink">
                  Duración de cada clase
                  <select
                    value={durationMin}
                    onChange={(e) => { setDurationMin(Number(e.target.value)); setSchedule([]); }}
                    className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                  >
                    <option value={50}>50 minutos (estándar)</option>
                    <option value={60}>60 minutos</option>
                    <option value={75}>75 minutos</option>
                    <option value={90}>90 minutos</option>
                  </select>
                  {durationMin > 60 ? (
                    <span className="mt-1 block font-normal text-xs text-brand-ink/70">
                      La clase ocupa también la hora siguiente: el profesor debe tener las
                      horas seguidas pintadas en su disponibilidad para poder asignarlo.
                    </span>
                  ) : null}
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-brand-ink">
                    Inicia el
                    <input
                      type="date"
                      value={planStartDate}
                      onChange={(e) => setPlanStartDate(e.target.value)}
                      className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                    />
                    <span className="mt-1 block font-normal text-xs text-brand-ink/70">Vacío = hoy.</span>
                  </label>
                  <label className="block text-xs font-bold text-brand-ink">
                    Activo hasta
                    <input
                      type="date"
                      value={planEndDate}
                      onChange={(e) => setPlanEndDate(e.target.value)}
                      required
                      min={new Date().toISOString().slice(0, 10)}
                      className="mt-1 w-full px-3 py-2 text-sm min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                    />
                  </label>
                </div>

                {/* Horario y profesor en el mismo alta. La grilla es la misma
                    del checkout, así que valida ventana y máximo por día. */}
                {planId && cfg ? (
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-bold text-brand-ink">
                        Horario semanal <span className="font-normal text-brand-ink/70">(opcional)</span>
                      </span>
                      <span className="text-xs font-semibold text-brand-ink">
                        {schedule.length}/{need || "—"}
                      </span>
                    </div>
                    <div className="mt-2">
                      {/* La grilla hereda la duración elegida: tooltips con la
                          hora fin real y reglas de separación entre franjas. */}
                      <SchedulePickerGrid
                        cfg={{ ...cfg, durationMin }}
                        need={need}
                        selected={schedule}
                        onChange={setSchedule}
                      />
                    </div>

                    <label className="mt-3 block text-xs font-bold text-brand-ink">
                      Profesor
                      <select
                        value={teacherId}
                        onChange={(e) => setTeacherId(e.target.value)}
                        disabled={!scheduleReady}
                        className="mt-1 w-full px-3 py-2 text-sm disabled:opacity-50 min-h-11 border-2 border-brand-ink bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow"
                      >
                        <option value="">Sin asignar (queda en solicitudes)</option>
                        {(teachersQ.data ?? []).map((t: any) => (
                          <option key={t.id} value={t.id}>{t.fullName}</option>
                        ))}
                      </select>
                      <span className="mt-1 block font-normal text-xs text-brand-ink/70">
                        {scheduleReady
                          ? "Al asignarlo se crean sus clases y les llega el correo a ambos."
                          : `Completa las ${need || ""} franjas del plan para poder asignar profesor.`}
                      </span>
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        </div>

        {/* Fijo abajo: con el horario abierto el formulario es largo y el
            botón de enviar quedaba fuera de la vista. */}
        <div className="flex justify-end gap-2 border-t border-brand-ink/15 bg-white px-6 py-4">
          <button type="button" onClick={onClose} className={btnChip}>Cancelar</button>
          <button type="submit" disabled={createM.isPending} className={btnChipInk}>
            {createM.isPending ? "Enviando…" : "Enviar invitación"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Pago fallido y pendiente piden atención (amarillo); lo demás, contorno neutro.
const ESTADO_SUSCRIPCION: Record<string, { texto: string; atencion: boolean }> = {
  active: { texto: "Activo", atencion: false },
  pending: { texto: "Pendiente", atencion: true },
  past_due: { texto: "Pago fallido", atencion: true },
  canceled: { texto: "Cancelado", atencion: false },
  expired: { texto: "Vencido", atencion: false },
};

function StatusBadge({ status }: { status: string }) {
  const e = ESTADO_SUSCRIPCION[status] ?? { texto: status.replace("_", " "), atencion: false };
  return <ChipEstado atencion={e.atencion}>{e.texto}</ChipEstado>;
}

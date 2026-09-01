import { useMemo, useRef, useState } from "react";
import { ZONA_BOGOTA, etiquetaDeZona, franjaEnZona, nombreDeZona, zonaDe } from "@/lib/domain/zona-horaria";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, Pin, PinOff, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { teachersApi } from "@/lib/api/endpoints";
import type { EnglishLevel } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/teacher/students/$studentId")({
  head: () => ({ meta: [{ title: "Estudiante — Freakn for Teachers" }] }),
  component: TeacherStudentDetail,
});

function TeacherStudentDetail() {
  const { studentId } = useParams({ from: "/_authenticated/teacher/students/$studentId" });
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const q = useQuery({ queryKey: ["teacher", "student", studentId], queryFn: () => teachersApi.studentDetail(studentId) });
  const student = q.data as any;
  const classes: any[] = student?.classesAsStudent ?? [];
  const notes: any[] = student?.teacherNotes ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teacher", "student", studentId] });
  const addM = useMutation({
    mutationFn: () => teachersApi.addStudentNote(studentId, body.trim()),
    onSuccess: () => { toast.success("Nota guardada"); setBody(""); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });
  const pinM = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => teachersApi.pinNote(v.id, v.pinned),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const [meetDraft, setMeetDraft] = useState<string | null>(null);
  const meetM = useMutation({
    mutationFn: (url: string) => teachersApi.setMeetingUrl(studentId, url || null),
    onSuccess: () => {
      toast.success("Link de clase guardado — el estudiante lo verá en su calendario.");
      setMeetDraft(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar el link"),
  });

  if (q.isLoading) return <div className="text-sm text-brand-ink/60">Cargando…</div>;
  if (!student) {
    return (
      <div className="rounded-2xl border border-brand-line bg-white p-6 text-sm text-brand-ink/65">
        Estudiante no encontrado. <Link to="/teacher/students" className="font-semibold text-brand-ink hover:underline">Volver</Link>
      </div>
    );
  }

  const completed = classes.filter((c) => c.status === "validated").length;
  const missed = classes.filter((c) => c.status === "no_show").length;

  function saveNote() {
    if (!body.trim()) return;
    addM.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/teacher/students" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/70 hover:text-brand-ink">
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      </div>

      <header className="flex flex-col gap-2 rounded-2xl border border-brand-line bg-white p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-ink">{student.fullName}</h1>
          <p className="text-sm text-brand-ink/65">{student.email}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-brand-ink/55">Nivel actual: {student.englishLevel ?? "sin nivelar"}</p>
          {/* Que el profe sepa dónde está su alumno: si le escribe "nos vemos a
              las 11" y ella está en San Francisco, para ella son las 9. Todas
              las horas del portal del profe siguen siendo de Colombia. */}
          {student.timezone && zonaDe(student.timezone) !== ZONA_BOGOTA ? (
            <p className="mt-1 text-xs text-brand-ink/60">
              📍 {nombreDeZona(student.timezone)} ({etiquetaDeZona(student.timezone)}) — tu clase de
              las 11:00 son sus {String(franjaEnZona(1, 11, student.timezone).hour).padStart(2, "0")}:00
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Mini label="Clases" value={classes.length} />
          <Mini label="Validadas" value={completed} />
          <Mini label="No asistió" value={missed} tone={missed > 0 ? "warn" : undefined} />
        </div>
      </header>

      {/* Link de Meet/Zoom del estudiante: con él entra a clase desde su calendario. */}
      <section className="rounded-2xl border border-brand-line bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-ink">
          <Video className="size-4" /> Link de clase (Meet / Zoom)
        </div>
        <p className="mt-1 text-xs text-brand-ink/55">
          Este es el link con el que {student.fullName.split(" ")[0]} entra a todas sus clases contigo.
          Puedes pegar la invitación completa de Zoom o Meet: extraemos el enlace solo.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={meetDraft ?? student.meetingUrl ?? ""}
            onChange={(e) => setMeetDraft(e.target.value)}
            placeholder="https://meet.google.com/…"
            className="w-full max-w-md rounded-xl border border-brand-line px-4 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
          <button
            onClick={() => meetM.mutate((meetDraft ?? student.meetingUrl ?? "").trim())}
            disabled={meetM.isPending || meetDraft === null}
            className="rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {meetM.isPending ? "Guardando…" : "Guardar link"}
          </button>
          {student.meetingUrl ? (
            <a
              href={student.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-brand-line px-4 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-cream/40"
            >
              Probar link
            </a>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-brand-ink">Historial de clases</h2>
          <div className="mt-3 max-h-[60vh] overflow-y-auto overflow-hidden rounded-2xl border border-brand-line bg-white">
            {classes.length === 0 ? (
              <div className="p-6 text-sm text-brand-ink/65">Sin clases aún.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-brand-cream/60 text-xs uppercase tracking-wide text-brand-ink/60 backdrop-blur">
                  <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Tema</th><th className="px-4 py-3">Estado</th></tr>
                </thead>
                <tbody className="divide-y divide-brand-line">
                  {classes.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 text-brand-ink/80">{new Date(c.startsAt).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-3">{c.topic ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-brand-ink/70">
                        {c.status === "validated" ? "validada" : c.status === "no_show" ? "no asistió" : c.status === "cancelled" ? "cancelada" : c.status === "rescheduled" ? "reprogramada" : "programada"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>

        <aside>
          <h2 className="text-lg font-semibold text-brand-ink">Notas privadas</h2>
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-4">
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Progreso, observaciones, vocabulario a reforzar…" className="w-full rounded-xl border border-brand-line bg-white p-3 text-sm focus:border-brand-ink focus:outline-none" />
            <div className="flex justify-end">
              <button onClick={saveNote} disabled={!body.trim() || addM.isPending} className="rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50">
                Guardar nota
              </button>
            </div>

            <div className="mt-2 flex max-h-[45vh] flex-col gap-3 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <p className="text-xs text-brand-ink/55">Aún no hay notas guardadas.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className={`rounded-xl p-3 ${n.pinned ? "border border-brand-ink/20 bg-brand-yellow/20" : "bg-brand-cream/40"}`}>
                    <div className="flex items-center justify-between text-[10px] uppercase text-brand-ink/55">
                      <span>{new Date(n.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>
                      <button
                        onClick={() => pinM.mutate({ id: n.id, pinned: !n.pinned })}
                        title={n.pinned ? "Quitar fijado" : "Fijar nota"}
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${n.pinned ? "text-brand-ink" : "text-brand-ink/40 hover:text-brand-ink"}`}
                      >
                        {n.pinned ? <Pin className="size-3.5 fill-brand-ink/80" /> : <PinOff className="size-3.5" />}
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink">{n.notes}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>

      <StudentResourcesSection studentId={studentId} />
      <StudentReportsSection studentId={studentId} />
      <LessonPlanSection studentId={studentId} />
      <CheckpointGatesSection studentId={studentId} />
      <ActivityResultsSection studentId={studentId} />
      <CheckpointAttemptsSection studentId={studentId} />
    </div>
  );
}

const NIVELES_REPORTE: Array<{ id: EnglishLevel | ""; label: string }> = [
  { id: "", label: "Sin nivelar" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const pesoLegible = (b: number | null) =>
  b == null ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * Material extra del estudiante: links y PDFs que le deja su profesor.
 *
 * El PDF va al bucket, que es de lectura pública. La clave lleva un UUID, así
 * que la URL no se adivina, pero quien la tenga la abre sin sesión: es material
 * de estudio y es como ya se sirve todo lo demás del producto.
 */
export function StudentResourcesSection({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<"link" | "file">("link");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [url, setUrl] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [destinatarios, setDestinatarios] = useState<string[]>([studentId]);
  const [subiendo, setSubiendo] = useState(false);

  const q = useQuery({
    queryKey: ["student-resources", studentId],
    queryFn: () => teachersApi.studentResources(studentId),
  });
  // Para poder mandarle el mismo material a varios de un tirón.
  const alumnosQ = useQuery({ queryKey: ["teacher", "students"], queryFn: () => teachersApi.students() });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["student-resources"] });
  const borrarM = useMutation({
    mutationFn: (id: string) => teachersApi.deleteStudentResource(id),
    onSuccess: () => { invalidar(); toast.success("Material eliminado"); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  function limpiar() {
    setTitulo(""); setDescripcion(""); setUrl(""); setArchivo(null);
    setDestinatarios([studentId]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function guardar() {
    if (!titulo.trim()) return toast.error("Ponle un título");
    if (destinatarios.length === 0) return toast.error("Elige al menos un estudiante");
    setSubiendo(true);
    try {
      let payloadUrl = url.trim();
      let storageKey: string | null = null;
      let contentType: string | null = null;
      let sizeBytes: number | null = null;

      if (tipo === "file") {
        if (!archivo) throw new Error("Elige un archivo");
        // Dos pasos, como el resto del producto: se firma y se sube directo al
        // bucket; el backend nunca ve el archivo.
        const firma = await teachersApi.signStudentUpload(
          studentId,
          archivo.name,
          archivo.type || "application/octet-stream",
        );
        const r = await fetch(firma.uploadUrl, {
          method: "PUT",
          headers: { "content-type": archivo.type || "application/octet-stream" },
          body: archivo,
        });
        if (!r.ok) throw new Error("Falló la subida del archivo");
        payloadUrl = firma.publicUrl;
        storageKey = firma.storageKey;
        contentType = archivo.type || null;
        sizeBytes = archivo.size;
      } else if (!payloadUrl) {
        throw new Error("Pega el enlace");
      }

      const res = await teachersApi.createStudentResources({
        studentIds: destinatarios,
        kind: tipo,
        title: titulo.trim(),
        description: descripcion.trim() || null,
        url: payloadUrl,
        storageKey,
        contentType,
        sizeBytes,
      });
      toast.success(res.creados > 1 ? `Material enviado a ${res.creados} estudiantes` : "Material agregado");
      limpiar();
      invalidar();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSubiendo(false);
    }
  }

  const items = q.data ?? [];
  const alumnos = (alumnosQ.data ?? []) as any[];

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-ink">Material extra del estudiante</h2>
      <p className="mt-1 text-sm text-brand-ink/65">
        Links y PDFs de refuerzo. Sólo los ve este estudiante en su portal.
      </p>

      <div className="mt-3 grid gap-4 rounded-2xl border border-brand-line bg-white p-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="inline-flex w-fit rounded-full border border-brand-line p-1 text-xs">
            {(["link", "file"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-full px-3 py-1.5 font-medium transition ${tipo === t ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:text-brand-ink"}`}
              >
                {t === "link" ? "Enlace" : "Archivo"}
              </button>
            ))}
          </div>

          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (ej. Guía de past simple)"
            className="w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción corta (opcional)"
            className="w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />

          {tipo === "link" ? (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            />
          ) : (
            <div className="flex flex-col gap-1">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.mp3,.m4a"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-xs file:mr-3 file:rounded-full file:border-0 file:bg-brand-cream file:px-3 file:py-1 file:text-xs file:font-semibold"
              />
              {archivo ? (
                <span className="text-[11px] text-brand-ink/55">{archivo.name} · {pesoLegible(archivo.size)}</span>
              ) : null}
            </div>
          )}

          {alumnos.length > 1 ? (
            <details className="rounded-xl border border-brand-line bg-brand-cream/30 p-2 text-xs">
              <summary className="cursor-pointer font-semibold text-brand-ink">
                Enviar también a otros ({destinatarios.length} seleccionado{destinatarios.length === 1 ? "" : "s"})
              </summary>
              <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                {alumnos.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-brand-ink/80">
                    <input
                      type="checkbox"
                      checked={destinatarios.includes(a.id)}
                      onChange={(e) =>
                        setDestinatarios((prev) =>
                          e.target.checked ? [...new Set([...prev, a.id])] : prev.filter((x) => x !== a.id),
                        )
                      }
                    />
                    {a.fullName}
                  </label>
                ))}
              </div>
            </details>
          ) : null}

          <button
            type="button"
            onClick={() => void guardar()}
            disabled={subiendo}
            className="rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50"
          >
            {subiendo ? "Guardando…" : "Agregar material"}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {q.isLoading ? (
            <p className="text-sm text-brand-ink/60">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-brand-ink/55">Este estudiante todavía no tiene material.</p>
          ) : (
            items.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl bg-brand-cream/40 p-3">
                <div className="min-w-0">
                  <a href={m.url} target="_blank" rel="noreferrer" className="font-medium text-brand-ink hover:underline">
                    {m.title}
                  </a>
                  {m.description ? <div className="text-xs text-brand-ink/65">{m.description}</div> : null}
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-brand-ink/45">
                    {m.kind === "file" ? "Archivo" : "Enlace"}
                    {m.sizeBytes ? ` · ${pesoLegible(m.sizeBytes)}` : ""}
                    {" · "}
                    {new Date(m.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => borrarM.mutate(m.id)}
                  disabled={borrarM.isPending}
                  className="shrink-0 rounded-lg p-1.5 text-red-500/70 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label="Eliminar material"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Reportes de progreso. A diferencia de las notas privadas, esto SÍ lo ve el
 * estudiante: al publicarlo le llega notificación en la campana y por correo.
 * Mientras no se publique es un borrador y sólo lo ve el profe.
 */
export function StudentReportsSection({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState({
    id: undefined as string | undefined,
    periodLabel: "",
    level: "" as EnglishLevel | "",
    classesTaken: "" as number | "",
    classesTotal: "" as number | "",
    strengths: "",
    improvements: "",
    recommendation: "",
    comment: "",
  });

  const q = useQuery({
    queryKey: ["student-reports", studentId],
    queryFn: () => teachersApi.studentReports(studentId),
  });

  const guardarM = useMutation({
    mutationFn: (publish: boolean) =>
      teachersApi.saveReport({
        id: borrador.id,
        studentId,
        periodLabel: borrador.periodLabel,
        level: borrador.level || null,
        classesTaken: borrador.classesTaken === "" ? null : Number(borrador.classesTaken),
        classesTotal: borrador.classesTotal === "" ? null : Number(borrador.classesTotal),
        strengths: borrador.strengths,
        improvements: borrador.improvements,
        recommendation: borrador.recommendation,
        comment: borrador.comment,
        publish,
      }),
    onSuccess: (_r, publish) => {
      qc.invalidateQueries({ queryKey: ["student-reports", studentId] });
      setAbierto(false);
      toast.success(publish ? "Reporte publicado — al estudiante ya le llegó el aviso" : "Borrador guardado");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  /** Abre el formulario con el periodo del mes en curso y las clases contadas. */
  async function nuevo() {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    const periodo = desde.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    let previo = { level: null as EnglishLevel | null, classesTaken: 0, classesTotal: 0 };
    try {
      previo = await teachersApi.reportDraft(studentId, desde.toISOString(), hasta.toISOString());
    } catch {
      /* si falla la precarga, el profe lo llena a mano */
    }
    setBorrador({
      id: undefined,
      periodLabel: periodo.charAt(0).toUpperCase() + periodo.slice(1),
      level: previo.level ?? "",
      classesTaken: previo.classesTaken,
      classesTotal: previo.classesTotal,
      strengths: "",
      improvements: "",
      recommendation: "",
      comment: "",
    });
    setAbierto(true);
  }

  function editar(r: any) {
    setBorrador({
      id: r.id,
      periodLabel: r.periodLabel,
      level: r.level ?? "",
      classesTaken: r.classesTaken ?? "",
      classesTotal: r.classesTotal ?? "",
      strengths: r.strengths ?? "",
      improvements: r.improvements ?? "",
      recommendation: r.recommendation ?? "",
      comment: r.comment ?? "",
    });
    setAbierto(true);
  }

  const campo = "w-full rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none";
  const reportes = q.data ?? [];

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-brand-ink">Reportes de progreso</h2>
          <p className="mt-1 text-sm text-brand-ink/65">
            El estudiante los lee en su portal. Al publicarlo le llega aviso por correo y campana.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void nuevo()}
          className="rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft"
        >
          Nuevo reporte
        </button>
      </div>

      {abierto ? (
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-brand-ink/20 bg-brand-cream/30 p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs font-semibold text-brand-ink/70 sm:col-span-2">
              Periodo
              <input value={borrador.periodLabel} onChange={(e) => setBorrador({ ...borrador, periodLabel: e.target.value })} placeholder="Agosto 2026" className={`mt-1 font-normal ${campo}`} />
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              Nivel
              <select value={borrador.level} onChange={(e) => setBorrador({ ...borrador, level: e.target.value as EnglishLevel | "" })} className={`mt-1 font-normal ${campo}`}>
                {NIVELES_REPORTE.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              Clases (tomadas / programadas)
              <div className="mt-1 flex items-center gap-1">
                <input type="number" min={0} value={borrador.classesTaken} onChange={(e) => setBorrador({ ...borrador, classesTaken: e.target.value === "" ? "" : Number(e.target.value) })} className={`font-normal ${campo}`} />
                <span className="text-brand-ink/50">/</span>
                <input type="number" min={0} value={borrador.classesTotal} onChange={(e) => setBorrador({ ...borrador, classesTotal: e.target.value === "" ? "" : Number(e.target.value) })} className={`font-normal ${campo}`} />
              </div>
            </label>
          </div>

          {([
            ["strengths", "Fortalezas", "En qué va bien: pronunciación, fluidez, participación…"],
            ["improvements", "Por mejorar", "Lo que conviene reforzar en el próximo tramo"],
            ["recommendation", "Recomendación", "Qué debería practicar o cambiar"],
            ["comment", "Comentario para el estudiante", "Un mensaje libre; es lo primero que va a leer"],
          ] as const).map(([k, label, ph]) => (
            <label key={k} className="text-xs font-semibold text-brand-ink/70">
              {label}
              <textarea
                rows={2}
                value={(borrador as any)[k]}
                onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })}
                placeholder={ph}
                className={`mt-1 font-normal ${campo}`}
              />
            </label>
          ))}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="rounded-full border border-brand-line px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-white">
              Cancelar
            </button>
            <button type="button" onClick={() => guardarM.mutate(false)} disabled={guardarM.isPending} className="rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-50">
              Guardar borrador
            </button>
            <button type="button" onClick={() => guardarM.mutate(true)} disabled={guardarM.isPending} className="rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50">
              Publicar y avisar
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {q.isLoading ? (
          <p className="text-sm text-brand-ink/60">Cargando…</p>
        ) : reportes.length === 0 ? (
          <p className="text-sm text-brand-ink/55">Todavía no le has escrito ningún reporte.</p>
        ) : (
          reportes.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-line bg-white p-3">
              <div>
                <div className="font-medium text-brand-ink">{r.periodLabel}</div>
                <div className="text-[10px] uppercase tracking-wide text-brand-ink/45">
                  {r.teacher?.fullName ?? ""}
                  {r.classesTaken != null ? ` · ${r.classesTaken}/${r.classesTotal ?? "—"} clases` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.publishedAt ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
                  {r.publishedAt ? `Publicado ${new Date(r.publishedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}` : "Borrador"}
                </span>
                <button type="button" onClick={() => editar(r)} className="rounded-full border border-brand-line px-3 py-1 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40">
                  {r.publishedAt ? "Editar" : "Continuar"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Resultados de actividades de aprendizaje (bridge FreaknActivity) — el
 * profesor ve cómo le fue a su estudiante en cada lección interactiva.
 */
export function ActivityResultsSection({ studentId }: { studentId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["activity-results", studentId],
    queryFn: () => teachersApi.studentActivityResults(studentId),
  });
  const rows = q.data ?? [];

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-ink">Actividades de aprendizaje</h2>
      <p className="mt-0.5 text-xs text-brand-ink/55">
        Respuestas y resultados de las actividades interactivas de las lecciones.
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-brand-line bg-white">
        {q.isLoading ? (
          <p className="p-5 text-sm text-brand-ink/55">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-brand-ink/55">Aún no ha completado actividades.</p>
        ) : (
          <ul className="divide-y divide-brand-line/70">
            {rows.map((r) => {
              const pct = r.score != null && r.maxScore ? Math.round((r.score / r.maxScore) * 100) : null;
              const open = expanded === r.id;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm transition hover:bg-brand-cream/30"
                  >
                    <div>
                      <div className="font-semibold text-brand-ink">{r.title ?? r.activityId}</div>
                      <div className="text-xs text-brand-ink/55">
                        {r.lesson?.module?.title ? `${r.lesson.module.title} · ` : ""}
                        {r.lesson?.title ?? r.lessonId}
                        {" · "}
                        {new Date(r.updatedAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                        {r.attempts > 1 ? ` · ${r.attempts} intentos` : ""}
                      </div>
                    </div>
                    {pct != null ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          pct >= 80 ? "bg-emerald-100 text-emerald-800" : pct >= 50 ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {r.score}/{r.maxScore} · {pct}%
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand-cream px-2.5 py-1 text-xs font-semibold text-brand-ink/70">Completada</span>
                    )}
                  </button>
                  {open && Array.isArray(r.answers) && r.answers.length > 0 ? (
                    <div className="border-t border-brand-line/60 bg-brand-cream/20 px-4 py-3">
                      <ul className="space-y-2 text-sm">
                        {r.answers.map((a: any, i: number) => (
                          <li key={a.id ?? i} className="rounded-xl bg-white p-2.5">
                            {a.question ? <div className="text-xs text-brand-ink/60">{a.question}</div> : null}
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              <span className="font-medium text-brand-ink">{String(a.answer ?? "—")}</span>
                              {a.correct === true ? (
                                <span className="text-xs font-semibold text-emerald-600">✓ correcta</span>
                              ) : a.correct === false ? (
                                <span className="text-xs font-semibold text-red-600">
                                  ✗ incorrecta{a.expected != null ? ` (era: ${String(a.expected)})` : ""}
                                </span>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Plan de contenido: todo nace bloqueado y el profe va abriendo lección por
 * lección (o el módulo entero) a medida que avanza con su estudiante.
 */
export function LessonPlanSection({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["lesson-plan", studentId],
    queryFn: () => teachersApi.lessonPlan(studentId),
  });
  const m = useMutation({
    mutationFn: (v: { lessonIds: string[]; unlock: boolean }) =>
      teachersApi.setLessonUnlocks(studentId, v.lessonIds, v.unlock),
    onSuccess: (r, v) => {
      toast.success(
        v.unlock
          ? `${r.afectadas} lección(es) habilitada(s)`
          : `${r.afectadas} lección(es) bloqueada(s)`,
      );
      qc.invalidateQueries({ queryKey: ["lesson-plan", studentId] });
      qc.invalidateQueries({ queryKey: ["checkpoint-gates", studentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo actualizar"),
  });
  const mods = q.data ?? [];
  const totalAbiertas = mods.reduce((s, x) => s + x.lessons.filter((l) => l.unlocked).length, 0);
  const total = mods.reduce((s, x) => s + x.lessons.length, 0);

  // Resumen por nivel para los botones de "habilitar/bloquear nivel".
  const porNivel = useMemo(() => {
    const etiquetas: Record<string, string> = {
      beginner: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
    };
    const orden = ["beginner", "intermediate", "advanced"];
    const mapa = new Map<string, { ids: string[]; abiertas: number }>();
    for (const mod of mods) {
      const nivel = (mod as any).level ?? "beginner";
      const acc = mapa.get(nivel) ?? { ids: [], abiertas: 0 };
      for (const l of mod.lessons) {
        acc.ids.push(l.lessonId);
        if (l.unlocked) acc.abiertas++;
      }
      mapa.set(nivel, acc);
    }
    return [...mapa.entries()]
      .sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0]))
      .map(([level, v]) => ({
        level,
        label: etiquetas[level] ?? level,
        ids: v.ids,
        abiertas: v.abiertas,
        total: v.ids.length,
      }));
  }, [mods]);

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-ink">Contenido habilitado</h2>
      <p className="mt-0.5 text-xs text-brand-ink/55">
        Todo el programa arranca bloqueado. Ve abriendo lo que corresponda a medida que avanzas en
        clase — así el estudiante no se adelanta ni se pierde. {totalAbiertas} de {total} habilitadas.
        Los niveles por debajo del suyo ya van abiertos automáticamente.
      </p>

      {/* Atajo por nivel: abrir o cerrar un nivel entero de un solo click, en
          vez de ir módulo por módulo. */}
      {porNivel.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {porNivel.map((n) => (
            <div
              key={n.level}
              className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-1.5"
            >
              <span className="text-xs font-semibold capitalize text-brand-ink">{n.label}</span>
              <span className="text-[11px] text-brand-ink/55">
                {n.abiertas}/{n.total}
              </span>
              <button
                type="button"
                onClick={() => m.mutate({ lessonIds: n.ids, unlock: n.abiertas < n.total })}
                disabled={m.isPending}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                  n.abiertas < n.total
                    ? "bg-brand-ink text-white hover:bg-brand-ink-soft"
                    : "border border-brand-line text-brand-ink/70 hover:bg-brand-cream/40"
                }`}
              >
                {n.abiertas < n.total ? "Habilitar nivel" : "Bloquear nivel"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 overflow-hidden rounded-2xl border border-brand-line bg-white">
        {q.isLoading ? (
          <p className="p-5 text-sm text-brand-ink/55">Cargando…</p>
        ) : mods.length === 0 ? (
          <p className="p-5 text-sm text-brand-ink/55">No hay contenido publicado todavía.</p>
        ) : (
          <ul className="divide-y divide-brand-line/70">
            {mods.map((mod) => {
              const abiertas = mod.lessons.filter((l) => l.unlocked).length;
              const todas = mod.lessons.length;
              const open = abierto === mod.moduleId;
              const ids = mod.lessons.map((l) => l.lessonId);
              return (
                <li key={mod.moduleId}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <button
                      onClick={() => setAbierto(open ? null : mod.moduleId)}
                      className="flex-1 text-left text-sm"
                    >
                      <span className="font-semibold text-brand-ink">
                        {mod.unit != null ? `U${mod.unit} · ` : ""}{mod.title}
                      </span>
                      <span className="ml-2 text-xs text-brand-ink/55">
                        {abiertas}/{todas} habilitadas
                      </span>
                    </button>
                    {/* Al visor: los slides completos con el estado de ESTE
                        estudiante superpuesto, para decidir viendo el material. */}
                    <Link
                      to="/teacher/content/$moduleId"
                      params={{ moduleId: mod.moduleId }}
                      search={{ studentId } as any}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-line px-3 py-1.5 text-xs font-semibold text-brand-ink/70 transition hover:bg-brand-cream/40"
                    >
                      <Eye className="size-3.5" /> Ver contenido
                    </Link>
                    <button
                      onClick={() => m.mutate({ lessonIds: ids, unlock: abiertas < todas })}
                      disabled={m.isPending}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                        abiertas < todas
                          ? "bg-brand-ink text-white hover:bg-brand-ink-soft"
                          : "border border-brand-line text-brand-ink/70 hover:bg-brand-cream/40"
                      }`}
                    >
                      {abiertas < todas ? "Habilitar módulo" : "Bloquear módulo"}
                    </button>
                  </div>
                  {open ? (
                    <ul className="border-t border-brand-line/60 bg-brand-cream/20 px-4 py-2">
                      {mod.lessons.map((l) => (
                        <li key={l.lessonId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className={l.completedAt ? "text-brand-ink/50 line-through" : "text-brand-ink"}>
                            {l.isCheckpoint ? "🏁 " : ""}{l.title}
                            {l.completedAt ? (
                              <span className="ml-1.5 text-[11px] text-emerald-700">completada</span>
                            ) : null}
                          </span>
                          <button
                            onClick={() => m.mutate({ lessonIds: [l.lessonId], unlock: !l.unlocked })}
                            disabled={m.isPending}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                              l.unlocked
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "border border-brand-line text-brand-ink/60 hover:bg-white"
                            }`}
                          >
                            {l.unlocked ? "Habilitada" : "Bloqueada"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Compuertas de checkpoint: el profe decide cuándo su estudiante puede
 * presentar cada checkpoint. Mientras no lo habilite, el estudiante no ve el
 * contenido que viene después.
 */
export function CheckpointGatesSection({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["checkpoint-gates", studentId],
    queryFn: () => teachersApi.checkpointGates(studentId),
  });
  const m = useMutation({
    mutationFn: (v: { lessonId: string; unlock: boolean }) =>
      teachersApi.setCheckpointGate(studentId, v.lessonId, v.unlock),
    onSuccess: (_r, v) => {
      toast.success(
        v.unlock
          ? "Checkpoint habilitado — le avisamos al estudiante por correo."
          : "Checkpoint bloqueado de nuevo.",
      );
      qc.invalidateQueries({ queryKey: ["checkpoint-gates", studentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo actualizar"),
  });
  const rows = q.data ?? [];

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-ink">Checkpoints · habilitación</h2>
      <p className="mt-0.5 text-xs text-brand-ink/55">
        Hasta que habilites un checkpoint, tu estudiante no puede presentarlo ni ver el contenido
        que viene después. Así avanza a tu ritmo y no se come el programa de una sentada.
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-brand-line bg-white">
        {q.isLoading ? (
          <p className="p-5 text-sm text-brand-ink/55">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-brand-ink/55">No hay checkpoints configurados en el contenido.</p>
        ) : (
          <ul className="divide-y divide-brand-line/70">
            {rows.map((r) => {
              const hecho = !!r.completedAt;
              return (
                <li key={r.lessonId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-brand-ink">
                      {r.unit != null ? `Unidad ${r.unit} · ` : ""}{r.moduleTitle}
                    </div>
                    <div className="text-xs text-brand-ink/55">
                      {hecho ? (
                        <>Superado el {new Date(r.completedAt!).toLocaleDateString("es-CO", { dateStyle: "medium" })}</>
                      ) : r.unlocked ? (
                        <>
                          Habilitado{r.unlockedAt ? ` el ${new Date(r.unlockedAt).toLocaleDateString("es-CO", { dateStyle: "medium" })}` : ""}
                          {r.unlockedBy ? ` por ${r.unlockedBy.fullName}` : ""} · aún sin presentar
                        </>
                      ) : (
                        "Bloqueado — el estudiante no ve lo que viene después"
                      )}
                    </div>
                  </div>
                  {hecho ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      Superado
                    </span>
                  ) : (
                    <button
                      onClick={() => m.mutate({ lessonId: r.lessonId, unlock: !r.unlocked })}
                      disabled={m.isPending}
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                        r.unlocked
                          ? "border border-brand-line text-brand-ink/70 hover:bg-brand-cream/40"
                          : "bg-brand-ink text-white hover:bg-brand-ink-soft"
                      }`}
                    >
                      {r.unlocked ? "Bloquear" : "Habilitar"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Intentos de checkpoints del estudiante con corrección detallada. */
export function CheckpointAttemptsSection({ studentId }: { studentId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["checkpoint-attempts", studentId],
    queryFn: () => teachersApi.studentCheckpointAttempts(studentId),
  });
  const rows = q.data ?? [];

  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-ink">Checkpoints (exámenes de nivel)</h2>
      <p className="mt-0.5 text-xs text-brand-ink/55">
        Cada intento con su puntaje y corrección pregunta a pregunta.
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-brand-line bg-white">
        {q.isLoading ? (
          <p className="p-5 text-sm text-brand-ink/55">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-brand-ink/55">Aún no ha presentado checkpoints.</p>
        ) : (
          <ul className="divide-y divide-brand-line/70">
            {rows.map((a) => {
              const open = expanded === a.id;
              const feedback = (a.answers as any)?.feedback as
                | Array<{ id: string; correct: boolean; given: string; expected?: string }>
                | undefined;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => setExpanded(open ? null : a.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left text-sm transition hover:bg-brand-cream/30"
                  >
                    <div>
                      <div className="font-semibold text-brand-ink">
                        {a.checkpoint?.module?.title ?? "Checkpoint"} · {a.checkpoint?.fromLevel} → {a.checkpoint?.toLevel}
                      </div>
                      <div className="text-xs text-brand-ink/55">
                        {new Date(a.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                        {feedback ? ` · ${feedback.filter((f) => f.correct).length}/${feedback.length} correctas` : ""}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        a.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {a.score}% · {a.passed ? "Aprobado" : "No aprobado"}
                    </span>
                  </button>
                  {open && feedback ? (
                    <div className="border-t border-brand-line/60 bg-brand-cream/20 px-4 py-3">
                      <ul className="space-y-1.5 text-sm">
                        {feedback.map((f, i) => (
                          <li key={f.id ?? i} className="rounded-xl bg-white p-2.5">
                            <span className={f.correct ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                              {f.correct ? "✓" : "✗"}
                            </span>{" "}
                            <span className="text-brand-ink">{f.given}</span>
                            {!f.correct && f.expected ? (
                              <span className="text-xs text-brand-ink/55"> · correcta: {f.expected}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : open ? (
                    <p className="border-t border-brand-line/60 bg-brand-cream/20 px-4 py-3 text-xs text-brand-ink/55">
                      Intento antiguo sin corrección detallada.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-brand-line bg-white px-4 py-2 text-center">
      <div className={`text-xl font-bold ${tone === "warn" ? "text-red-700" : "text-brand-ink"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-brand-ink/55">{label}</div>
    </div>
  );
}

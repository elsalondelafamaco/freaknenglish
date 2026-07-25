import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renderers interactivos por tipo de pregunta de checkpoint (v2).
 *
 * Todos funcionan con TAP (mobile-first): tocar para seleccionar/colocar,
 * y además soportan drag & drop nativo en desktop. Las respuestas se emiten
 * por VALOR (strings) — así el backend califica sin importar el orden en que
 * se sirvieron las opciones.
 */

export type PublicQuestion = {
  id: string;
  type: "single" | "multi" | "truefalse" | "fill" | "order" | "match" | "dragwords";
  prompt: string;
  options?: string[];
  correctCount?: number;
  items?: string[];
  lefts?: string[];
  rights?: string[];
  text?: string;
  blanks?: number;
  wordBank?: string[];
};

export function isAnswered(q: PublicQuestion, a: unknown): boolean {
  switch (q.type) {
    case "single": return typeof a === "string" && a.length > 0;
    case "multi": return Array.isArray(a) && a.length > 0;
    case "truefalse": return typeof a === "boolean";
    case "fill": return typeof a === "string" && a.trim().length > 0;
    case "order": return Array.isArray(a) && a.length === (q.items?.length ?? 0);
    case "match": return Array.isArray(a) && a.length === (q.lefts?.length ?? 0) && a.every((x) => !!x);
    case "dragwords": return Array.isArray(a) && a.length === (q.blanks ?? 0) && a.every((x) => !!x);
    default: return false;
  }
}

export const TYPE_LABEL: Record<PublicQuestion["type"], string> = {
  single: "Selección única",
  multi: "Selección múltiple",
  truefalse: "Verdadero o falso",
  fill: "Completar la frase",
  order: "Ordenar",
  match: "Emparejar",
  dragwords: "Arrastrar palabras",
};

export function QuestionBody({
  q,
  value,
  onChange,
}: {
  q: PublicQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (q.type) {
    case "single": return <SingleQ q={q} value={value as string} onChange={onChange} />;
    case "multi": return <MultiQ q={q} value={(value as string[]) ?? []} onChange={onChange} />;
    case "truefalse": return <TrueFalseQ value={value as boolean | undefined} onChange={onChange} />;
    case "fill": return <FillQ value={(value as string) ?? ""} onChange={onChange} />;
    case "order": return <OrderQ q={q} value={value as string[] | undefined} onChange={onChange} />;
    case "match": return <MatchQ q={q} value={(value as (string | null)[]) ?? []} onChange={onChange} />;
    case "dragwords": return <DragWordsQ q={q} value={(value as (string | null)[]) ?? []} onChange={onChange} />;
    default: return <p className="text-sm text-red-600">Tipo de pregunta no soportado.</p>;
  }
}

/* ── Selección única ─────────────────────────────────────────────────── */
function SingleQ({ q, value, onChange }: { q: PublicQuestion; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {(q.options ?? []).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-2xl border px-4 py-3 text-left text-sm transition active:scale-[0.99]",
            value === opt
              ? "border-brand-ink bg-brand-ink text-white shadow-soft"
              : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ── Selección múltiple ──────────────────────────────────────────────── */
function MultiQ({ q, value, onChange }: { q: PublicQuestion; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <div>
      {q.correctCount ? (
        <p className="mb-2 text-xs text-brand-ink/55">Elige {q.correctCount} opción(es).</p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        {(q.options ?? []).map((opt) => {
          const on = value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm transition active:scale-[0.99]",
                on
                  ? "border-brand-ink bg-brand-ink text-white shadow-soft"
                  : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold",
                  on ? "border-white bg-white text-brand-ink" : "border-brand-ink/30",
                )}
              >
                {on ? "✓" : ""}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Verdadero / falso ───────────────────────────────────────────────── */
function TrueFalseQ({ value, onChange }: { value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {([
        [true, "Verdadero", "✓"],
        [false, "Falso", "✗"],
      ] as const).map(([val, label, icon]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(val)}
          className={cn(
            "rounded-2xl border px-4 py-4 text-center transition active:scale-[0.98]",
            value === val
              ? val
                ? "border-emerald-500 bg-emerald-500 text-white shadow-soft"
                : "border-red-500 bg-red-500 text-white shadow-soft"
              : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40",
          )}
        >
          <div className="text-xl">{icon}</div>
          <div className="mt-0.5 text-sm font-semibold">{label}</div>
        </button>
      ))}
    </div>
  );
}

/* ── Completar escribiendo ───────────────────────────────────────────── */
function FillQ({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Escribe tu respuesta…"
      autoCapitalize="off"
      autoCorrect="off"
      className="w-full max-w-md rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm text-brand-ink focus:border-brand-ink focus:outline-none"
    />
  );
}

/* ── Ordenar (drag & drop + flechas) ─────────────────────────────────── */
function OrderQ({ q, value, onChange }: { q: PublicQuestion; value?: string[]; onChange: (v: string[]) => void }) {
  // Arranca con el orden barajado servido por el backend.
  const list = value && value.length ? value : (q.items ?? []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };

  return (
    <div>
      <p className="mb-2 text-xs text-brand-ink/55">
        Arrastra (o usa las flechas) hasta dejar todo en el orden correcto.
      </p>
      <ol className="flex flex-col gap-1.5">
        {list.map((item, i) => (
          <li
            key={item}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx != null && dragIdx !== i) move(dragIdx, i);
              setDragIdx(null);
            }}
            className={cn(
              "flex cursor-grab items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 text-sm text-brand-ink transition",
              dragIdx === i ? "border-brand-ink opacity-60" : "border-brand-line",
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-xs font-bold">
              {i + 1}
            </span>
            <GripVertical className="size-4 shrink-0 text-brand-ink/30" />
            <span className="flex-1">{item}</span>
            <span className="flex shrink-0 gap-1">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0}
                className="rounded-full p-1.5 text-brand-ink/50 hover:bg-brand-cream disabled:opacity-25" aria-label="Subir">
                <ArrowUp className="size-3.5" />
              </button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === list.length - 1}
                className="rounded-full p-1.5 text-brand-ink/50 hover:bg-brand-cream disabled:opacity-25" aria-label="Bajar">
                <ArrowDown className="size-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      {(!value || value.length === 0) ? (
        <button type="button" onClick={() => onChange([...list])}
          className="mt-2 rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white">
          Confirmar este orden
        </button>
      ) : null}
    </div>
  );
}

/* ── Emparejar (tap chip → tap casilla, o drag) ──────────────────────── */
function MatchQ({ q, value, onChange }: { q: PublicQuestion; value: (string | null)[]; onChange: (v: (string | null)[]) => void }) {
  const lefts = q.lefts ?? [];
  const slots = lefts.map((_, i) => value[i] ?? null);
  const used = new Set(slots.filter(Boolean) as string[]);
  const bank = (q.rights ?? []).filter((r) => !used.has(r));
  const [picked, setPicked] = useState<string | null>(null);

  const place = (i: number, chip: string | null) => {
    const next = [...slots];
    next[i] = chip;
    onChange(next);
    setPicked(null);
  };

  return (
    <div>
      <p className="mb-2 text-xs text-brand-ink/55">
        Toca una palabra del banco y luego su pareja (o arrástrala). Toca una casilla llena para soltarla.
      </p>
      <div className="flex flex-col gap-1.5">
        {lefts.map((left, i) => (
          <div key={left} className="flex items-center gap-2">
            <span className="w-2/5 min-w-0 truncate rounded-2xl bg-brand-cream/60 px-3 py-2.5 text-sm font-medium text-brand-ink">
              {left}
            </span>
            <span className="text-brand-ink/40">→</span>
            <button
              type="button"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const chip = e.dataTransfer.getData("text/freakn-chip"); if (chip) place(i, chip); }}
              onClick={() => {
                if (slots[i]) place(i, null);
                else if (picked) place(i, picked);
              }}
              className={cn(
                "flex-1 rounded-2xl border-2 border-dashed px-3 py-2.5 text-left text-sm transition",
                slots[i]
                  ? "border-brand-ink bg-brand-ink text-white"
                  : picked
                    ? "border-brand-ink/60 bg-brand-yellow/30 text-brand-ink/60"
                    : "border-brand-line bg-white text-brand-ink/40",
              )}
            >
              {slots[i] ?? (picked ? "Toca para colocar aquí" : "…")}
              {slots[i] ? <X className="ml-1.5 inline size-3 opacity-70" /> : null}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {bank.map((chip) => (
          <button
            key={chip}
            type="button"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/freakn-chip", chip)}
            onClick={() => setPicked(picked === chip ? null : chip)}
            className={cn(
              "cursor-grab rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95",
              picked === chip
                ? "border-brand-ink bg-brand-yellow text-brand-ink shadow-soft"
                : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40",
            )}
          >
            {chip}
          </button>
        ))}
        {bank.length === 0 ? <span className="text-xs text-brand-ink/45">Banco vacío — todo colocado ✓</span> : null}
      </div>
    </div>
  );
}

/* ── Arrastrar palabras a los huecos de la frase ─────────────────────── */
function DragWordsQ({ q, value, onChange }: { q: PublicQuestion; value: (string | null)[]; onChange: (v: (string | null)[]) => void }) {
  const blanks = q.blanks ?? 0;
  const slots = Array.from({ length: blanks }, (_, i) => value[i] ?? null);
  const used = new Set(slots.filter(Boolean) as string[]);
  const bank = (q.wordBank ?? []).filter((w) => !used.has(w));
  const [picked, setPicked] = useState<string | null>(null);

  const place = (i: number, chip: string | null) => {
    const next = [...slots];
    next[i] = chip;
    onChange(next);
    setPicked(null);
  };

  // Renderiza el texto intercalando los huecos {{1}}, {{2}}…
  const parts = String(q.text ?? "").split(/(\{\{\d+\}\})/g);

  return (
    <div>
      <p className="mb-2 text-xs text-brand-ink/55">
        Toca una palabra y luego el hueco donde va (o arrástrala). Toca un hueco lleno para soltarla.
      </p>
      <p className="rounded-2xl bg-brand-cream/40 px-4 py-3 text-[15px] leading-9 text-brand-ink">
        {parts.map((part, pi) => {
          const m = part.match(/^\{\{(\d+)\}\}$/);
          if (!m) return <span key={pi}>{part}</span>;
          const i = Number(m[1]) - 1;
          return (
            <button
              key={pi}
              type="button"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const chip = e.dataTransfer.getData("text/freakn-chip"); if (chip) place(i, chip); }}
              onClick={() => {
                if (slots[i]) place(i, null);
                else if (picked) place(i, picked);
              }}
              className={cn(
                "mx-1 inline-flex min-w-16 items-center justify-center rounded-xl border-2 border-dashed px-2.5 py-1 align-middle text-sm transition",
                slots[i]
                  ? "border-brand-ink bg-brand-ink font-semibold text-white"
                  : picked
                    ? "border-brand-ink/60 bg-brand-yellow/40 text-brand-ink/50"
                    : "border-brand-ink/25 bg-white text-brand-ink/35",
              )}
            >
              {slots[i] ?? i + 1}
            </button>
          );
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {bank.map((chip) => (
          <button
            key={chip}
            type="button"
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/freakn-chip", chip)}
            onClick={() => setPicked(picked === chip ? null : chip)}
            className={cn(
              "cursor-grab rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95",
              picked === chip
                ? "border-brand-ink bg-brand-yellow text-brand-ink shadow-soft"
                : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40",
            )}
          >
            {chip}
          </button>
        ))}
        {bank.length === 0 ? <span className="text-xs text-brand-ink/45">Todas las palabras colocadas ✓</span> : null}
      </div>
    </div>
  );
}

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { btnChipInk, focusRing } from "@/components/app/AppUi";
import { inputClass } from "@/components/site/AuthShell";

/** Opción tocable: elegida = relleno tinta (con check donde es una elección). */
const opcion = (on: boolean) =>
  cn(
    "min-h-12 border-2 border-brand-ink px-4 py-3 text-left text-sm font-semibold transition-colors",
    on ? "bg-brand-ink text-brand-cream dark:text-white" : "bg-white text-brand-ink hover:bg-brand-cream",
    focusRing,
  );

/** Ficha del banco de palabras: elegida = tinta. */
const ficha = (on: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-grab items-center rounded-full border-2 border-brand-ink px-4 text-sm font-bold transition-colors active:scale-95",
    on ? "bg-brand-ink text-brand-cream dark:text-white" : "bg-white text-brand-ink hover:bg-brand-cream",
    focusRing,
  );

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
          aria-pressed={value === opt}
          className={cn(opcion(value === opt), "flex items-center justify-between gap-2")}
        >
          {opt}
          {value === opt ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
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
        <p className="mb-2 text-xs text-brand-ink/70">Elige {q.correctCount} opción(es).</p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        {(q.options ?? []).map((opt) => {
          const on = value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              aria-pressed={on}
              className={cn(opcion(on), "flex items-center gap-2.5")}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                  on ? "border-brand-cream bg-brand-cream text-brand-ink dark:border-white dark:bg-white" : "border-brand-ink",
                )}
              >
                {on ? <Check className="size-3.5" /> : null}
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
        [true, "Verdadero", Check],
        [false, "Falso", X],
      ] as const).map(([val, label, Icon]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(val)}
          aria-pressed={value === val}
          className={cn(opcion(value === val), "flex flex-col items-center py-4 text-center")}
        >
          <Icon className="size-5" aria-hidden="true" />
          <div className="mt-0.5 text-sm font-bold">{label}</div>
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
      aria-label="Tu respuesta"
      className={cn(inputClass, "max-w-md")}
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
      <p className="mb-2 text-xs text-brand-ink/70">
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
              "flex cursor-grab items-center gap-2 border-2 border-brand-ink bg-white px-3 py-1.5 text-sm text-brand-ink transition",
              dragIdx === i ? "opacity-60" : "",
            )}
          >
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-ink text-xs font-extrabold">
              {i + 1}
            </span>
            <GripVertical className="size-4 shrink-0 text-brand-ink/60" aria-hidden="true" />
            <span className="flex-1 font-semibold">{item}</span>
            <span className="flex shrink-0 gap-1">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0}
                className={cn("inline-flex size-11 items-center justify-center rounded-full text-brand-ink hover:bg-brand-cream disabled:opacity-30", focusRing)} aria-label={`Subir: ${item}`}>
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === list.length - 1}
                className={cn("inline-flex size-11 items-center justify-center rounded-full text-brand-ink hover:bg-brand-cream disabled:opacity-30", focusRing)} aria-label={`Bajar: ${item}`}>
                <ArrowDown className="size-4" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      {(!value || value.length === 0) ? (
        <button type="button" onClick={() => onChange([...list])}
          className={cn(btnChipInk, "mt-2")}>
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
      <p className="mb-2 text-xs text-brand-ink/70">
        Toca una palabra del banco y luego su pareja (o arrástrala). Toca una casilla llena para soltarla.
      </p>
      <div className="flex flex-col gap-1.5">
        {lefts.map((left, i) => (
          <div key={left} className="flex items-center gap-2">
            <span className="w-2/5 min-w-0 truncate border-2 border-brand-ink bg-brand-cream px-3 py-2.5 text-sm font-bold text-brand-ink">
              {left}
            </span>
            <span aria-hidden="true" className="text-brand-ink/70">→</span>
            <button
              type="button"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const chip = e.dataTransfer.getData("text/freakn-chip"); if (chip) place(i, chip); }}
              onClick={() => {
                if (slots[i]) place(i, null);
                else if (picked) place(i, picked);
              }}
              className={cn(
                "min-h-11 flex-1 border-2 border-dashed px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                slots[i]
                  ? "border-solid border-brand-ink bg-brand-ink text-brand-cream dark:text-white"
                  : picked
                    ? "border-brand-ink bg-brand-yellow-soft text-brand-ink"
                    : "border-brand-ink/60 bg-white text-brand-ink/70",
                focusRing,
              )}
            >
              {slots[i] ?? (picked ? "Toca para colocar aquí" : "…")}
              {slots[i] ? <X className="ml-1.5 inline size-3 opacity-70" aria-hidden="true" /> : null}
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
            aria-pressed={picked === chip}
            className={ficha(picked === chip)}
          >
            {chip}
          </button>
        ))}
        {bank.length === 0 ? <span className="text-xs text-brand-ink/70">Banco vacío: todo está colocado.</span> : null}
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
      <p className="mb-2 text-xs text-brand-ink/70">
        Toca una palabra y luego el hueco donde va (o arrástrala). Toca un hueco lleno para soltarla.
      </p>
      <p className="border-2 border-brand-ink bg-brand-cream px-4 py-3 text-[15px] leading-10 text-brand-ink">
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
                "mx-1 inline-flex min-h-11 min-w-16 items-center justify-center border-2 border-dashed px-2.5 py-1 align-middle text-sm transition-colors",
                slots[i]
                  ? "border-solid border-brand-ink bg-brand-ink font-bold text-brand-cream dark:text-white"
                  : picked
                    ? "border-brand-ink bg-brand-yellow-soft text-brand-ink"
                    : "border-brand-ink/60 bg-white text-brand-ink/70",
                focusRing,
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
            aria-pressed={picked === chip}
            className={ficha(picked === chip)}
          >
            {chip}
          </button>
        ))}
        {bank.length === 0 ? <span className="text-xs text-brand-ink/70">Todas las palabras están colocadas.</span> : null}
      </div>
    </div>
  );
}

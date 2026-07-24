import { useRef, useState } from "react";
import * as Y from "yjs";
import { Eraser, Pencil, Undo2 } from "lucide-react";
import { useYStrokes, strokeToSvgPath, type Stroke } from "@/lib/board/useDrawLayer";

const COLORS = ["#111827", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
const SIZES = [3, 6, 12, 20];

interface Props {
  doc: Y.Doc;
  authorId: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
}

export function DrawLayer({ doc, authorId, enabled, onToggle }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const { strokes, push, clear, undoLast } = useYStrokes(doc);

  const toPoint = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top, e.pressure || 0.5];
  };

  return (
    <>
      <div className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-col gap-2 rounded-2xl border border-brand-line bg-white p-2 shadow-soft">
        <button
          onClick={() => onToggle(!enabled)}
          className={`rounded-lg p-2 ${enabled ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:bg-brand-cream/50"}`}
          title={enabled ? "Salir de dibujo" : "Modo dibujo"}
        >
          <Pencil className="size-4" />
        </button>
        {enabled ? (
          <>
            <div className="flex flex-col gap-1">
              {COLORS.map((c) => (
                <button key={c} aria-label={c} onClick={() => setColor(c)}
                  className={`size-5 rounded-full border-2 ${color === c ? "border-brand-ink" : "border-white"}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {SIZES.map((s) => (
                <button key={s} onClick={() => setSize(s)}
                  className={`grid size-6 place-items-center rounded ${size === s ? "bg-brand-cream" : ""}`}>
                  <span className="rounded-full bg-brand-ink" style={{ width: s, height: s }} />
                </button>
              ))}
            </div>
            <button onClick={() => undoLast(authorId)}
              className="rounded-lg p-2 text-brand-ink/70 hover:bg-brand-cream/50" title="Deshacer mi último trazo">
              <Undo2 className="size-4" />
            </button>
            <button onClick={() => { if (confirm("¿Borrar todos los trazos?")) clear(); }}
              className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Borrar todo">
              <Eraser className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      <svg ref={svgRef}
        className={`absolute inset-0 z-20 h-full w-full ${enabled ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
        onPointerDown={(e) => {
          if (!enabled) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDrawing({ id: crypto.randomUUID(), color, size, authorId, points: [toPoint(e)] });
        }}
        onPointerMove={(e) => {
          if (!drawing) return;
          setDrawing({ ...drawing, points: [...drawing.points, toPoint(e)] });
        }}
        onPointerUp={() => {
          if (drawing && drawing.points.length > 1) push(drawing);
          setDrawing(null);
        }}
      >
        {strokes.map((s) => (<path key={s.id} d={strokeToSvgPath(s)} fill={s.color} />))}
        {drawing ? <path d={strokeToSvgPath(drawing)} fill={drawing.color} opacity={0.85} /> : null}
      </svg>
    </>
  );
}

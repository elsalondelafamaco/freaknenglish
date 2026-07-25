import { useRef, useState } from "react";
import * as Y from "yjs";
import { Eraser, Pencil, Trash2, Undo2 } from "lucide-react";
import { useYStrokes, strokeToSvgPath, strokeHitTest, type Stroke } from "@/lib/board/useDrawLayer";

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
  const [tool, setTool] = useState<"draw" | "erase">("draw");
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const erasing = useRef(false);
  const { strokes, push, clear, undoLast, removeByIds } = useYStrokes(doc);

  const toPoint = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top, e.pressure || 0.5];
  };

  // Radio del borrador: proporcional al tamaño de pincel elegido.
  const eraserRadius = Math.max(10, size * 2);

  const eraseAt = (e: React.PointerEvent) => {
    const [x, y] = toPoint(e);
    const hit = new Set<string>();
    for (const s of strokes) {
      if (strokeHitTest(s, x, y, eraserRadius)) hit.add(s.id);
    }
    removeByIds(hit);
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
            {/* Borrador parcial: arrastra sobre los trazos que quieras quitar */}
            <button
              onClick={() => setTool(tool === "erase" ? "draw" : "erase")}
              className={`rounded-lg p-2 ${tool === "erase" ? "bg-red-500 text-white" : "text-brand-ink/70 hover:bg-brand-cream/50"}`}
              title={tool === "erase" ? "Volver al lápiz" : "Borrador (borra trazos individuales)"}
            >
              <Eraser className="size-4" />
            </button>
            <div className="flex flex-col gap-1">
              {COLORS.map((c) => (
                <button key={c} aria-label={c} onClick={() => { setColor(c); setTool("draw"); }}
                  className={`size-5 rounded-full border-2 ${color === c && tool === "draw" ? "border-brand-ink" : "border-white"}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {SIZES.map((s) => (
                <button key={s} onClick={() => setSize(s)}
                  className={`grid size-6 place-items-center rounded ${size === s ? "bg-brand-cream" : ""}`}
                  title={tool === "erase" ? "Tamaño del borrador" : "Grosor del lápiz"}>
                  <span className="rounded-full bg-brand-ink" style={{ width: s, height: s }} />
                </button>
              ))}
            </div>
            <button onClick={() => undoLast(authorId)}
              className="rounded-lg p-2 text-brand-ink/70 hover:bg-brand-cream/50" title="Deshacer mi último trazo">
              <Undo2 className="size-4" />
            </button>
            <button onClick={() => { if (confirm("¿Borrar TODOS los trazos de la página?")) clear(); }}
              className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Borrar todo el dibujo">
              <Trash2 className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      <svg ref={svgRef}
        className={`absolute inset-0 z-20 h-full w-full ${enabled ? (tool === "erase" ? "pointer-events-auto cursor-cell" : "pointer-events-auto cursor-crosshair") : "pointer-events-none"}`}
        onPointerDown={(e) => {
          if (!enabled) return;
          try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* puntero sintético/perdido */ }
          if (tool === "erase") {
            erasing.current = true;
            eraseAt(e);
            return;
          }
          setDrawing({ id: crypto.randomUUID(), color, size, authorId, points: [toPoint(e)] });
        }}
        onPointerMove={(e) => {
          if (tool === "erase") {
            if (erasing.current) eraseAt(e);
            return;
          }
          if (!drawing) return;
          setDrawing({ ...drawing, points: [...drawing.points, toPoint(e)] });
        }}
        onPointerUp={() => {
          erasing.current = false;
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

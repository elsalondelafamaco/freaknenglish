import { useEffect, useRef, useState, useCallback } from "react";
import { getStroke } from "perfect-freehand";
import * as Y from "yjs";

export type Stroke = {
  id: string;
  color: string;
  size: number;
  points: number[][]; // [x,y,pressure]
  authorId: string;
};

export function strokeToSvgPath(stroke: Stroke): string {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: 0.55,
    smoothing: 0.6,
    streamline: 0.55,
  });
  if (!outline.length) return "";
  const d = outline.reduce(
    (acc, [x, y], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x, y, (x + x1) / 2, (y + y1) / 2);
      return acc;
    },
    ["M", outline[0][0], outline[0][1], "Q"] as any[],
  );
  d.push("Z");
  return d.join(" ");
}

export function useYStrokes(doc: Y.Doc) {
  const yArr = doc.getArray<Stroke>("strokes");
  const [strokes, setStrokes] = useState<Stroke[]>(() => yArr.toArray());
  useEffect(() => {
    // Resincroniza al cambiar de página (doc nuevo): sin esto, el estado
    // inicial conserva los trazos de la página anterior.
    setStrokes(yArr.toArray());
    const onChange = () => setStrokes(yArr.toArray());
    yArr.observe(onChange);
    return () => yArr.unobserve(onChange);
  }, [yArr]);
  const push = useCallback((s: Stroke) => yArr.push([s]), [yArr]);
  const clear = useCallback(() => yArr.delete(0, yArr.length), [yArr]);
  const undoLast = useCallback((authorId: string) => {
    for (let i = yArr.length - 1; i >= 0; i--) {
      const s = yArr.get(i);
      if (s.authorId === authorId) { yArr.delete(i, 1); break; }
    }
  }, [yArr]);
  return { strokes, push, clear, undoLast };
}

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
  /** Borra trazos individuales por id (borrador parcial). */
  const removeByIds = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    doc.transact(() => {
      for (let i = yArr.length - 1; i >= 0; i--) {
        if (ids.has(yArr.get(i).id)) yArr.delete(i, 1);
      }
    });
  }, [yArr, doc]);
  const undoLast = useCallback((authorId: string) => {
    for (let i = yArr.length - 1; i >= 0; i--) {
      const s = yArr.get(i);
      if (s.authorId === authorId) { yArr.delete(i, 1); break; }
    }
  }, [yArr]);
  return { strokes, push, clear, undoLast, removeByIds };
}

/**
 * ¿El punto (x,y) toca el trazo? Distancia a los puntos del trazo contra
 * radio del borrador + medio grosor del trazo.
 */
export function strokeHitTest(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const r = radius + stroke.size / 2;
  const r2 = r * r;
  const pts = stroke.points;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i][0] - x;
    const dy = pts[i][1] - y;
    if (dx * dx + dy * dy <= r2) return true;
    // También el segmento entre puntos consecutivos (trazos rápidos con
    // puntos separados): proyección sobre el segmento.
    if (i > 0) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1];
      const bx = pts[i][0], by = pts[i][1];
      const abx = bx - ax, aby = by - ay;
      const len2 = abx * abx + aby * aby;
      if (len2 > 0) {
        let t = ((x - ax) * abx + (y - ay) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = ax + t * abx - x;
        const py = ay + t * aby - y;
        if (px * px + py * py <= r2) return true;
      }
    }
  }
  return false;
}

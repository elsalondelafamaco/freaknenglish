import { useCallback, useEffect, useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";

/**
 * Imagen del board con manijas de tamaño y alineación, tipo Google Docs.
 *
 * La extensión `@tiptap/extension-image` de serie pinta un `<img>` pelado: se
 * inserta y ya, no se puede redimensionar ni alinear. Aquí se le agregan dos
 * atributos al nodo —`width` (px) y `align`— y un NodeView de React que los
 * edita arrastrando.
 *
 * Detalle importante para el trabajo colaborativo: mientras se arrastra NO se
 * escribe en el documento; el ancho vive en estado local y se confirma con un
 * solo `updateAttributes` al soltar. Si se escribiera en cada `pointermove`,
 * cada píxel sería una operación de Yjs viajando a todos los conectados.
 *
 * Mover la imagen dentro del texto ya lo resuelve ProseMirror: el nodo es
 * `draggable`, y el `data-drag-handle` sobre la imagen hace que se arrastre
 * agarrándola de cualquier punto.
 */

const MIN_ANCHO = 80;

export const ResizableImage = Image.extend({
  // Sin esto, ProseMirror no deja arrastrar el nodo por el documento.
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as number | null,
        parseHTML: (el) => {
          const v = el.getAttribute("width") ?? (el as HTMLElement).style?.width;
          const n = parseInt(String(v ?? ""), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) =>
          attrs.width ? { width: String(attrs.width), style: `width:${attrs.width}px` } : {},
      },
      align: {
        default: "center",
        parseHTML: (el) => (el as HTMLElement).dataset?.align ?? "center",
        renderHTML: (attrs) => ({ "data-align": attrs.align ?? "center" }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(VistaImagen);
  },
});

const ALINEACION: Record<string, string> = {
  left: "mr-auto",
  center: "mx-auto",
  right: "ml-auto",
};

function VistaImagen({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
  const editable = editor.isEditable;
  const contenedorRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Ancho "en vivo" mientras se arrastra; null = mandan los atributos del nodo.
  // El ref es la fuente de verdad (se lee y escribe de forma síncrona dentro
  // de los handlers del puntero); el state existe solo para repintar.
  const anchoRef = useRef<number | null>(null);
  const [anchoArrastre, setAnchoArrastre] = useState<number | null>(null);

  const align = (node.attrs.align as string) ?? "center";
  const ancho = anchoArrastre ?? (node.attrs.width as number | null);

  const iniciarResize = useCallback(
    (e: React.PointerEvent, lado: "izq" | "der") => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const img = imgRef.current;
      if (!img) return;

      const xInicial = e.clientX;
      const anchoInicial = img.getBoundingClientRect().width;
      const maximo = contenedorRef.current?.parentElement?.getBoundingClientRect().width ?? Infinity;
      const mover = (ev: PointerEvent) => {
        // La manija izquierda crece hacia el otro lado: se invierte el delta.
        const delta = (ev.clientX - xInicial) * (lado === "der" ? 1 : -1);
        const nuevo = Math.round(Math.min(maximo, Math.max(MIN_ANCHO, anchoInicial + delta)));
        anchoRef.current = nuevo;
        setAnchoArrastre(nuevo);
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        // Un solo cambio en el documento, ya con el tamaño final. Se lee del
        // ref porque el state todavía puede no haberse aplicado.
        const final = anchoRef.current;
        anchoRef.current = null;
        setAnchoArrastre(null);
        if (final != null) updateAttributes({ width: final });
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [editable, updateAttributes],
  );

  // Si otro usuario cambia el ancho mientras arrastramos, gana lo nuestro hasta
  // soltar; al soltar se sincroniza solo. Esto evita saltos raros a mitad del gesto.
  useEffect(() => {
    if (!selected) {
      anchoRef.current = null;
      setAnchoArrastre(null);
    }
  }, [selected]);

  const manija =
    "absolute top-1/2 z-10 h-10 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-brand-ink shadow";

  return (
    <NodeViewWrapper
      as="div"
      className={`relative my-3 flex ${align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center"}`}
    >
      <div
        ref={contenedorRef}
        className={`relative inline-block max-w-full ${ALINEACION[align] ?? "mx-auto"}`}
        style={ancho ? { width: ancho } : undefined}
      >
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ""}
          title={node.attrs.title ?? undefined}
          // Agarrar la imagen en cualquier punto la mueve por el documento.
          data-drag-handle
          draggable={editable}
          className={`block h-auto w-full max-w-full rounded-lg ${
            selected && editable ? "outline outline-2 outline-brand-ink" : ""
          } ${editable ? "cursor-move" : ""}`}
        />

        {selected && editable ? (
          <>
            <span
              className={`${manija} -left-1.5`}
              onPointerDown={(e) => iniciarResize(e, "izq")}
              role="separator"
              aria-label="Cambiar ancho"
            />
            <span
              className={`${manija} -right-1.5`}
              onPointerDown={(e) => iniciarResize(e, "der")}
              role="separator"
              aria-label="Cambiar ancho"
            />

            {/* Barra flotante: alineación, tamaño original y borrar. */}
            <div
              className="absolute -top-11 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-brand-line bg-white p-1 shadow-soft"
              contentEditable={false}
            >
              {([
                ["left", AlignLeft, "Alinear a la izquierda"],
                ["center", AlignCenter, "Centrar"],
                ["right", AlignRight, "Alinear a la derecha"],
              ] as const).map(([valor, Icono, titulo]) => (
                <button
                  key={valor}
                  type="button"
                  title={titulo}
                  onClick={() => updateAttributes({ align: valor })}
                  className={`rounded-full p-1.5 transition ${
                    align === valor ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:bg-brand-cream"
                  }`}
                >
                  <Icono className="size-3.5" />
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px bg-brand-line" />
              <button
                type="button"
                title="Tamaño original"
                onClick={() => updateAttributes({ width: null })}
                className="rounded-full px-2 py-1 text-[11px] font-semibold text-brand-ink/70 transition hover:bg-brand-cream"
              >
                100%
              </button>
              <button
                type="button"
                title="Eliminar imagen"
                onClick={() => deleteNode()}
                className="rounded-full p-1.5 text-red-600 transition hover:bg-red-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

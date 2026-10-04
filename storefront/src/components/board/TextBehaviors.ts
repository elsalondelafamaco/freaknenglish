import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Dos comportamientos de escritura del aula que TipTap no trae de fábrica.
 *
 * 1. Mayúscula al empezar una oración. Quien toma apuntes en clase escribe
 *    rápido y de corrido; corregir la primera letra a mano rompe el ritmo. Se
 *    hace al pulsar espacio, que es cuando ya se sabe que la palabra terminó, y
 *    nunca sobre código, enlaces ni correos.
 *
 * 2. Conservar el tamaño de letra al salir de una viñeta. El tamaño vive en la
 *    marca `textStyle`, y la tecla Enter sobre una viñeta VACÍA no la parte:
 *    levanta el párrafo fuera de la lista, y ese camino no arrastra ninguna
 *    marca —no hay texto de donde copiarla—. Resultado: se volvía al tamaño por
 *    defecto justo al retomar el párrafo. Aquí se recuerda el último tamaño en
 *    uso y se vuelve a dejar puesto después de salir.
 *
 * Va como plugin de ProseMirror y no como extensión de TipTap porque tiene que
 * mirar las teclas ANTES que los atajos de la lista, y porque así no hace falta
 * depender de `@tiptap/core`, que no es dependencia directa del proyecto.
 */

export const CLAVE_TEXTO = new PluginKey("freaknTextBehaviors");

/** Fin de oración: punto, cierre de interrogación/exclamación o puntos suspensivos. */
const FIN_DE_ORACION = /[.!?…](["'”’)\]]*)\s+/gu;

/** El tamaño de letra vigente en el cursor, o el del texto inmediatamente anterior. */
function tamanoEnCursor(state: EditorState): string | null {
  const { $from } = state.selection;
  const marcas = state.storedMarks ?? $from.marks();
  const propia = marcas.find((m) => m.type.name === "textStyle")?.attrs?.fontSize;
  if (propia) return propia as string;
  const anterior = $from.nodeBefore?.marks.find((m) => m.type.name === "textStyle")?.attrs?.fontSize;
  return (anterior as string) ?? null;
}

/** Un bloque de texto vacío, que es donde queda el cursor al salir de la lista. */
function enBloqueVacio(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  return empty && $from.parent.isTextblock && $from.parent.content.size === 0;
}

export function crearPluginDeTexto() {
  // Último tamaño que el usuario tenía puesto. Vive fuera del documento a
  // propósito: es estado de la sesión de escritura, no del contenido, y el
  // documento es compartido con el otro lado de la clase.
  let ultimoTamano: string | null = null;

  const recordarTamano = (state: EditorState) => {
    const t = tamanoEnCursor(state);
    if (t) ultimoTamano = t;
  };

  return new Plugin({
    key: CLAVE_TEXTO,

    view() {
      return {
        update(view: EditorView) {
          if (!enBloqueVacio(view.state)) recordarTamano(view.state);
        },
      };
    },

    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Enter") return false;
        recordarTamano(view.state);
        const tamano = ultimoTamano;
        if (!tamano) return false;

        // Se deja que Enter haga lo suyo (partir el párrafo, o salir de la
        // lista) y recién después se mira dónde quedó el cursor: solo si quedó
        // en un bloque vacío y sin tamaño se vuelve a poner el que se usaba.
        setTimeout(() => {
          const estado = view.state;
          if (!enBloqueVacio(estado)) return;
          if (tamanoEnCursor(estado)) return;
          const tipo = estado.schema.marks.textStyle;
          if (!tipo) return;
          const marcas = estado.storedMarks ?? estado.selection.$from.marks();
          view.dispatch(estado.tr.setStoredMarks([...marcas, tipo.create({ fontSize: tamano })]));
        }, 0);
        return false;
      },

      handleTextInput(view, from, to, text) {
        if (text !== " " || view.composing) return false;
        const { state } = view;
        const $from = state.doc.resolve(from);
        const bloque = $from.parent;
        if (!bloque.isTextblock || bloque.type.spec.code) return false;

        const inicio = $from.start();
        const escrito = state.doc.textBetween(inicio, from, "\n", " ");
        if (!escrito.trim()) return false;

        // Dónde empieza la oración actual: tras el último punto, o al principio
        // del bloque.
        FIN_DE_ORACION.lastIndex = 0;
        let corte = 0;
        for (const m of escrito.matchAll(FIN_DE_ORACION)) corte = (m.index ?? 0) + m[0].length;
        // Se saltan los espacios y la puntuación de apertura: en "¿que tal" la
        // primera letra de la oración es la "q", no el "¿".
        while (corte < escrito.length && /[\s¿¡"'“‘([«]/u.test(escrito[corte])) corte++;

        const letra = escrito[corte];
        if (!letra || !/\p{Ll}/u.test(letra)) return false;

        // Direcciones, correos y rutas se escriben en minúscula a propósito.
        const primeraPalabra = escrito.slice(corte).split(/\s/)[0] ?? "";
        if (/[@/:]/.test(primeraPalabra)) return false;

        const pos = inicio + corte;
        // El texto del bloque y las posiciones del documento solo coinciden si
        // no hay nodos intermedios (una imagen, un salto). Si no cuadra, se deja
        // escribir sin tocar nada.
        if (state.doc.textBetween(pos, pos + 1) !== letra) return false;

        const marcas = state.doc.resolve(pos + 1).marks();
        const tr = state.tr
          .replaceWith(pos, pos + 1, state.schema.text(letra.toUpperCase(), marcas))
          .insertText(" ", from, to);
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
  });
}

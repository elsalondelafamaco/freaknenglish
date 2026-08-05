import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { ResizableImage } from "@/components/board/ResizableImage";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, FontFamily, FontSize } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import {
  Bold, Italic, Strikethrough, Underline as UnderlineIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Quote, Code, Undo2, Redo2, Link as LinkIcon,
  Image as ImageIcon, Table as TableIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Highlighter, Palette, Download, Printer, Minus, RemoveFormatting, Indent, Outdent,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { boardsApi } from "@/lib/api/endpoints";
import { colorFor, createPageProvider, type BoardPageProvider } from "@/lib/board/yProvider";
import { DrawLayer } from "@/components/board/DrawLayer";
import { VersionHistory } from "@/components/board/VersionHistory";
import { htmlToMarkdown, downloadFile } from "@/lib/board/exportPage";

export const Route = createFileRoute("/_authenticated/boards/$boardId/pages/$pageId")({
  head: () => ({ meta: [{ title: "Board · Página" }] }),
  component: BoardPage,
});

function BoardPage() {
  const { boardId, pageId } = useParams({ from: "/_authenticated/boards/$boardId/pages/$pageId" });
  const { user } = useAuth();
  const providerRef = useRef<BoardPageProvider | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [peers, setPeers] = useState<any[]>([]);
  const [drawMode, setDrawMode] = useState(false);

  // El provider se crea y se destruye en el MISMO efecto. Antes se creaba en
  // un useMemo y se destruía en el cleanup de un efecto aparte: al desmontar y
  // remontar (React 18 lo hace en desarrollo, y basta un re-render del router
  // para provocarlo), el cleanup ejecutaba `destroy()` sobre el provider
  // memoizado —quitando los listeners del Y.Doc y del socket— pero el efecto
  // se volvía a suscribir solo a estado/presencia. Resultado: la página se veía
  // "En vivo" mientras NADA entraba ni salía; ni el texto ni los trazos
  // generaban una sola operación en el servidor.
  const [provider, setProvider] = useState<BoardPageProvider | null>(null);
  useEffect(() => {
    if (!user) return;
    const p = createPageProvider(pageId, {
      id: user.id,
      name: user.fullName ?? user.email,
      color: colorFor(user.id),
    });
    providerRef.current = p;
    const off1 = p.onStatus(setStatus);
    const off2 = p.onPresence(setPeers);
    setProvider(p);
    return () => {
      off1();
      off2();
      p.destroy();
      providerRef.current = null;
      setProvider((actual) => (actual === p ? null : actual));
    };
  }, [pageId, user?.id]);

  const editor = useEditor(
    {
      extensions: provider
        ? [
            StarterKit.configure({ undoRedo: false } as any),
            Underline,
            TextStyle,
            FontFamily,
            FontSize,
            Color,
            Highlight.configure({ multicolor: true }),
            TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
            Link.configure({ openOnClick: false, autolink: true }),
            ResizableImage.configure({ inline: false, allowBase64: false }),
            TaskList,
            TaskItem.configure({ nested: true }),
            Table.configure({ resizable: true }),
            TableRow, TableCell, TableHeader,
            Placeholder.configure({ placeholder: "Empieza a escribir…" }),
            Collaboration.configure({ document: provider.doc }),
            CollaborationCaret.configure({
              provider: { awareness: provider.awareness, doc: provider.doc } as any,
              user: {
                name: user?.fullName ?? user?.email ?? "Anon",
                color: colorFor(user?.id ?? "x"),
              },
            }),
          ]
        : [StarterKit],
      editorProps: {
        // Pegar imágenes (captura o archivo): se suben al storage y se insertan
        // como URL (no base64, para no inflar el doc colaborativo).
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (files.length === 0) return false;
          event.preventDefault();
          (async () => {
            for (const f of files) {
              try {
                const sig = await boardsApi.signUpload(boardId, { filename: f.name || `pasted-${Date.now()}.png`, contentType: f.type });
                const put = await fetch(sig.uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
                if (!put.ok) throw new Error(`Subida falló (${put.status})`);
                const { schema } = view.state;
                const node = schema.nodes.image?.create({ src: sig.publicUrl });
                if (node) view.dispatch(view.state.tr.replaceSelectionWith(node));
              } catch (e: any) {
                toast.error(e?.message ?? "No se pudo pegar la imagen");
              }
            }
          })();
          return true;
        },
        attributes: {
          class:
            "prose prose-sm sm:prose-base max-w-none min-h-[60vh] focus:outline-none text-brand-ink [&_table]:border-collapse [&_th]:border [&_th]:border-brand-line [&_th]:bg-brand-cream/40 [&_th]:p-2 [&_td]:border [&_td]:border-brand-line [&_td]:p-2 [&_img]:rounded-lg [&_img]:max-w-full",
        },
      },
    },
    [provider],
  );

  if (!user) return null;
  if (!provider || !editor) return <p className="text-sm text-brand-ink/55">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 border-b border-brand-line pb-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <Toolbar editor={editor} boardId={boardId} />
        <div className="flex items-center gap-2">
          <VersionHistory pageId={pageId} />
          <PresenceDots peers={peers} selfId={user.id} />
          <StatusPill status={status} />
        </div>
      </div>
      {/* `board-paper` mantiene la hoja en claro aunque la app esté en oscuro
          (ver styles.css): lo que ve el profe es lo mismo que ve el estudiante. */}
      <div className="board-print-area board-paper relative rounded-2xl bg-white p-4">
        <EditorContent editor={editor} />
        <DrawLayer key={pageId} doc={provider.doc} authorId={user.id} enabled={drawMode} onToggle={setDrawMode} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "connecting" | "connected" | "offline" }) {
  const cfg = {
    connecting: { c: "bg-amber-100 text-amber-800", t: "Conectando…" },
    connected: { c: "bg-emerald-100 text-emerald-800", t: "En vivo" },
    offline: { c: "bg-red-100 text-red-800", t: "Offline" },
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.c}`}>{cfg.t}</span>;
}

function PresenceDots({ peers, selfId }: { peers: any[]; selfId: string }) {
  return (
    <div className="flex -space-x-1.5">
      {peers.map((p, i) => {
        const isSelf = p.id === selfId;
        return (
          <span key={p.id + i} title={isSelf ? "Tú" : p.email ?? p.id}
            className="inline-block size-6 rounded-full border-2 border-white text-[10px] font-semibold text-white shadow"
            style={{ background: colorFor(p.id) }}>
            <span className="flex h-full w-full items-center justify-center">
              {(p.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
          </span>
        );
      })}
    </div>
  );
}

const TEXT_COLORS = ["#111827", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff"];

const FONT_FAMILIES = [
  { label: "Predeterminada", value: "" },
  { label: "Sans (Inter)", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono (Consolas)", value: "Consolas, 'Courier New', monospace" },
  { label: "Redondeada (Comic)", value: "'Comic Sans MS', 'Comic Sans', cursive" },
];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "30px", "36px"];

function Toolbar({ editor, boardId }: { editor: NonNullable<ReturnType<typeof useEditor>>; boardId: string }) {
  const btn = "rounded p-1.5 text-brand-ink/70 hover:bg-brand-cream/50 data-[active=true]:bg-brand-ink data-[active=true]:text-white";
  const sel = "rounded-md border border-brand-line bg-white px-1.5 py-1 text-xs text-brand-ink";
  const [openColor, setOpenColor] = useState(false);
  const [openHi, setOpenHi] = useState(false);
  const inTable = editor.isActive("table");

  async function uploadImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const sig = await boardsApi.signUpload(boardId, { filename: f.name, contentType: f.type });
        const put = await fetch(sig.uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
        if (!put.ok) throw new Error(`Subida falló (${put.status})`);
        editor.chain().focus().setImage({ src: sig.publicUrl }).run();
      } catch (e: any) {
        toast.error(e?.message ?? "No se pudo subir la imagen");
      }
    };
    input.click();
  }

  function addLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = prompt("URL del enlace", prev ?? "https://");
    if (url === null) return;
    if (url === "") return editor.chain().focus().extendMarkRange("link").unsetLink().run();
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
      {/* Fuente y tamaño (estilo Google Docs) */}
      <select
        className={sel}
        title="Fuente"
        value={(editor.getAttributes("textStyle").fontFamily as string) ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>{f.label}</option>
        ))}
      </select>
      <select
        className={sel}
        title="Tamaño de letra"
        value={(editor.getAttributes("textStyle").fontSize as string) ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontSize(v).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
      >
        <option value="">Tamaño</option>
        {FONT_SIZES.map((s) => (<option key={s} value={s}>{s.replace("px", "")}</option>))}
      </select>

      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} data-active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></button>

      <div className="relative">
        <button className={btn} onClick={() => { setOpenColor((v) => !v); setOpenHi(false); }}><Palette className="size-4" /></button>
        {openColor ? (
          <div className="absolute left-0 top-full z-40 mt-1 flex gap-1 rounded-lg border border-brand-line bg-white p-1 shadow">
            {TEXT_COLORS.map((c) => (
              <button key={c} className="size-5 rounded-full border border-brand-line" style={{ background: c }}
                onClick={() => { editor.chain().focus().setColor(c).run(); setOpenColor(false); }} />
            ))}
            <button className="rounded px-1.5 text-[10px]" onClick={() => { editor.chain().focus().unsetColor().run(); setOpenColor(false); }}>×</button>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button className={btn} onClick={() => { setOpenHi((v) => !v); setOpenColor(false); }}><Highlighter className="size-4" /></button>
        {openHi ? (
          <div className="absolute left-0 top-full z-40 mt-1 flex gap-1 rounded-lg border border-brand-line bg-white p-1 shadow">
            {HIGHLIGHTS.map((c) => (
              <button key={c} className="size-5 rounded-full border border-brand-line" style={{ background: c }}
                onClick={() => { editor.chain().focus().toggleHighlight({ color: c }).run(); setOpenHi(false); }} />
            ))}
            <button className="rounded px-1.5 text-[10px]" onClick={() => { editor.chain().focus().unsetHighlight().run(); setOpenHi(false); }}>×</button>
          </div>
        ) : null}
      </div>

      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} data-active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="size-4" /></button>

      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} data-active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="size-4" /></button>
      <button className={btn} data-active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="size-4" /></button>
      <button className={btn} data-active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="size-4" /></button>
      <button className={btn} data-active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className="size-4" /></button>

      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} data-active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><CheckSquare className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code className="size-4" /></button>
      <button className={btn} title="Aumentar sangría (en listas)" onClick={() => editor.chain().focus().sinkListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run()}><Indent className="size-4" /></button>
      <button className={btn} title="Reducir sangría" onClick={() => editor.chain().focus().liftListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run()}><Outdent className="size-4" /></button>
      <button className={btn} title="Línea divisoria" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="size-4" /></button>
      <button className={btn} title="Limpiar formato" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="size-4" /></button>

      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} data-active={editor.isActive("link")} onClick={addLink}><LinkIcon className="size-4" /></button>
      <button className={btn} onClick={uploadImage}><ImageIcon className="size-4" /></button>
      <button className={btn} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="size-4" /></button>
      {inTable ? (
        <span className="flex items-center gap-0.5 rounded-lg bg-brand-cream/60 px-1 py-0.5 text-[10px] font-semibold text-brand-ink/70">
          <button className="rounded px-1.5 py-1 hover:bg-white" title="Fila abajo" onClick={() => editor.chain().focus().addRowAfter().run()}>+Fila</button>
          <button className="rounded px-1.5 py-1 hover:bg-white" title="Columna a la derecha" onClick={() => editor.chain().focus().addColumnAfter().run()}>+Col</button>
          <button className="rounded px-1.5 py-1 hover:bg-white" title="Eliminar fila" onClick={() => editor.chain().focus().deleteRow().run()}>−Fila</button>
          <button className="rounded px-1.5 py-1 hover:bg-white" title="Eliminar columna" onClick={() => editor.chain().focus().deleteColumn().run()}>−Col</button>
          <button className="rounded px-1.5 py-1 hover:bg-white" title="Combinar/dividir celdas" onClick={() => editor.chain().focus().mergeOrSplit().run()}>⊞</button>
          <button className="rounded px-1.5 py-1 text-red-600 hover:bg-white" title="Eliminar tabla" onClick={() => editor.chain().focus().deleteTable().run()}>×Tabla</button>
        </span>
      ) : null}

      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} onClick={() => (editor as any).chain().focus().undo?.().run()}><Undo2 className="size-4" /></button>
      <button className={btn} onClick={() => (editor as any).chain().focus().redo?.().run()}><Redo2 className="size-4" /></button>

      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button
        className={btn}
        title="Exportar Markdown"
        onClick={() => {
          const md = htmlToMarkdown(editor.getHTML());
          downloadFile(`board-page-${Date.now()}.md`, md, "text/markdown");
        }}
      >
        <Download className="size-4" />
      </button>
      <button className={btn} title="Imprimir / PDF" onClick={() => window.print()}>
        <Printer className="size-4" />
      </button>
    </div>
  );
}

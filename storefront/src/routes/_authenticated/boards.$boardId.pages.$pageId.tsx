import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code, Undo2, Redo2, CheckSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { colorFor, createPageProvider, type BoardPageProvider } from "@/lib/board/yProvider";

export const Route = createFileRoute("/_authenticated/boards/$boardId/pages/$pageId")({
  head: () => ({ meta: [{ title: "Board · Página" }] }),
  component: BoardPage,
});

function BoardPage() {
  const { pageId } = useParams({ from: "/_authenticated/boards/$boardId/pages/$pageId" });
  const { user } = useAuth();
  const providerRef = useRef<BoardPageProvider | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [peers, setPeers] = useState<any[]>([]);

  // Recreate provider whenever pageId or user changes
  const provider = useMemo(() => {
    if (!user) return null;
    const p = createPageProvider(pageId, {
      id: user.id,
      name: user.fullName ?? user.email,
      color: colorFor(user.id),
    });
    providerRef.current = p;
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, user?.id]);

  useEffect(() => {
    if (!provider) return;
    const off1 = provider.onStatus(setStatus);
    const off2 = provider.onPresence(setPeers);
    return () => {
      off1();
      off2();
      provider.destroy();
    };
  }, [provider]);

  const editor = useEditor(
    {
      extensions: provider
        ? [
            StarterKit.configure({ undoRedo: false } as any),
            Placeholder.configure({ placeholder: "Empieza a escribir…" }),
            Collaboration.configure({ document: provider.doc }),
            CollaborationCursor.configure({
              provider: { awareness: provider.awareness } as any,
              user: {
                name: user?.fullName ?? user?.email ?? "Anon",
                color: colorFor(user?.id ?? "x"),
              },
            }),
          ]
        : [StarterKit],
      editorProps: {
        attributes: {
          class:
            "prose prose-sm sm:prose-base max-w-none min-h-[60vh] focus:outline-none text-brand-ink",
        },
      },
    },
    [provider],
  );

  if (!user) return null;
  if (!provider || !editor) return <p className="text-sm text-brand-ink/55">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line pb-3">
        <Toolbar editor={editor} />
        <div className="flex items-center gap-2">
          <PresenceDots peers={peers} selfId={user.id} />
          <StatusPill status={status} />
        </div>
      </div>
      <EditorContent editor={editor} />
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
          <span
            key={p.id + i}
            title={isSelf ? "Tú" : p.email ?? p.id}
            className="inline-block size-6 rounded-full border-2 border-white text-[10px] font-semibold text-white shadow"
            style={{ background: colorFor(p.id) }}
          >
            <span className="flex h-full w-full items-center justify-center">
              {(p.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function Toolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const btn = "rounded p-1.5 text-brand-ink/70 hover:bg-brand-cream/50 data-[active=true]:bg-brand-ink data-[active=true]:text-white";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button className={btn} data-active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></button>
      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} data-active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="size-4" /></button>
      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} data-active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><CheckSquare className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="size-4" /></button>
      <button className={btn} data-active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code className="size-4" /></button>
      <span className="mx-1 h-4 w-px bg-brand-line" />
      <button className={btn} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="size-4" /></button>
      <button className={btn} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="size-4" /></button>
    </div>
  );
}
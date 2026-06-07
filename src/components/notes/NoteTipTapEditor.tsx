import React, { useCallback, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  Bold, Italic, List, ListOrdered, CheckSquare, Heading1, Heading2,
  Table as TableIcon, Image as ImageIcon, Link as LinkIcon, Quote, Undo, Redo,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";

interface Props {
  initialContent: any;
  onChange: (doc: any) => void;
  /** Used in image upload path: `notes/{homeId}/{filename}`. */
  homeId: string;
  placeholder?: string;
}

// ─── NoteTipTapEditor ──────────────────────────────────────────────────
//
// TipTap-based rich text editor for Notes (Wave 22.0001-B). Toolbar
// covers the basics: bold / italic / headings / lists / checklists /
// tables / images / links / quote / undo / redo. Images upload to the
// existing `plant-images` bucket under `notes/{homeId}/`.

function uniqueFileName(name: string): string {
  const ext = (name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}.${ext}`;
}

async function uploadNoteImage(homeId: string, file: File): Promise<string | null> {
  try {
    const path = `notes/${homeId}/${uniqueFileName(file.name)}`;
    const { error } = await supabase.storage.from("plant-images").upload(path, file, {
      upsert: false,
      contentType: file.type || "image/png",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("plant-images").getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    Logger.error("Note image upload failed", err, { homeId });
    return null;
  }
}

function ToolbarButton({
  active, onClick, children, title, disabled,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 min-w-[32px] min-h-[32px] rounded-md inline-flex items-center justify-center transition-colors ${
        active
          ? "bg-rhozly-primary/15 text-rhozly-primary"
          : "text-rhozly-on-surface/65 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, homeId }: { editor: Editor; homeId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = await uploadNoteImage(homeId, file);
    if (url) editor.chain().focus().setImage({ src: url, alt: file.name }).run();
  }, [editor, homeId]);

  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = typeof window !== "undefined" ? window.prompt("Link URL", prev ?? "https://") : null;
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 p-1.5 bg-rhozly-surface/95 backdrop-blur border-b border-rhozly-outline/15 rounded-t-2xl">
      <ToolbarButton title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14} /></ToolbarButton>
      <ToolbarButton title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></ToolbarButton>
      <span className="mx-1 w-px h-5 bg-rhozly-outline/20" aria-hidden />
      <ToolbarButton title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolbarButton>
      <ToolbarButton title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolbarButton>
      <span className="mx-1 w-px h-5 bg-rhozly-outline/20" aria-hidden />
      <ToolbarButton title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></ToolbarButton>
      <ToolbarButton title="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><CheckSquare size={14} /></ToolbarButton>
      <span className="mx-1 w-px h-5 bg-rhozly-outline/20" aria-hidden />
      <ToolbarButton title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></ToolbarButton>
      <ToolbarButton title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={14} /></ToolbarButton>
      <ToolbarButton title="Insert image" onClick={() => fileInputRef.current?.click()}><ImageIcon size={14} /></ToolbarButton>
      <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}><LinkIcon size={14} /></ToolbarButton>
      <span className="mx-1 w-px h-5 bg-rhozly-outline/20" aria-hidden />
      <ToolbarButton title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo size={14} /></ToolbarButton>
      <ToolbarButton title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo size={14} /></ToolbarButton>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
    </div>
  );
}

export default function NoteTipTapEditor({
  initialContent,
  onChange,
  homeId,
  placeholder = "Start writing…",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: true, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent && Object.keys(initialContent).length > 0 ? initialContent : "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose max-w-none min-h-[200px] focus:outline-none px-3 py-3 [&_table]:border-collapse [&_td]:border [&_th]:border [&_td]:border-rhozly-outline/30 [&_th]:border-rhozly-outline/30 [&_td]:px-2 [&_th]:px-2 [&_td]:py-1 [&_th]:py-1 [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]_p]:m-0",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  if (!editor) return <div className="p-3 text-xs text-rhozly-on-surface/50">Loading editor…</div>;

  return (
    <div className="bg-white rounded-2xl border border-rhozly-outline/15 overflow-hidden" data-testid="note-tiptap-editor">
      <Toolbar editor={editor} homeId={homeId} />
      <EditorContent editor={editor} />
    </div>
  );
}

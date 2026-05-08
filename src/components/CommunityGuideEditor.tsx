import React, { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Underline } from "@tiptap/extension-underline";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  X,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Link as LinkIcon,
  ImageIcon,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { saveGuide, deleteGuide, type CommunityGuide, type GuidePayload } from "../hooks/useCommunityGuides";

interface Props {
  guideId?: string;
  initialData?: CommunityGuide;
  onClose(): void;
  onSaved(id: string): void;
}

export default function CommunityGuideEditor({ guideId: propGuideId, initialData, onClose, onSaved }: Props) {
  const [guideId] = useState(() => propGuideId ?? crypto.randomUUID());
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [subtitle, setSubtitle] = useState(initialData?.subtitle ?? "");
  const [labels, setLabels] = useState<string[]>(initialData?.labels ?? []);
  const [labelInput, setLabelInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAuthorId(user.id);
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your guide here…" }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialData?.body && Object.keys(initialData.body).length > 0
      ? initialData.body
      : undefined,
  });

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!authorId) return;
      if (file.size > 10 * 1024 * 1024) {
        alert("Image must be under 10 MB.");
        return;
      }
      setUploadingImage(true);
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${authorId}/${guideId}/${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("community-guides").upload(path, file);
      if (error) {
        alert("Image upload failed: " + error.message);
        setUploadingImage(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from("community-guides").getPublicUrl(path);
      editor?.chain().focus().setImage({ src: publicUrl }).run();
      setUploadingImage(false);
    },
    [authorId, guideId, editor]
  );

  const addLabel = (raw: string) => {
    const val = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (val && !labels.includes(val)) setLabels((prev) => [...prev, val]);
    setLabelInput("");
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addLabel(labelInput);
    } else if (e.key === "Backspace" && !labelInput && labels.length > 0) {
      setLabels((prev) => prev.slice(0, -1));
    }
  };

  const handleSave = async (isDraft: boolean) => {
    if (!title.trim()) {
      alert("Please add a title before saving.");
      return;
    }
    if (!authorId) return;
    setIsSaving(true);

    const payload: GuidePayload = {
      id: guideId,
      title: title.trim(),
      subtitle: subtitle.trim(),
      body: editor?.getJSON() ?? {},
      labels,
    };

    const { error } = await saveGuide(payload, isDraft, authorId);
    setIsSaving(false);
    if (error) {
      alert("Failed to save: " + error);
      return;
    }
    onSaved(guideId);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const error = await deleteGuide(guideId);
    setIsDeleting(false);
    if (error) {
      alert("Failed to delete: " + error);
      return;
    }
    onClose();
  };

  const setLink = () => {
    const url = window.prompt("Enter URL:");
    if (!url) return;
    editor?.chain().focus().setLink({ href: url }).run();
  };

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div
      data-testid="community-guide-editor"
      className="fixed inset-0 z-50 bg-rhozly-bg flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-rhozly-outline/10 shrink-0">
        <h2 className="text-sm font-black uppercase tracking-widest text-rhozly-on-surface/60">
          {initialData ? "Edit Guide" : "Write a Guide"}
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-rhozly-surface-low transition-colors text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Title */}
          <input
            data-testid="community-guide-title"
            type="text"
            placeholder="Guide title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-3xl font-black bg-transparent outline-none placeholder:text-rhozly-on-surface/20 text-rhozly-on-surface border-b border-rhozly-outline/10 pb-3 focus:border-rhozly-primary/40 transition-colors"
          />

          {/* Subtitle */}
          <input
            data-testid="community-guide-subtitle"
            type="text"
            placeholder="Short subtitle (optional)…"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full text-lg font-bold bg-transparent outline-none placeholder:text-rhozly-on-surface/20 text-rhozly-on-surface/70"
          />

          {/* Labels chip input */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 block">
              Labels
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-rhozly-outline/10 focus-within:border-rhozly-primary/40 bg-rhozly-surface-lowest transition-colors min-h-[48px]">
              {labels.map((l) => (
                <span
                  key={l}
                  className="flex items-center gap-1 bg-rhozly-primary/10 text-rhozly-primary text-xs font-black px-2.5 py-1 rounded-lg"
                >
                  #{l}
                  <button
                    type="button"
                    onClick={() => setLabels(labels.filter((x) => x !== l))}
                    className="hover:text-rhozly-primary/60 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                data-testid="community-guide-labels-input"
                type="text"
                placeholder={labels.length === 0 ? "Type a label, press Enter…" : ""}
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={handleLabelKeyDown}
                onBlur={() => { if (labelInput.trim()) addLabel(labelInput); }}
                className="flex-1 min-w-[140px] bg-transparent outline-none text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30"
              />
            </div>
            <p className="text-[10px] font-bold text-rhozly-on-surface/30 mt-1">
              Press Enter or comma to add. Letters, numbers, hyphens only.
            </p>
          </div>

          {/* Tiptap toolbar */}
          <div className="sticky top-0 z-10 bg-rhozly-bg/95 backdrop-blur-sm py-2">
            <div className="flex flex-wrap gap-1 p-2 bg-rhozly-surface-low rounded-xl border border-rhozly-outline/10">
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleBold().run()}
                active={editor?.isActive("bold")}
                title="Bold"
              >
                <Bold size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                active={editor?.isActive("italic")}
                title="Italic"
              >
                <Italic size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                active={editor?.isActive("underline")}
                title="Underline"
              >
                <UnderlineIcon size={14} />
              </ToolbarBtn>
              <div className="w-px bg-rhozly-outline/20 mx-1" />
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                active={editor?.isActive("heading", { level: 1 })}
                title="Heading 1"
              >
                <Heading1 size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor?.isActive("heading", { level: 2 })}
                title="Heading 2"
              >
                <Heading2 size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                active={editor?.isActive("heading", { level: 3 })}
                title="Heading 3"
              >
                <Heading3 size={14} />
              </ToolbarBtn>
              <div className="w-px bg-rhozly-outline/20 mx-1" />
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                active={editor?.isActive("bulletList")}
                title="Bullet list"
              >
                <List size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                active={editor?.isActive("orderedList")}
                title="Ordered list"
              >
                <ListOrdered size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                active={editor?.isActive("blockquote")}
                title="Blockquote"
              >
                <Quote size={14} />
              </ToolbarBtn>
              <div className="w-px bg-rhozly-outline/20 mx-1" />
              <ToolbarBtn onClick={insertTable} title="Insert table">
                <TableIcon size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={setLink}
                active={editor?.isActive("link")}
                title="Insert link"
              >
                <LinkIcon size={14} />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => fileInputRef.current?.click()}
                title="Insert image"
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ImageIcon size={14} />
                )}
              </ToolbarBtn>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* Editor area */}
          <div className="min-h-[320px] bg-white rounded-2xl border border-rhozly-outline/10 p-6 prose prose-sm max-w-none focus-within:border-rhozly-primary/30 transition-colors tiptap-editor">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="shrink-0 border-t border-rhozly-outline/10 px-4 md:px-8 py-4 bg-rhozly-bg flex items-center gap-3 flex-wrap">
        {initialData && !showDeleteConfirm && (
          <button
            data-testid="community-guide-delete-btn"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}

        {showDeleteConfirm && (
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" />
            <span className="text-xs font-bold text-red-600">Are you sure?</span>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-lg text-xs font-black bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-black bg-rhozly-surface-low text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="ml-auto flex gap-3">
          <button
            data-testid="community-guide-draft"
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl text-sm font-black border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:border-rhozly-primary/30 hover:text-rhozly-on-surface transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save Draft"}
          </button>
          <button
            data-testid="community-guide-publish"
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl text-sm font-black bg-rhozly-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSaving ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  onClick,
  active,
  title,
  disabled,
  children,
}: {
  onClick(): void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
        active
          ? "bg-rhozly-primary text-white"
          : "text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

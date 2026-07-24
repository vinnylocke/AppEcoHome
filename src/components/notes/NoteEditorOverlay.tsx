import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pin, Pencil, Trash2, Archive, Save, Loader2 } from "lucide-react";
import NoteTipTapEditor from "./NoteTipTapEditor";
import LinkTargetsPanel from "./LinkTargetsPanel";
import type { NoteWithLinks } from "../../hooks/useNotes";
import type { NoteLinkRef } from "../../lib/noteHelpers";
import { isDocEmpty, NOTE_TARGET_LABELS } from "../../lib/noteHelpers";

interface Props {
  homeId: string;
  // null = composing a brand-new note (with optional prefilled links).
  note: NoteWithLinks | null;
  initialLinks?: NoteLinkRef[];
  onClose: () => void;
  onSave: (patch: {
    title: string | null;
    content: any;
    pinned?: boolean;
    archived_at?: string | null;
    links: NoteLinkRef[];
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  /** Open in read-only View mode first (tap-to-view, #9); an Edit button flips
   *  to editing. Ignored for brand-new notes. Defaults false. */
  startInView?: boolean;
}

// ─── NoteEditorOverlay ─────────────────────────────────────────────────
//
// Modal editor — title + TipTap + links picker + pin/archive/delete.

export default function NoteEditorOverlay({
  homeId, note, initialLinks, onClose, onSave, onDelete, startInView,
}: Props) {
  const [viewing, setViewing] = useState(!!startInView && !!note);
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState<any>(note?.content ?? { type: "doc", content: [] });
  const [pinned, setPinned] = useState<boolean>(note?.pinned ?? false);
  const [links, setLinks] = useState<NoteLinkRef[]>(note?.links ?? initialLinks ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Focus trap-lite: lock body scroll while overlay is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleSave = async () => {
    if (saving) return;
    if (isDocEmpty(content) && !title.trim() && links.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim() ? title.trim() : null,
        content,
        pinned,
        links,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!note) { onClose(); return; }
    setSaving(true);
    try {
      await onSave({
        title: title.trim() ? title.trim() : null,
        content,
        pinned,
        archived_at: new Date().toISOString(),
        links,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm("Delete this note? This can't be undone.")) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-2 sm:p-4 animate-in fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) { viewing ? onClose() : handleSave(); } }}
      data-testid="note-editor-overlay"
    >
      <div className="bg-rhozly-surface w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 p-3 border-b border-rhozly-outline/10 bg-white">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={viewing}
            placeholder="Untitled note"
            className="flex-1 min-w-0 bg-transparent text-base sm:text-lg font-black text-rhozly-on-surface outline-none px-2 py-1.5"
            data-testid="note-title-input"
          />
          {viewing ? (
            <button
              type="button"
              onClick={() => setViewing(false)}
              data-testid="note-edit"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-xs font-black hover:bg-rhozly-primary/20 transition-colors"
            >
              <Pencil size={13} /> Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPinned((p) => !p)}
              title={pinned ? "Unpin" : "Pin to top"}
              aria-pressed={pinned}
              className={`p-2 rounded-lg transition-colors ${pinned ? "bg-amber-100 text-amber-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface-low"}`}
              data-testid="note-pin-toggle"
            >
              <Pin size={14} className={pinned ? "fill-current" : ""} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-rhozly-on-surface/60 hover:bg-rhozly-surface-low"
            data-testid="note-close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          <NoteTipTapEditor
            initialContent={content}
            onChange={setContent}
            homeId={homeId}
            editable={!viewing}
          />

          {viewing ? (
            links.length > 0 && (
              <div className="bg-white rounded-2xl border border-rhozly-outline/10 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-2">
                  Links
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {links.map((l) => (
                    <span
                      key={`${l.target_type}:${l.target_id}`}
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest"
                    >
                      {NOTE_TARGET_LABELS[l.target_type]}
                    </span>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="bg-white rounded-2xl border border-rhozly-outline/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-2">
                Links
              </p>
              <LinkTargetsPanel
                homeId={homeId}
                value={links}
                onChange={setLinks}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center gap-2 p-3 border-t border-rhozly-outline/10 bg-white">
          {note && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-black"
              data-testid="note-delete"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
          )}
          {!viewing && note && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/70 hover:bg-rhozly-surface-low text-xs font-black"
              data-testid="note-archive"
            >
              <Archive size={12} />
              Archive
            </button>
          )}
          {!viewing && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-xs font-black hover:opacity-95 disabled:opacity-50"
                data-testid="note-save"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

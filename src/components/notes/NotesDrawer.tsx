import React, { useState } from "react";
import { Plus, NotebookPen, Loader2, ChevronRight, Pin } from "lucide-react";
import { useNoteLinks } from "../../hooks/useNoteLinks";
import { useNotes } from "../../hooks/useNotes";
import NoteEditorOverlay from "./NoteEditorOverlay";
import type { NoteTargetType, NoteLinkRef } from "../../lib/noteHelpers";

interface Props {
  homeId: string;
  targetType: NoteTargetType;
  targetId: string | number | null | undefined;
  /** Section heading. Default "Notes". */
  heading?: string;
  /** Compact = inline section on a detail surface. Default. */
  variant?: "section" | "card";
}

// ─── NotesDrawer ───────────────────────────────────────────────────────
//
// Embeddable Notes section for entity pages — plant instance, location,
// area, plan, ailment, seed packet. Lists linked notes, lets the user
// open them, and offers a "+ New note here" CTA that prefills the link.

export default function NotesDrawer({
  homeId, targetType, targetId, heading = "Notes", variant = "section",
}: Props) {
  const targetIdStr = targetId == null ? null : String(targetId);
  const { notes, loading, reload } = useNoteLinks({ targetType, targetId });
  const { notes: allNotes, createNote, updateNote, deleteNote } = useNotes({ homeId });

  const [composing, setComposing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const openNote = allNotes.find((n) => n.id === openId) ?? null;
  const initialLinks: NoteLinkRef[] = targetIdStr
    ? [{ target_type: targetType, target_id: targetIdStr }]
    : [];

  const wrapperClass = variant === "card"
    ? "bg-white rounded-3xl border border-rhozly-outline/10 p-4 sm:p-5 shadow-sm"
    : "";

  return (
    <div className={wrapperClass} data-testid={`notes-drawer-${targetType}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/55 flex items-center gap-1.5">
          <NotebookPen size={12} className="text-rhozly-primary" />
          {heading}
          {notes.length > 0 && (
            <span className="text-rhozly-on-surface/35">({notes.length})</span>
          )}
        </h3>
        {targetIdStr && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-testid="notes-drawer-new"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:opacity-80"
          >
            <Plus size={11} /> New note
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-rhozly-on-surface/50">
          <Loader2 size={11} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && notes.length === 0 && (
        <p className="text-[11px] font-semibold text-rhozly-on-surface/45 italic">
          No notes here yet — capture observations, ideas or reminders you'll want to find from this screen.
        </p>
      )}

      <div className="space-y-1.5">
        {notes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setOpenId(n.id)}
            className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-xl bg-rhozly-surface-low/50 hover:bg-rhozly-surface-low transition-colors"
            data-testid="notes-drawer-item"
          >
            {n.cover_image_url && (
              <img
                src={n.cover_image_url}
                alt=""
                className="shrink-0 w-9 h-9 rounded-lg object-cover"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-rhozly-on-surface truncate flex items-center gap-1">
                {n.pinned && <Pin size={10} className="text-amber-600 fill-current" />}
                {n.title || "Untitled note"}
              </p>
              <p className="text-[10px] font-bold text-rhozly-on-surface/45">
                Updated {new Date(n.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
            </div>
            <ChevronRight size={12} className="text-rhozly-on-surface/30 shrink-0" />
          </button>
        ))}
      </div>

      {composing && targetIdStr && (
        <NoteEditorOverlay
          homeId={homeId}
          note={null}
          initialLinks={initialLinks}
          onClose={() => { setComposing(false); reload(); }}
          onSave={async (patch) => {
            await createNote({
              title: patch.title ?? undefined,
              content: patch.content,
              links: patch.links,
            });
          }}
        />
      )}
      {openNote && (
        <NoteEditorOverlay
          homeId={homeId}
          note={openNote}
          onClose={() => { setOpenId(null); reload(); }}
          onSave={async (patch) => {
            await updateNote(openNote.id, {
              title: patch.title,
              content: patch.content,
              pinned: patch.pinned,
              archived_at: patch.archived_at ?? null,
              links: patch.links,
            });
          }}
          onDelete={async () => { await deleteNote(openNote.id); }}
        />
      )}
    </div>
  );
}

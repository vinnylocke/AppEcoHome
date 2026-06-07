import React from "react";
import { Pin, NotebookPen } from "lucide-react";
import type { NoteWithLinks } from "../../hooks/useNotes";
import { NOTE_TARGET_LABELS, truncate } from "../../lib/noteHelpers";

interface Props {
  note: NoteWithLinks;
  onClick: () => void;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diffMs = today.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 1) return "Today";
  if (diffDays < 2) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NoteCard({ note, onClick }: Props) {
  const visibleLinks = note.links.slice(0, 3);
  const extra = note.links.length - visibleLinks.length;
  const preview = truncate(note.body_text ?? "", 140);

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="note-card"
      className="w-full text-left bg-white rounded-3xl border border-rhozly-outline/10 shadow-sm hover:shadow-md hover:border-rhozly-primary/30 transition-all overflow-hidden"
    >
      {note.cover_image_url && (
        <div className="w-full h-32 bg-rhozly-surface-low overflow-hidden">
          <img
            src={note.cover_image_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-2 mb-1">
          {note.pinned && (
            <Pin size={11} className="text-amber-600 fill-current mt-0.5 shrink-0" />
          )}
          {!note.cover_image_url && (
            <NotebookPen size={13} className="text-rhozly-primary mt-0.5 shrink-0" />
          )}
          <p className="font-black text-sm text-rhozly-on-surface leading-snug line-clamp-2 min-w-0 flex-1">
            {note.title || "Untitled note"}
          </p>
          <span className="shrink-0 text-[10px] font-bold text-rhozly-on-surface/45">
            {formatRelative(note.updated_at)}
          </span>
        </div>
        {preview && (
          <p className="text-[11px] font-semibold text-rhozly-on-surface/55 leading-snug line-clamp-3 mb-2">
            {preview}
          </p>
        )}
        {note.links.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleLinks.map((l) => (
              <span
                key={`${l.target_type}:${l.target_id}`}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-rhozly-primary/10 text-rhozly-primary text-[9px] font-black uppercase tracking-widest"
              >
                {NOTE_TARGET_LABELS[l.target_type]}
              </span>
            ))}
            {extra > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-rhozly-surface-low text-rhozly-on-surface/55 text-[9px] font-black uppercase tracking-widest">
                +{extra}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

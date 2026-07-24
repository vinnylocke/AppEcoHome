import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, NotebookPen, Loader2 } from "lucide-react";
import { useNotes, type NoteWithLinks } from "../../hooks/useNotes";
import NoteCard from "./NoteCard";
import NoteEditorOverlay from "./NoteEditorOverlay";
import { recordSignal } from "../../onboarding/signals";

interface Props {
  homeId: string;
}

// ─── NotesPage ─────────────────────────────────────────────────────────
//
// /notes — main Notes surface. Reads via useNotes, opens the editor
// overlay on tap. New-note button starts with empty content.

export default function NotesPage({ homeId }: Props) {
  const { notes, loading, error, createNote, updateNote, deleteNote, load } = useNotes({ homeId });
  const [editing, setEditing] = useState<NoteWithLinks | null>(null);
  const [composingNew, setComposingNew] = useState(false);
  const [query, setQuery] = useState("");

  // Wave 23.0001 — record that the user has been to /notes. Gates the
  // notes walkthrough (23.0003) so it only fires after a real visit.
  useEffect(() => { void recordSignal("first_notes_visit"); }, []);

  // Deep-link entry — /journal?tab=notes&open=add-note (the Capture "Add note"
  // chooser, #8) pops the new-note editor straight away. One-shot: the param is
  // stripped so refreshes don't re-open it. Mirrors GlobalJournal's ?open=add-entry.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("open") === "add-note") {
      setComposingNew(true);
      setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      (n.title ?? "").toLowerCase().includes(q)
      || (n.body_text ?? "").toLowerCase().includes(q),
    );
  }, [notes, query]);

  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 pb-24" data-testid="notes-page">
      {/* Header */}
      <header className="mb-5 flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-0.5 flex items-center gap-1.5">
            <NotebookPen size={11} className="text-rhozly-primary" />
            Notes
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-rhozly-on-surface">
            Your garden notebook
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setComposingNew(true)}
          data-testid="notes-new"
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-95 transition-opacity"
        >
          <Plus size={14} />
          New note
        </button>
      </header>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or body…"
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border border-rhozly-outline/15 outline-none focus:ring-2 focus:ring-rhozly-primary/15 text-sm"
          data-testid="notes-search"
        />
      </div>

      {/* Body */}
      {loading && notes.length === 0 && (
        <div className="flex items-center gap-2 text-rhozly-on-surface/55 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}
      {error && (
        <p className="text-sm text-rose-600 mb-3" data-testid="notes-error">
          {error} <button onClick={load} className="underline">Retry</button>
        </p>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-3xl bg-rhozly-surface-low/40 border border-rhozly-outline/10 p-6 text-center" data-testid="notes-empty">
          <p className="text-sm font-black text-rhozly-on-surface mb-1">
            {query ? `No notes match "${query}"` : "Your first note…"}
          </p>
          <p className="text-xs font-semibold text-rhozly-on-surface/60 leading-snug mb-4">
            {query
              ? "Try a different search."
              : "Jot down anything — observations, ideas, plant care reminders. Link them to plants, areas, or plans to find them again from those screens."}
          </p>
          {!query && (
            <button
              type="button"
              onClick={() => setComposingNew(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-95"
            >
              <Plus size={12} /> Start writing
            </button>
          )}
        </div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <section className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 px-1">
            Pinned
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinned.map((n) => (
              <NoteCard key={n.id} note={n} onClick={() => setEditing(n)} />
            ))}
          </div>
        </section>
      )}

      {/* All */}
      {others.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 px-1">
              All notes
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {others.map((n) => (
              <NoteCard key={n.id} note={n} onClick={() => setEditing(n)} />
            ))}
          </div>
        </section>
      )}

      {/* Editor overlay */}
      {composingNew && (
        <NoteEditorOverlay
          homeId={homeId}
          note={null}
          onClose={() => setComposingNew(false)}
          onSave={async (patch) => {
            await createNote({
              title: patch.title ?? undefined,
              content: patch.content,
              links: patch.links,
            });
          }}
        />
      )}
      {editing && (
        <NoteEditorOverlay
          homeId={homeId}
          note={editing}
          startInView
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await updateNote(editing.id, {
              title: patch.title,
              content: patch.content,
              pinned: patch.pinned,
              archived_at: patch.archived_at ?? null,
              links: patch.links,
            });
          }}
          onDelete={async () => { await deleteNote(editing.id); }}
        />
      )}
    </div>
  );
}

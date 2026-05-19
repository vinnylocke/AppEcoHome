import React, { useEffect, useState } from "react";
import { StickyNote, Loader2, Trash2, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";

interface Note {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
}

interface Props {
  shapeId: string;
  homeId: string;
}

export default function ShapeNotes({ shapeId, homeId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchNotes();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [shapeId]);

  async function fetchNotes() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("garden_shape_notes")
        .select("id, body, created_at, created_by")
        .eq("shape_id", shapeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setNotes(data ?? []);
    } catch (err) {
      Logger.error("Failed to load shape notes", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const { error } = await supabase.from("garden_shape_notes").insert({
        shape_id: shapeId,
        home_id: homeId,
        body: trimmed,
        created_by: userResp.user?.id ?? null,
      });
      if (error) throw error;
      setDraft("");
      setComposing(false);
      await fetchNotes();
    } catch (err) {
      Logger.error("Failed to add shape note", err);
      toast.error("Could not save note");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("garden_shape_notes").delete().eq("id", id);
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      Logger.error("Failed to delete shape note", err);
      toast.error("Could not delete note");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-2" data-testid="shape-notes">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest flex items-center gap-1.5">
          <StickyNote size={11} /> Notes ({notes.length})
        </p>
        {!composing && (
          <button
            data-testid="shape-notes-add-btn"
            onClick={() => setComposing(true)}
            aria-label="Add note"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-rhozly-primary hover:bg-rhozly-primary/10 transition-colors"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {composing && (
        <div className="space-y-2">
          <textarea
            data-testid="shape-notes-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What's worth remembering about this bed?"
            rows={3}
            className="w-full bg-rhozly-bg rounded-xl px-3 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary resize-none"
          />
          <div className="flex gap-2">
            <button
              data-testid="shape-notes-cancel"
              onClick={() => { setComposing(false); setDraft(""); }}
              className="flex-1 min-h-[36px] rounded-xl border border-rhozly-outline/20 text-[11px] font-black text-rhozly-on-surface/60 uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              data-testid="shape-notes-save"
              onClick={handleAdd}
              disabled={!draft.trim() || adding}
              className="flex-1 min-h-[36px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {adding && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-rhozly-on-surface/30" />
        </div>
      ) : notes.length === 0 && !composing ? (
        <p className="text-[10px] font-bold text-rhozly-on-surface/40 text-center py-2">
          No notes yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((n) => (
            <div key={n.id} className="bg-rhozly-bg rounded-xl px-3 py-2 border border-rhozly-outline/15">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-rhozly-on-surface whitespace-pre-wrap break-words flex-1 leading-snug">
                  {n.body}
                </p>
                <button
                  data-testid={`shape-note-delete-${n.id}`}
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  aria-label="Delete note"
                  className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                >
                  {deletingId === n.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
              <p className="text-[9px] font-bold text-rhozly-on-surface/40 mt-1">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

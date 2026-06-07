import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import type { NoteTargetType } from "../lib/noteHelpers";

export interface LinkedNoteRow {
  id: string;
  title: string | null;
  cover_image_url: string | null;
  updated_at: string;
  pinned: boolean;
}

interface Opts {
  targetType: NoteTargetType;
  targetId: string | number | null | undefined;
}

/**
 * Returns the notes linked to a specific entity. Used by NotesDrawer
 * on each entity page (PlantInstanceModal, AreaDetails, etc).
 *
 * `targetId` is normalised to string because plants.id is integer
 * while every other linkable target is uuid — the note_links table
 * stores both as text.
 */
export function useNoteLinks({ targetType, targetId }: Opts) {
  const [notes, setNotes] = useState<LinkedNoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const targetIdStr = targetId == null ? null : String(targetId);

  const load = useCallback(async () => {
    if (!targetIdStr) { setNotes([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("note_links")
        .select("notes(id, title, cover_image_url, updated_at, pinned, archived_at)")
        .eq("target_type", targetType)
        .eq("target_id", targetIdStr);
      if (error) throw error;
      const out: LinkedNoteRow[] = [];
      for (const row of data ?? []) {
        const n = (row as any).notes;
        if (n && !n.archived_at) {
          out.push({
            id: n.id as string,
            title: n.title as string | null,
            cover_image_url: n.cover_image_url as string | null,
            updated_at: n.updated_at as string,
            pinned: !!n.pinned,
          });
        }
      }
      out.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updated_at.localeCompare(a.updated_at);
      });
      setNotes(out);
    } catch (err: any) {
      Logger.error("Linked notes load failed", err, { targetType, targetId: targetIdStr });
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetIdStr]);

  useEffect(() => { load(); }, [load]);

  return { notes, loading, reload: load };
}

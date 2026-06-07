import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import type { NoteLinkRef, NoteTargetType } from "../lib/noteHelpers";
import { firstImageInDoc, docToPlainText } from "../lib/noteHelpers";

export interface Note {
  id: string;
  home_id: string;
  user_id: string | null;
  title: string | null;
  content: any; // TipTap JSON
  body_text: string | null;
  cover_image_url: string | null;
  pinned: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteWithLinks extends Note {
  links: NoteLinkRef[];
}

interface UseNotesOpts {
  homeId: string;
  includeArchived?: boolean;
}

export function useNotes({ homeId, includeArchived = false }: UseNotesOpts) {
  const [notes, setNotes] = useState<NoteWithLinks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!homeId) return;
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("notes")
        .select("*, note_links(target_type, target_id)")
        .eq("home_id", homeId)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!includeArchived) q = q.is("archived_at", null);
      const { data, error: err } = await q;
      if (err) throw err;
      const mapped: NoteWithLinks[] = (data ?? []).map((row: any) => ({
        ...row,
        links: (row.note_links ?? []).map((l: any) => ({
          target_type: l.target_type as NoteTargetType,
          target_id: l.target_id as string,
        })),
      }));
      setNotes(mapped);
    } catch (err: any) {
      Logger.error("Notes load failed", err, { homeId });
      setError(err?.message ?? "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [homeId, includeArchived]);

  useEffect(() => { load(); }, [load]);

  const createNote = useCallback(async (input: {
    title?: string;
    content?: any;
    links?: NoteLinkRef[];
  }): Promise<NoteWithLinks | null> => {
    if (!homeId) return null;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const content = input.content ?? { type: "doc", content: [] };
      const { data, error: err } = await supabase
        .from("notes")
        .insert({
          home_id: homeId,
          user_id: userId,
          title: input.title ?? null,
          content,
          body_text: docToPlainText(content),
          cover_image_url: firstImageInDoc(content),
        })
        .select("*")
        .single();
      if (err) throw err;
      const note = data as Note;
      if (input.links && input.links.length > 0) {
        await supabase.from("note_links").insert(
          input.links.map((l) => ({
            note_id: note.id,
            target_type: l.target_type,
            target_id: l.target_id,
          })),
        );
      }
      await load();
      return { ...note, links: input.links ?? [] };
    } catch (err: any) {
      Logger.error("Note create failed", err, { homeId }, "Couldn't create note.");
      return null;
    }
  }, [homeId, load]);

  const updateNote = useCallback(async (noteId: string, patch: {
    title?: string | null;
    content?: any;
    pinned?: boolean;
    archived_at?: string | null;
    links?: NoteLinkRef[];
  }) => {
    try {
      const updates: Record<string, unknown> = {};
      if (typeof patch.title !== "undefined") updates.title = patch.title;
      if (typeof patch.content !== "undefined") {
        updates.content = patch.content;
        updates.body_text = docToPlainText(patch.content);
        updates.cover_image_url = firstImageInDoc(patch.content);
      }
      if (typeof patch.pinned !== "undefined") updates.pinned = patch.pinned;
      if (typeof patch.archived_at !== "undefined") updates.archived_at = patch.archived_at;
      if (Object.keys(updates).length > 0) {
        const { error: err } = await supabase
          .from("notes")
          .update(updates)
          .eq("id", noteId);
        if (err) throw err;
      }
      if (typeof patch.links !== "undefined") {
        // Replace-set semantics. Delete + reinsert is simplest given
        // the unique constraint.
        await supabase.from("note_links").delete().eq("note_id", noteId);
        if (patch.links.length > 0) {
          await supabase.from("note_links").insert(
            patch.links.map((l) => ({
              note_id: noteId,
              target_type: l.target_type,
              target_id: l.target_id,
            })),
          );
        }
      }
      await load();
    } catch (err: any) {
      Logger.error("Note update failed", err, { homeId, noteId }, "Couldn't save note.");
    }
  }, [homeId, load]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      const { error: err } = await supabase.from("notes").delete().eq("id", noteId);
      if (err) throw err;
      await load();
    } catch (err: any) {
      Logger.error("Note delete failed", err, { homeId, noteId }, "Couldn't delete note.");
    }
  }, [homeId, load]);

  return { notes, loading, error, load, createNote, updateNote, deleteNote };
}

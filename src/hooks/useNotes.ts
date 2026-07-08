import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import type { NoteLinkRef, NoteTargetType } from "../lib/noteHelpers";
import { firstImageInDoc, docToPlainText } from "../lib/noteHelpers";
import { readSnapshot, writeSnapshot } from "../lib/snapshotCache";
import { insertOrQueue, updateOrQueue, deleteOrQueue } from "../lib/queuedWrite";

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

  const snapKey = includeArchived ? "notes-all" : "notes";
  const load = useCallback(async () => {
    if (!homeId) return;
    // Offline-first Phase 3: paint cached notes instantly so the Notes screen
    // opens offline.
    const cached = readSnapshot<NoteWithLinks[]>(snapKey, homeId);
    if (cached) {
      setNotes(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
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
      writeSnapshot(snapKey, homeId, mapped);
    } catch (err: any) {
      Logger.error("Notes load failed", err, { homeId });
      if (!cached) setError(err?.message ?? "Failed to load notes"); // keep cache offline
    } finally {
      setLoading(false);
    }
  }, [homeId, includeArchived, snapKey]);

  useEffect(() => { load(); }, [load]);

  const createNote = useCallback(async (input: {
    title?: string;
    content?: any;
    links?: NoteLinkRef[];
  }): Promise<NoteWithLinks | null> => {
    if (!homeId) return null;
    // Offline-first Phase 3: client-generate the note id so it inserts
    // idempotently offline and shows immediately. notes.id is a uuid.
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    const content = input.content ?? { type: "doc", content: [] };
    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const row = {
      id,
      home_id: homeId,
      user_id: userId,
      title: input.title ?? null,
      content,
      body_text: docToPlainText(content),
      cover_image_url: firstImageInDoc(content),
      pinned: false,
      archived_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const optimistic: NoteWithLinks = { ...(row as unknown as Note), links: input.links ?? [] };
    // Optimistic paint + snapshot so it survives a reopen offline.
    setNotes((prev) => {
      const next = [optimistic, ...prev];
      writeSnapshot(snapKey, homeId, next);
      return next;
    });

    const res = await insertOrQueue("notes", row, "Note");
    if (res.error) {
      // Permanent failure — roll the optimistic note back.
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        writeSnapshot(snapKey, homeId, next);
        return next;
      });
      Logger.error("Note create failed", res.error, { homeId }, "Couldn't create note.");
      return null;
    }
    if (input.links && input.links.length > 0) {
      for (const l of input.links) {
        await insertOrQueue(
          "note_links",
          { id: crypto.randomUUID(), note_id: id, target_type: l.target_type, target_id: l.target_id },
          "Note link",
        );
      }
    }
    return optimistic;
  }, [homeId, snapKey]);

  const updateNote = useCallback(async (noteId: string, patch: {
    title?: string | null;
    content?: any;
    pinned?: boolean;
    archived_at?: string | null;
    links?: NoteLinkRef[];
  }) => {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof patch.title !== "undefined") updates.title = patch.title;
    if (typeof patch.content !== "undefined") {
      updates.content = patch.content;
      updates.body_text = docToPlainText(patch.content);
      updates.cover_image_url = firstImageInDoc(patch.content);
    }
    if (typeof patch.pinned !== "undefined") updates.pinned = patch.pinned;
    if (typeof patch.archived_at !== "undefined") updates.archived_at = patch.archived_at;
    // Optimistic paint + snapshot (offline-first Phase 3).
    setNotes((prev) => {
      const next = prev
        .map((n) => (n.id === noteId ? { ...n, ...(updates as Partial<NoteWithLinks>), links: patch.links ?? n.links } : n))
        // archiving removes it from the default (non-archived) view
        .filter((n) => (includeArchived ? true : !n.archived_at));
      writeSnapshot(snapKey, homeId, next);
      return next;
    });
    if (Object.keys(updates).length > 1) {
      await updateOrQueue("notes", updates, { column: "id", value: noteId }, "Note edit");
    }
    if (typeof patch.links !== "undefined") {
      // Replace-set semantics: delete then reinsert.
      await deleteOrQueue("note_links", { column: "note_id", value: noteId }, "Note links");
      for (const l of patch.links) {
        await insertOrQueue(
          "note_links",
          { id: crypto.randomUUID(), note_id: noteId, target_type: l.target_type, target_id: l.target_id },
          "Note link",
        );
      }
    }
  }, [homeId, snapKey, includeArchived]);

  const deleteNote = useCallback(async (noteId: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      writeSnapshot(snapKey, homeId, next);
      return next;
    });
    await deleteOrQueue("notes", { column: "id", value: noteId }, "Note delete");
  }, [homeId, snapKey]);

  return { notes, loading, error, load, createNote, updateNote, deleteNote };
}

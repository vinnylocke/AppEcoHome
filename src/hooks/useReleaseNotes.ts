import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface ReleaseNoteSection {
  label: string;
  items: string[];
}

export interface ReleaseNote {
  version: string;
  major: number;
  minor: number;
  sections: ReleaseNoteSection[];
  released_at: string;
}

export function useReleaseNotes(): ReleaseNote[] {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);

  useEffect(() => {
    supabase
      .from("release_notes")
      .select("version, major, minor, sections, released_at")
      .order("released_at", { ascending: false })
      .then(({ data }) => {
        if (data) setNotes(data as ReleaseNote[]);
      });
  }, []);

  return notes;
}

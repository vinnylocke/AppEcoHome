import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * A release-note item is either a plain string or a rich object with an
 * optional "Try it →" call-to-action. The CTA renders as a button on the
 * Release Notes modal and routes the user to the relevant path.
 */
export type ReleaseNoteItem =
  | string
  | {
      text: string;
      link?: { label: string; path: string };
    };

export interface ReleaseNoteSection {
  label: string;
  items: ReleaseNoteItem[];
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

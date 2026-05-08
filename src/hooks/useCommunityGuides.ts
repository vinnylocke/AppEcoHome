import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export interface CommunityGuide {
  id: string;
  author_id: string;
  title: string;
  subtitle: string | null;
  body: object;
  labels: string[];
  star_count: number;
  comment_count: number;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  user_profiles: { display_name: string | null } | null;
}

export interface CommunityGuideComment {
  id: string;
  guide_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  user_profiles: { display_name: string | null } | null;
  replies?: CommunityGuideComment[];
}

export interface GuidePayload {
  id: string;
  title: string;
  subtitle: string;
  body: object;
  labels: string[];
}

// ── List hook ──────────────────────────────────────────────────────────────────

export function useCommunityGuides(opts: {
  sort: "latest" | "starred";
  labelFilter: string | null;
  search: string;
}) {
  const [guides, setGuides] = useState<CommunityGuide[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGuides = useCallback(async () => {
    setIsLoading(true);

    let q = supabase
      .from("community_guides")
      .select("*, user_profiles!author_id(display_name)")
      .eq("is_draft", false);

    if (opts.sort === "starred") {
      q = q.order("star_count", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false });
    }

    const { data } = await q;
    let results = (data ?? []) as CommunityGuide[];

    if (opts.labelFilter && opts.labelFilter !== "All") {
      results = results.filter((g) => g.labels.includes(opts.labelFilter!));
    }

    if (opts.search.trim()) {
      const q2 = opts.search.toLowerCase();
      results = results.filter(
        (g) =>
          g.title.toLowerCase().includes(q2) ||
          (g.subtitle ?? "").toLowerCase().includes(q2)
      );
    }

    setGuides(results);
    setIsLoading(false);
  }, [opts.sort, opts.labelFilter, opts.search]);

  useEffect(() => {
    fetchGuides();
  }, [fetchGuides]);

  return { guides, isLoading, refetch: fetchGuides };
}

// ── Single guide hook ──────────────────────────────────────────────────────────

export function useCommunityGuide(id: string | null) {
  const [guide, setGuide] = useState<CommunityGuide | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [comments, setComments] = useState<CommunityGuideComment[]>([]);

  const fetchGuide = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);

    const [{ data: { user } }, { data: guideData }, { data: starData }, { data: commentData }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("community_guides")
          .select("*, user_profiles!author_id(display_name)")
          .eq("id", id)
          .single(),
        supabase
          .from("community_guide_stars")
          .select("user_id")
          .eq("guide_id", id),
        supabase
          .from("community_guide_comments")
          .select("*, user_profiles!author_id(display_name)")
          .eq("guide_id", id)
          .order("created_at", { ascending: true }),
      ]);

    if (guideData) setGuide(guideData as CommunityGuide);

    const userId = user?.id ?? null;
    setIsStarred((starData ?? []).some((s) => s.user_id === userId));

    // Build 1-level tree: top-level first, then attach replies
    const flat = (commentData ?? []) as CommunityGuideComment[];
    const topLevel = flat
      .filter((c) => !c.parent_id)
      .map((c) => ({
        ...c,
        replies: flat.filter((r) => r.parent_id === c.id),
      }));
    setComments(topLevel);

    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    fetchGuide();
  }, [fetchGuide]);

  return { guide, isLoading, isStarred, comments, refetch: fetchGuide };
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export async function saveGuide(
  payload: GuidePayload,
  isDraft: boolean,
  authorId: string
): Promise<{ id: string; error: string | null }> {
  const { error } = await supabase.from("community_guides").upsert(
    {
      id: payload.id,
      author_id: authorId,
      title: payload.title,
      subtitle: payload.subtitle || null,
      body: payload.body,
      labels: payload.labels,
      is_draft: isDraft,
    },
    { onConflict: "id" }
  );
  return { id: payload.id, error: error?.message ?? null };
}

export async function deleteGuide(guideId: string): Promise<string | null> {
  const { error } = await supabase
    .from("community_guides")
    .delete()
    .eq("id", guideId);
  return error?.message ?? null;
}

export async function starGuide(guideId: string, userId: string): Promise<string | null> {
  const { error } = await supabase
    .from("community_guide_stars")
    .insert({ guide_id: guideId, user_id: userId });
  return error?.message ?? null;
}

export async function unstarGuide(guideId: string, userId: string): Promise<string | null> {
  const { error } = await supabase
    .from("community_guide_stars")
    .delete()
    .eq("guide_id", guideId)
    .eq("user_id", userId);
  return error?.message ?? null;
}

export async function postComment(
  guideId: string,
  body: string,
  authorId: string,
  parentId?: string
): Promise<string | null> {
  const { error } = await supabase.from("community_guide_comments").insert({
    guide_id: guideId,
    author_id: authorId,
    body,
    parent_id: parentId ?? null,
  });
  return error?.message ?? null;
}

export async function deleteComment(commentId: string): Promise<string | null> {
  const { error } = await supabase
    .from("community_guide_comments")
    .delete()
    .eq("id", commentId);
  return error?.message ?? null;
}

export async function fetchDistinctLabels(): Promise<string[]> {
  const { data } = await supabase
    .from("community_guides")
    .select("labels")
    .eq("is_draft", false);
  const set = new Set<string>();
  (data ?? []).forEach((g: { labels: string[] }) => g.labels.forEach((l) => set.add(l)));
  return Array.from(set).sort();
}

import React, { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Underline } from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  ArrowLeft,
  Star,
  MessageCircle,
  Edit3,
  Trash2,
  CornerDownRight,
  Loader2,
  Send,
  X,
} from "lucide-react";
import {
  useCommunityGuide,
  starGuide,
  unstarGuide,
  postComment,
  deleteComment,
  type CommunityGuideComment,
} from "../hooks/useCommunityGuides";

interface Props {
  guideId: string;
  currentUserId: string | null;
  onBack(): void;
  onEdit?(): void;
}

export default function CommunityGuideReader({ guideId, currentUserId, onBack, onEdit }: Props) {
  const { guide, isLoading, isStarred, comments, refetch } = useCommunityGuide(guideId);
  const [starred, setStarred] = useState<boolean | null>(null);
  const [starCount, setStarCount] = useState<number | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  const resolvedStarred = starred ?? isStarred;
  const resolvedStarCount = starCount ?? guide?.star_count ?? 0;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image,
      Link,
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: guide?.body && Object.keys(guide.body).length > 0 ? guide.body : undefined,
    editable: false,
  }, [guide?.body]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-rhozly-primary" size={32} />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="text-center py-24">
        <p className="font-bold text-rhozly-on-surface/40">Guide not found.</p>
        <button onClick={onBack} className="mt-4 text-rhozly-primary text-sm font-black">
          Go back
        </button>
      </div>
    );
  }

  const isAuthor = currentUserId === guide.author_id;
  const authorName = guide.user_profiles?.display_name ?? "Community member";
  const relativeDate = new Date(guide.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleStarToggle = async () => {
    if (!currentUserId) return;
    const nowStarred = !resolvedStarred;
    setStarred(nowStarred);
    setStarCount(resolvedStarCount + (nowStarred ? 1 : -1));
    if (nowStarred) {
      await starGuide(guideId, currentUserId);
    } else {
      await unstarGuide(guideId, currentUserId);
    }
  };

  const handleAddComment = async () => {
    if (!commentBody.trim() || !currentUserId) return;
    setSubmittingComment(true);
    await postComment(guideId, commentBody.trim(), currentUserId);
    setCommentBody("");
    setSubmittingComment(false);
    refetch();
  };

  const handleAddReply = async (parentId: string) => {
    if (!replyBody.trim() || !currentUserId) return;
    setSubmittingReply(true);
    await postComment(guideId, replyBody.trim(), currentUserId, parentId);
    setReplyBody("");
    setReplyingTo(null);
    setSubmittingReply(false);
    refetch();
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
    refetch();
  };

  return (
    <div className="max-w-3xl mx-auto pb-24 animate-in fade-in duration-300">
      {/* Nav row */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm text-sm font-bold text-rhozly-on-surface hover:bg-gray-50 transition-colors border border-rhozly-outline/10"
        >
          <ArrowLeft size={16} /> Back
        </button>
        {isAuthor && onEdit && (
          <button
            data-testid="community-guide-edit-btn"
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm text-sm font-bold text-rhozly-primary hover:bg-rhozly-primary/5 transition-colors border border-rhozly-outline/10"
          >
            <Edit3 size={14} /> Edit guide
          </button>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-rhozly-outline/10 shadow-sm overflow-hidden">
        <div className="p-6 md:p-10">
          {/* Author + date */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-full bg-rhozly-primary/10 flex items-center justify-center text-rhozly-primary font-black text-sm shrink-0">
              {authorName[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="text-sm font-black text-rhozly-on-surface">{authorName}</p>
              <p className="text-[10px] font-bold text-rhozly-on-surface/40 uppercase tracking-widest">
                {relativeDate}
              </p>
            </div>
            <span className="ml-auto text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-rhozly-primary/10 text-rhozly-primary">
              Community
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-black font-display text-rhozly-on-surface mb-3 leading-tight">
            {guide.title}
          </h1>
          {guide.subtitle && (
            <p className="text-lg font-bold text-rhozly-on-surface/50 mb-6 leading-relaxed">
              {guide.subtitle}
            </p>
          )}

          {/* Labels */}
          {guide.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-8">
              {guide.labels.map((l) => (
                <span
                  key={l}
                  className="text-xs font-black text-rhozly-primary/60 uppercase bg-rhozly-primary/5 px-2.5 py-1 rounded-lg"
                >
                  #{l}
                </span>
              ))}
            </div>
          )}

          {/* Tiptap readonly content */}
          <div className="prose prose-sm max-w-none text-rhozly-on-surface/80 tiptap-reader">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Reaction bar */}
        <div className="px-6 md:px-10 py-4 border-t border-rhozly-outline/10 flex items-center gap-4">
          <button
            data-testid="community-guide-star-btn"
            onClick={handleStarToggle}
            disabled={!currentUserId}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-colors border disabled:opacity-40 ${
              resolvedStarred
                ? "bg-amber-50 text-amber-600 border-amber-200"
                : "bg-rhozly-surface-low text-rhozly-on-surface/60 border-transparent hover:border-amber-200 hover:text-amber-500"
            }`}
          >
            <Star size={15} fill={resolvedStarred ? "currentColor" : "none"} />
            {resolvedStarCount}
          </button>
          <div className="flex items-center gap-1.5 text-sm font-bold text-rhozly-on-surface/40">
            <MessageCircle size={15} />
            {guide.comment_count}
          </div>
        </div>

        {/* Comments */}
        <div className="px-6 md:px-10 pb-8 border-t border-rhozly-outline/10 pt-6 space-y-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Comments
          </h3>

          {comments.map((comment) => (
            <CommentBlock
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              replyingTo={replyingTo}
              replyBody={replyBody}
              submittingReply={submittingReply}
              onReplyOpen={() => { setReplyingTo(comment.id); setReplyBody(""); }}
              onReplyClose={() => setReplyingTo(null)}
              onReplyBodyChange={setReplyBody}
              onReplySubmit={() => handleAddReply(comment.id)}
              onDeleteComment={handleDeleteComment}
            />
          ))}

          {comments.length === 0 && (
            <p className="text-sm font-bold text-rhozly-on-surface/30 text-center py-4">
              No comments yet — be the first!
            </p>
          )}

          {/* Add comment */}
          {currentUserId && (
            <div className="flex gap-3 mt-4">
              <textarea
                data-testid="community-guide-comment-input"
                rows={2}
                placeholder="Add a comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                className="flex-1 p-3 rounded-xl border border-rhozly-outline/10 outline-none focus:border-rhozly-primary/40 resize-none text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30 bg-rhozly-surface-lowest"
              />
              <button
                data-testid="community-guide-comment-submit"
                onClick={handleAddComment}
                disabled={!commentBody.trim() || submittingComment}
                className="self-end px-4 py-3 bg-rhozly-primary text-white rounded-xl text-sm font-black hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {submittingComment ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentBlock({
  comment,
  currentUserId,
  replyingTo,
  replyBody,
  submittingReply,
  onReplyOpen,
  onReplyClose,
  onReplyBodyChange,
  onReplySubmit,
  onDeleteComment,
}: {
  comment: CommunityGuideComment;
  currentUserId: string | null;
  replyingTo: string | null;
  replyBody: string;
  submittingReply: boolean;
  onReplyOpen(): void;
  onReplyClose(): void;
  onReplyBodyChange(v: string): void;
  onReplySubmit(): void;
  onDeleteComment(id: string): void;
}) {
  const authorName = comment.user_profiles?.display_name ?? "Member";
  const isOwn = currentUserId === comment.author_id;
  const isReplying = replyingTo === comment.id;

  return (
    <div>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-rhozly-surface flex items-center justify-center text-rhozly-on-surface/50 font-black text-xs shrink-0">
          {authorName[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-black text-rhozly-on-surface">{authorName}</span>
            <span className="text-[10px] font-bold text-rhozly-on-surface/30">
              {new Date(comment.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm font-bold text-rhozly-on-surface/80 leading-relaxed">{comment.body}</p>
          <div className="flex gap-3 mt-2">
            {currentUserId && !comment.parent_id && (
              <button
                data-testid={`comment-reply-btn-${comment.id}`}
                onClick={onReplyOpen}
                className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors flex items-center gap-1"
              >
                <CornerDownRight size={10} /> Reply
              </button>
            )}
            {isOwn && (
              <button
                data-testid={`comment-delete-${comment.id}`}
                onClick={() => onDeleteComment(comment.id)}
                className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/30 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <Trash2 size={10} /> Delete
              </button>
            )}
          </div>

          {/* Reply input */}
          {isReplying && (
            <div className="flex gap-2 mt-3">
              <textarea
                autoFocus
                rows={2}
                placeholder="Write a reply…"
                value={replyBody}
                onChange={(e) => onReplyBodyChange(e.target.value)}
                className="flex-1 p-2.5 rounded-xl border border-rhozly-outline/10 outline-none focus:border-rhozly-primary/40 resize-none text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30 bg-rhozly-surface-lowest"
              />
              <div className="flex flex-col gap-1.5 self-end">
                <button
                  onClick={onReplySubmit}
                  disabled={!replyBody.trim() || submittingReply}
                  className="px-3 py-2 bg-rhozly-primary text-white rounded-xl text-xs font-black hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {submittingReply ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                </button>
                <button
                  onClick={onReplyClose}
                  className="px-3 py-2 bg-rhozly-surface-low text-rhozly-on-surface/50 rounded-xl text-xs font-black hover:bg-rhozly-surface transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {(comment.replies ?? []).length > 0 && (
        <div className="ml-11 mt-3 space-y-3 border-l-2 border-rhozly-outline/10 pl-4">
          {(comment.replies ?? []).map((reply) => {
            const replyAuthor = reply.user_profiles?.display_name ?? "Member";
            const isOwnReply = currentUserId === reply.author_id;
            return (
              <div key={reply.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-rhozly-surface flex items-center justify-center text-rhozly-on-surface/50 font-black text-[10px] shrink-0">
                  {replyAuthor[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-black text-rhozly-on-surface">{replyAuthor}</span>
                    <span className="text-[10px] font-bold text-rhozly-on-surface/30">
                      {new Date(reply.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-rhozly-on-surface/80 leading-relaxed">{reply.body}</p>
                  {isOwnReply && (
                    <button
                      data-testid={`comment-delete-${reply.id}`}
                      onClick={() => onDeleteComment(reply.id)}
                      className="mt-1 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/30 hover:text-red-500 transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={10} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


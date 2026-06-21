import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, RotateCcw, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase";
import { IconAI } from "../constants/icons";
import ContentFeedback from "./feedback/ContentFeedback";
import { APP_HELP_SECTIONS, POPULAR_QUESTIONS } from "../data/appHelp";
import type { HelpSection } from "../data/appHelp";

const SECTION_MAP = new Map(APP_HELP_SECTIONS.map((s) => [s.id, s]));

export default function AppHelpSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setAnswer(null);
    setSections([]);
    setError(null);
    setQuestion(trimmed);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/app-help`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ question: trimmed }),
      });

      if (res.status === 429) {
        setError("You've reached your hourly question limit. Try again soon.");
        return;
      }

      const json = await res.json();
      setAnswer(json.answer ?? null);
      const resolved = (json.sectionIds as string[] ?? [])
        .map((id) => SECTION_MAP.get(id))
        .filter(Boolean) as HelpSection[];
      setSections(resolved);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setQuestion("");
    setAnswer(null);
    setSections([]);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(question);
  };

  const hasResult = answer !== null || error !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <IconAI size={18} className="text-rhozly-primary" />
          <h2 className="text-2xl font-black font-display text-rhozly-on-surface">App Help</h2>
        </div>
        <p className="text-sm font-bold text-rhozly-on-surface/50">
          Ask anything about how to use Rhozly
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          data-testid="app-help-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How do I add a recurring task?"
          disabled={loading}
          className="flex-1 min-w-0 bg-white border border-rhozly-outline/20 rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 focus:border-rhozly-primary disabled:opacity-60 transition-colors"
        />
        <button
          type="submit"
          data-testid="app-help-submit"
          disabled={loading || !question.trim()}
          className="shrink-0 w-12 h-12 flex items-center justify-center bg-rhozly-primary text-white rounded-2xl disabled:opacity-50 hover:bg-rhozly-primary/90 transition-all active:scale-95"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>

      {/* Result */}
      {hasResult && (
        <div data-testid="app-help-result" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-red-700">{error}</p>
            </div>
          ) : (
            <div className="bg-white border border-rhozly-outline/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-rhozly-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <IconAI size={14} className="text-rhozly-primary" />
                </div>
                <p className="text-sm font-bold text-rhozly-on-surface leading-relaxed">{answer}</p>
              </div>
              {answer && (
                <div className="mt-3 pt-3 border-t border-rhozly-outline/10 flex justify-end">
                  <ContentFeedback
                    surface="app-help"
                    targetKind="answer"
                    targetId={question.toLowerCase().slice(0, 200)}
                    targetLabel={question}
                    label="Did this answer your question?"
                  />
                </div>
              )}
            </div>
          )}

          {sections.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
                Related sections
              </p>
              <div className="space-y-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    data-testid={`help-section-${section.id}`}
                    onClick={() => navigate(section.route)}
                    className="w-full text-left flex items-center gap-3 p-3.5 bg-white border border-rhozly-outline/20 rounded-2xl hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-rhozly-on-surface group-hover:text-rhozly-primary transition-colors truncate">
                        {section.title}
                      </p>
                      <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 line-clamp-1">
                        {section.summary}
                      </p>
                    </div>
                    <ExternalLink size={14} className="shrink-0 text-rhozly-on-surface/30 group-hover:text-rhozly-primary transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors"
          >
            <RotateCcw size={12} />
            Ask another question
          </button>
        </div>
      )}

      {/* Popular questions — only shown before a result */}
      {!hasResult && !loading && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-3">
            Popular questions
          </p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_QUESTIONS.map((q) => (
              <button
                key={q}
                data-testid="app-help-popular"
                onClick={() => ask(q)}
                className="text-xs font-bold px-3 py-2 bg-white border border-rhozly-outline/20 rounded-full hover:border-rhozly-primary/40 hover:text-rhozly-primary hover:bg-rhozly-primary/5 transition-all text-rhozly-on-surface/70"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

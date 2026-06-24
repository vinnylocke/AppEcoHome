import React, { useEffect, useRef, useState } from "react";
import { Loader2, Send, Leaf } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface ChatMsg { role: "user" | "assistant"; content: string }

const GREETING = "Hi! I'm your head gardener. Ask me anything about your garden — what to focus on, what's missing, or what to plant where.";

const SUGGESTIONS = [
  "What should I focus on this week?",
  "What's missing from my garden?",
  "How do I get more year-round colour?",
];

export default function HeadGardenerChat({ homeId }: { homeId: string }) {
  void homeId; // grounded server-side from the signed-in user's home
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { data } = await supabase.functions.invoke("head-gardener-chat", {
        body: { messages: next.map((m) => ({ role: m.role, content: m.content })) },
      });
      const reply = (data as { reply?: string })?.reply || "Sorry, I couldn't put an answer together just now — try again in a moment.";
      setMessages((xs) => [...xs, { role: "assistant", content: reply }]);
    } catch {
      setMessages((xs) => [...xs, { role: "assistant", content: "Sorry, I couldn't reach your garden just now. Please try again." }]);
    } finally {
      setSending(false);
    }
  };

  const showSuggestions = messages.length === 1;

  return (
    <div className="flex flex-col h-[60vh]" data-testid="head-gardener-chat">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" data-testid="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-xl bg-rhozly-primary/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <Leaf size={14} className="text-rhozly-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] font-medium leading-snug whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-rhozly-primary text-white"
                  : "bg-rhozly-surface text-rhozly-on-surface/85"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-rhozly-on-surface/40 text-[13px] font-bold pl-9">
            <Loader2 size={14} className="animate-spin" /> Thinking about your garden…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {showSuggestions && (
        <div className="flex flex-wrap gap-2 py-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              data-testid={`chat-suggestion-${i}`}
              className="px-3 py-1.5 rounded-2xl bg-rhozly-surface text-rhozly-on-surface/60 hover:text-rhozly-on-surface/90 text-[12px] font-bold transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-center gap-2 pt-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          data-testid="chat-input"
          placeholder="Ask your head gardener…"
          className="flex-1 min-w-0 rounded-2xl border border-rhozly-outline/15 bg-white px-4 py-3 text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          data-testid="chat-send"
          className="shrink-0 p-3 rounded-2xl bg-rhozly-primary text-white disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

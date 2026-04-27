import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Leaf,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Sprout,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { getPlantWikiInfo } from "../lib/wikipedia";
import toast from "react-hot-toast";
import { PlantActionButtons } from "./PlantActionButtons";
import { TaskActionButtons } from "./TaskActionButtons";

interface Message {
  _key?: string;
  id?: string;
  role: "user" | "assistant";
  content: string;
  suggested_plants?: Array<{ name: string; search_query: string }>;
  suggested_tasks?: Array<any>;
  preferences_captured?: number;
}

const WELCOME_CONTENT =
  "Hello! I'm the Plant Doctor. How can I help your garden grow today?";

// Lightweight wiki info card shown per suggested plant
function ChatPlantCard({
  plant,
}: {
  plant: { name: string; search_query: string };
}) {
  const [info, setInfo] = useState<{
    extract: string | null;
    thumbnail: string | null;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getPlantWikiInfo(plant.search_query || plant.name).then(setInfo);
  }, [plant.name, plant.search_query]);

  return (
    <div className="p-2.5 rounded-xl bg-green-50 border border-green-100">
      <div className="flex items-center gap-2.5">
        {info === null ? (
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <Loader2 size={14} className="animate-spin text-green-500" />
          </div>
        ) : info.thumbnail ? (
          <img
            src={info.thumbnail}
            alt={plant.name}
            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-green-200"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-green-200 flex items-center justify-center shrink-0">
            <Sprout size={16} className="text-green-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-green-800 leading-tight">
            {plant.name}
          </p>
          {info?.extract && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-green-600 font-bold mt-0.5 hover:text-green-800 transition-colors"
            >
              {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              {expanded ? "Less" : "Learn more"}
            </button>
          )}
        </div>
      </div>
      {expanded && info?.extract && (
        <p className="mt-2 text-[11px] text-green-900/80 leading-relaxed">
          {info.extract.length > 320
            ? `${info.extract.slice(0, 320)}…`
            : info.extract}
        </p>
      )}
    </div>
  );
}

export default function PlantDoctorChat({ homeId }: { homeId: string }) {
  const { isOpen, setIsOpen, pageContext } = usePlantDoctor();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    Record<string, "positive" | "negative">
  >({});

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const keyCounter = useRef(0);
  const nextKey = () => `k${++keyCounter.current}`;

  // Resolve user ID once on mount
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Load persisted chat history from DB
  useEffect(() => {
    if (!homeId) {
      setMessages([
        { _key: nextKey(), role: "assistant", content: WELCOME_CONTENT },
      ]);
      setIsLoadingHistory(false);
      return;
    }

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setMessages([
            { _key: nextKey(), role: "assistant", content: WELCOME_CONTENT },
          ]);
          return;
        }

        const { data } = await supabase
          .from("chat_messages")
          .select(
            "id, role, content, suggested_plants, suggested_tasks, preferences_captured",
          )
          .eq("home_id", homeId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(50);

        if (!data || data.length === 0) {
          setMessages([
            { _key: nextKey(), role: "assistant", content: WELCOME_CONTENT },
          ]);
          return;
        }

        setMessages(
          data.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            suggested_plants: m.suggested_plants ?? undefined,
            suggested_tasks: m.suggested_tasks ?? undefined,
            preferences_captured: m.preferences_captured ?? 0,
          })),
        );

        // Load existing feedback for loaded messages
        const ids = data.map((m) => m.id);
        const { data: feedbackData } = await supabase
          .from("chat_feedback")
          .select("message_id, rating")
          .in("message_id", ids);

        if (feedbackData) {
          const map: Record<string, "positive" | "negative"> = {};
          for (const f of feedbackData)
            map[f.message_id] = f.rating as "positive" | "negative";
          setFeedback(map);
        }
      } catch (err) {
        setMessages([
          { _key: nextKey(), role: "assistant", content: WELCOME_CONTENT },
        ]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [homeId]);

  // Scroll to bottom on new messages or open
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleStartFresh = () => {
    setMessages([
      { _key: nextKey(), role: "assistant", content: WELCOME_CONTENT },
    ]);
  };

  const saveMessageToDB = async (
    role: "user" | "assistant",
    content: string,
    extra?: Pick<
      Message,
      "suggested_plants" | "suggested_tasks" | "preferences_captured"
    >,
  ): Promise<string | null> => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          home_id: homeId,
          user_id: userId,
          role,
          content,
          suggested_plants: extra?.suggested_plants?.length
            ? extra.suggested_plants
            : null,
          suggested_tasks: extra?.suggested_tasks?.length
            ? extra.suggested_tasks
            : null,
          preferences_captured: extra?.preferences_captured ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    } catch (err) {
      Logger.error("Failed to save chat message:", err);
      return null;
    }
  };

  const callAI = async (historyForAI: { role: string; content: string }[]) => {
    const { data, error } = await supabase.functions.invoke("plant-doctor-ai", {
      body: { messages: historyForAI, currentContext: pageContext, homeId },
    });
    if (error) throw error;
    if (!data?.reply) throw new Error("No reply received from AI");
    return data as {
      reply: string;
      suggested_plants?: Array<{ name: string; search_query: string }>;
      suggested_tasks?: Array<any>;
      preferences_captured?: number;
    };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userKey = nextKey();
    setMessages((prev) => [
      ...prev,
      { _key: userKey, role: "user", content: userText },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      const userMsgId = await saveMessageToDB("user", userText);
      if (userMsgId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._key === userKey ? { ...m, id: userMsgId } : m,
          ),
        );
      }

      // Pass last 20 turns as context to edge function
      const historyForAI = messages
        .slice(-19)
        .map((m) => ({ role: m.role, content: m.content }));
      historyForAI.push({ role: "user", content: userText });

      const data = await callAI(historyForAI);

      const assistantKey = nextKey();
      setMessages((prev) => [
        ...prev,
        {
          _key: assistantKey,
          role: "assistant",
          content: data.reply,
          suggested_plants: data.suggested_plants,
          suggested_tasks: data.suggested_tasks,
          preferences_captured: data.preferences_captured ?? 0,
        },
      ]);

      const assistantMsgId = await saveMessageToDB("assistant", data.reply, {
        suggested_plants: data.suggested_plants,
        suggested_tasks: data.suggested_tasks,
        preferences_captured: data.preferences_captured ?? 0,
      });
      if (assistantMsgId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._key === assistantKey ? { ...m, id: assistantMsgId } : m,
          ),
        );
      }
    } catch (err: any) {
      Logger.error("Plant Doctor AI Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          _key: nextKey(),
          role: "assistant",
          content:
            "Oops! My roots got tangled. I couldn't process that right now.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async (lastAssistantIdx: number) => {
    if (lastAssistantIdx === -1) return;

    const messagesWithoutLast = messages.slice(0, lastAssistantIdx);
    setMessages(messagesWithoutLast);
    setIsLoading(true);

    try {
      const historyForAI = messagesWithoutLast
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const data = await callAI(historyForAI);

      const assistantKey = nextKey();
      setMessages((prev) => [
        ...prev,
        {
          _key: assistantKey,
          role: "assistant",
          content: data.reply,
          suggested_plants: data.suggested_plants,
          suggested_tasks: data.suggested_tasks,
          preferences_captured: data.preferences_captured ?? 0,
        },
      ]);

      const assistantMsgId = await saveMessageToDB("assistant", data.reply, {
        suggested_plants: data.suggested_plants,
        suggested_tasks: data.suggested_tasks,
        preferences_captured: data.preferences_captured ?? 0,
      });
      if (assistantMsgId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._key === assistantKey ? { ...m, id: assistantMsgId } : m,
          ),
        );
      }
    } catch (err: any) {
      Logger.error("Regenerate error:", err);
      toast.error("Failed to regenerate response.");
      setMessages((prev) => [
        ...prev,
        {
          _key: nextKey(),
          role: "assistant",
          content:
            "Oops! My roots got tangled. I couldn't process that right now.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (
    msgId: string,
    rating: "positive" | "negative",
  ) => {
    if (feedback[msgId]) return;
    setFeedback((prev) => ({ ...prev, [msgId]: rating }));
    try {
      const { error } = await supabase.from("chat_feedback").insert({
        message_id: msgId,
        user_id: userId,
        rating,
      });
      if (error) throw error;
    } catch {
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
      toast.error("Failed to save feedback.");
    }
  };

  const lastAssistantIdx = messages.reduceRight(
    (found, m, i) => (found === -1 && m.role === "assistant" ? i : found),
    -1,
  );

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-rhozly-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform z-40"
      >
        <MessageSquare size={24} />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[350px] max-w-[calc(100vw-3rem)] h-[500px] bg-white rounded-[2rem] shadow-2xl border border-rhozly-outline/10 flex flex-col z-50 animate-in slide-in-from-bottom-10 overflow-hidden">
          {/* Header */}
          <div className="bg-rhozly-primary text-white p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-2 rounded-full">
                <Bot size={18} />
              </div>
              <div>
                <h3 className="font-black leading-none">Plant Doctor</h3>
                <p className="text-[10px] opacity-80 mt-0.5">
                  Context-Aware AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleStartFresh}
                title="Start Fresh"
                className="hover:bg-white/20 p-2 rounded-full transition-colors"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-2 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-rhozly-surface-lowest">
            {isLoadingHistory ? (
              <div className="flex justify-center items-center h-full">
                <Loader2
                  className="animate-spin text-rhozly-primary"
                  size={24}
                />
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => {
                  const msgKey = msg.id ?? msg._key ?? String(idx);
                  const isLastAssistant = idx === lastAssistantIdx;
                  const givenFeedback = msg.id ? feedback[msg.id] : undefined;

                  return (
                    <div
                      key={msgKey}
                      className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-600"}`}
                      >
                        {msg.role === "user" ? (
                          <User size={14} />
                        ) : (
                          <Leaf size={14} />
                        )}
                      </div>

                      <div
                        className={`p-3 rounded-2xl max-w-[85%] text-sm flex flex-col gap-2 ${msg.role === "user" ? "bg-rhozly-primary text-white rounded-tr-sm" : "bg-white border border-rhozly-outline/10 text-rhozly-on-surface rounded-tl-sm shadow-sm"}`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>

                        {msg.role === "assistant" &&
                          !!msg.preferences_captured &&
                          msg.preferences_captured > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-green-600 font-semibold opacity-70">
                              <Leaf size={10} />
                              {msg.preferences_captured === 1
                                ? "Preference noted"
                                : `${msg.preferences_captured} preferences noted`}
                            </div>
                          )}

                        {/* Wiki info cards + add-to-shed actions */}
                        {msg.suggested_plants &&
                          msg.suggested_plants.length > 0 && (
                            <div className="mt-1 space-y-2">
                              {msg.suggested_plants.map((plant, pi) => (
                                <ChatPlantCard key={pi} plant={plant} />
                              ))}
                              <div className="mt-1 pt-2 border-t border-rhozly-outline/10">
                                <PlantActionButtons
                                  plants={msg.suggested_plants}
                                  homeId={homeId}
                                />
                              </div>
                            </div>
                          )}

                        {/* Task schedule */}
                        {msg.suggested_tasks &&
                          msg.suggested_tasks.length > 0 && (
                            <div className="mt-2 pt-3 border-t border-rhozly-outline/10">
                              <TaskActionButtons
                                tasks={msg.suggested_tasks}
                                homeId={homeId}
                              />
                            </div>
                          )}

                        {/* Feedback + regenerate row (DB-saved assistant messages only) */}
                        {msg.role === "assistant" && msg.id && (
                          <div className="flex items-center gap-1 mt-1 pt-1 border-t border-rhozly-outline/5">
                            <button
                              onClick={() =>
                                handleFeedback(msg.id!, "positive")
                              }
                              disabled={!!givenFeedback}
                              title="Helpful"
                              className={`p-1.5 rounded-lg transition-colors ${givenFeedback === "positive" ? "text-green-500 bg-green-50" : "text-gray-300 hover:text-green-500 hover:bg-green-50"} disabled:cursor-default`}
                            >
                              <ThumbsUp size={12} />
                            </button>
                            <button
                              onClick={() =>
                                handleFeedback(msg.id!, "negative")
                              }
                              disabled={!!givenFeedback}
                              title="Not helpful"
                              className={`p-1.5 rounded-lg transition-colors ${givenFeedback === "negative" ? "text-red-500 bg-red-50" : "text-gray-300 hover:text-red-500 hover:bg-red-50"} disabled:cursor-default`}
                            >
                              <ThumbsDown size={12} />
                            </button>
                            {isLastAssistant && !isLoading && (
                              <button
                                onClick={() =>
                                  handleRegenerate(lastAssistantIdx)
                                }
                                title="Regenerate response"
                                className="ml-auto p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                              >
                                <RefreshCw size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                      <Leaf size={14} />
                    </div>
                    <div className="p-3 bg-white border border-rhozly-outline/10 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                      <Loader2
                        size={14}
                        className="animate-spin text-rhozly-primary"
                      />
                      <span className="text-xs font-bold text-gray-400">
                        Thinking...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={endOfMessagesRef} />
              </>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={sendMessage}
            className="p-3 bg-white border-t border-rhozly-outline/10 flex gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your garden..."
              className="flex-1 bg-rhozly-surface-low rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
              disabled={isLoading || isLoadingHistory}
            />
            <button
              type="submit"
              disabled={isLoading || isLoadingHistory || !input.trim()}
              className="bg-rhozly-primary text-white p-3 rounded-xl disabled:opacity-50 hover:bg-rhozly-primary/90 transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

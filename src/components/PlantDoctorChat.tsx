import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Bot,
  User,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Trash2,
  Camera,
  ImagePlus,
} from "lucide-react";
import { IconGrowth, IconPlant } from "../constants/icons";
import { Camera as CapCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { logEvent, EVENT } from "../events/registry";
import { getPlantWikiInfo } from "../lib/wikipedia";
import toast from "react-hot-toast";
import { PlantActionButtons } from "./PlantActionButtons";
import { TaskActionButtons } from "./TaskActionButtons";
import PlanSuggestionCard, { type PlanSuggestion } from "./chat/PlanSuggestionCard";

interface PendingImage {
  base64: string;       // raw base64 (no data-URL prefix)
  previewUrl: string;   // data-URL for display
  mimeType: string;
}

interface Message {
  _key?: string;
  id?: string;
  role: "user" | "assistant";
  content: string;
  imagePreviewUrl?: string;
  suggested_plants?: Array<{ name: string; search_query: string }>;
  suggested_tasks?: Array<any>;
  preferences_captured?: number;
  plan_suggestion?: PlanSuggestion | null;
}

const WELCOME_CONTENT =
  "Hello! I'm your Garden AI. How can I help your garden grow today?";

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
    <div className="p-2.5 rounded-xl bg-rhozly-surface-low border border-rhozly-outline/20">
      <div className="flex items-center gap-2.5">
        {info === null ? (
          <div className="w-10 h-10 rounded-lg bg-rhozly-surface border border-rhozly-outline/20 flex items-center justify-center shrink-0">
            <Loader2 size={14} className="animate-spin text-rhozly-primary" />
          </div>
        ) : info.thumbnail ? (
          <img
            src={info.thumbnail}
            alt={plant.name}
            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-rhozly-outline/20"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-rhozly-surface border border-rhozly-outline/20 flex items-center justify-center shrink-0">
            <IconGrowth size={16} className="text-rhozly-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-rhozly-on-surface leading-tight">
            {plant.name}
          </p>
          {info?.extract && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-rhozly-primary font-bold mt-0.5 hover:opacity-80 transition-opacity"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? "Less" : "Learn more"}
            </button>
          )}
        </div>
      </div>
      {expanded && info?.extract && (
        <p className="mt-2 text-[11px] text-rhozly-on-surface/80 leading-relaxed">
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
  // Set when the history fetch fails on open. Used by the inline retry
  // banner above the input. We don't wipe `messages` in that case — the
  // user's actual data is still in `chat_messages`, just unreachable
  // right now.
  const [historyLoadError, setHistoryLoadError] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    Record<string, "positive" | "negative">
  >({});

  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const scrollToNewMsgRef = useRef(false);
  const keyCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextKey = () => `k${++keyCounter.current}`;

  // Compress a File to a base64 JPEG (800px wide max, 70% quality)
  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_W = 800;
        const scale = MAX_W / img.width;
        canvas.width = MAX_W;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("No canvas context");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = reject;
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const base64 = await compressImage(file);
      setPendingImage({
        base64,
        previewUrl: `data:image/jpeg;base64,${base64}`,
        mimeType: "image/jpeg",
      });
    } catch {
      toast.error("Couldn't process that image.");
    }
  };

  const handleCameraCapture = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await CapCamera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
        });
        if (photo.base64String) {
          setPendingImage({
            base64: photo.base64String,
            previewUrl: `data:image/${photo.format};base64,${photo.base64String}`,
            mimeType: `image/${photo.format}`,
          });
        }
      } catch {
        // user cancelled — no-op
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  // Resolve user ID once on mount
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Load persisted chat history from DB. Pulled out as a stable
  // callback so the retry banner can re-fire it without re-mounting.
  const loadHistory = useCallback(async () => {
    if (!homeId) {
      setMessages([
        { _key: nextKey(), role: "assistant", content: WELCOME_CONTENT },
      ]);
      setIsLoadingHistory(false);
      setHistoryLoadError(false);
      return;
    }
    setIsLoadingHistory(true);
    setHistoryLoadError(false);
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
            "id, role, content, suggested_plants, suggested_tasks, preferences_captured, plan_suggestion",
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
            plan_suggestion: (m as any).plan_suggestion ?? null,
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
        // Network blip on cold open used to nuke the visible thread
        // ("Couldn't load your chat history. Starting fresh.") even
        // though the underlying chat_messages rows were untouched.
        // Now: leave whatever's already in `messages` alone, set a
        // non-destructive error flag, and let the user retry. The
        // welcome stub still appears on a TRUE empty thread because
        // we only seed it when `messages.length === 0`.
        Logger.error("Failed to load chat history:", err);
        setHistoryLoadError(true);
        setMessages((prev) =>
          prev.length === 0
            ? [{ _key: nextKey(), role: "assistant", content: WELCOME_CONTENT }]
            : prev,
        );
        toast.error(
          "Couldn't load your chat history — your previous messages are safe and will appear on retry.",
        );
      } finally {
        setIsLoadingHistory(false);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Scroll to bottom when chat opens
  useEffect(() => {
    if (isOpen) endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen]);

  // On new messages: scroll to TOP of AI reply so the user sees it from the start;
  // for user messages and history loads, scroll to bottom as usual.
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (scrollToNewMsgRef.current && last.role === "assistant" && lastAssistantRef.current) {
      lastAssistantRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      scrollToNewMsgRef.current = false;
    } else {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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
      "suggested_plants" | "suggested_tasks" | "preferences_captured" | "plan_suggestion"
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
          plan_suggestion: extra?.plan_suggestion ?? null,
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

  const callAI = async (
    historyForAI: { role: string; content: string }[],
    image: PendingImage | null | undefined,
    priorPlanSuggested: boolean,
  ) => {
    const { data, error } = await supabase.functions.invoke("plant-doctor-ai", {
      body: {
        messages: historyForAI,
        currentContext: pageContext,
        homeId,
        priorPlanSuggested,
        ...(image ? { imageBase64: image.base64, imageMimeType: image.mimeType } : {}),
      },
    });
    if (error) throw error;
    if (!data?.reply) throw new Error("No reply received from AI");
    return data as {
      reply: string;
      suggested_plants?: Array<{ name: string; search_query: string }>;
      suggested_tasks?: Array<any>;
      plan_suggestion?: PlanSuggestion | null;
      preferences_captured?: number;
    };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !pendingImage) || isLoading) return;

    const userText = input.trim() || (pendingImage ? "Please identify or diagnose what you see in this image." : "");
    const imageSnapshot = pendingImage;
    const userKey = nextKey();

    setMessages((prev) => [
      ...prev,
      {
        _key: userKey,
        role: "user",
        content: userText,
        imagePreviewUrl: imageSnapshot?.previewUrl,
      },
    ]);
    logEvent(EVENT.PLANT_DOCTOR_CHAT_MESSAGE, { has_image: !!imageSnapshot });
    setInput("");
    setPendingImage(null);
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

      // Tell the AI whether any prior assistant turn already proposed a
      // Plan so it can suppress emitting another (once-per-thread rule).
      const priorPlanSuggested = messages.some(
        (m) => m.role === "assistant" && !!m.plan_suggestion,
      );

      const data = await callAI(historyForAI, imageSnapshot, priorPlanSuggested);

      const assistantKey = nextKey();
      scrollToNewMsgRef.current = true;
      setMessages((prev) => [
        ...prev,
        {
          _key: assistantKey,
          role: "assistant",
          content: data.reply,
          suggested_plants: data.suggested_plants,
          suggested_tasks: data.suggested_tasks,
          preferences_captured: data.preferences_captured ?? 0,
          plan_suggestion: data.plan_suggestion ?? null,
        },
      ]);
      if (data.plan_suggestion) {
        logEvent(EVENT.PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_SHOWN, {
          plan_name: data.plan_suggestion.plan_name,
        });
      }

      const assistantMsgId = await saveMessageToDB("assistant", data.reply, {
        suggested_plants: data.suggested_plants,
        suggested_tasks: data.suggested_tasks,
        preferences_captured: data.preferences_captured ?? 0,
        plan_suggestion: data.plan_suggestion ?? null,
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

      const priorPlanSuggested = messagesWithoutLast.some(
        (m) => m.role === "assistant" && !!m.plan_suggestion,
      );

      const data = await callAI(historyForAI, null, priorPlanSuggested);

      const assistantKey = nextKey();
      scrollToNewMsgRef.current = true;
      setMessages((prev) => [
        ...prev,
        {
          _key: assistantKey,
          role: "assistant",
          content: data.reply,
          suggested_plants: data.suggested_plants,
          suggested_tasks: data.suggested_tasks,
          preferences_captured: data.preferences_captured ?? 0,
          plan_suggestion: data.plan_suggestion ?? null,
        },
      ]);
      if (data.plan_suggestion) {
        logEvent(EVENT.PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_SHOWN, {
          plan_name: data.plan_suggestion.plan_name,
        });
      }

      const assistantMsgId = await saveMessageToDB("assistant", data.reply, {
        suggested_plants: data.suggested_plants,
        suggested_tasks: data.suggested_tasks,
        preferences_captured: data.preferences_captured ?? 0,
        plan_suggestion: data.plan_suggestion ?? null,
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

  // First-visit pulse: show an attention-grabbing ring on the chat button
  // until the user has opened the chat for the first time. Stored per-device.
  const hasOpenedChat = (() => {
    try { return localStorage.getItem("rhozly_chat_opened") === "true"; } catch { return false; }
  })();
  const [showPulse, setShowPulse] = useState(!hasOpenedChat);
  useEffect(() => {
    if (isOpen && showPulse) {
      try { localStorage.setItem("rhozly_chat_opened", "true"); } catch { /* ignore */ }
      setShowPulse(false);
    }
  }, [isOpen, showPulse]);

  return (
    <>
      {/* Floating Action Button — pulsing ring on first visit */}
      <div className="fixed bottom-6 right-6 z-40">
        {showPulse && !isOpen && (
          <>
            <span className="absolute inset-0 rounded-full bg-rhozly-primary/40 animate-ping" aria-hidden="true" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow" aria-hidden="true" />
          </>
        )}
        <button
          data-testid="plant-doctor-chat-fab"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close Garden AI chat" : "Open Garden AI chat"}
          title={showPulse ? "Try the Garden AI — ask anything" : "Garden AI"}
          className="relative w-14 h-14 bg-rhozly-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform"
        >
          <MessageSquare size={24} />
        </button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[350px] md:w-[450px] max-w-[calc(100vw-3rem)] h-[500px] bg-white rounded-2xl shadow-2xl border border-rhozly-outline/10 flex flex-col z-50 animate-in slide-in-from-bottom-10 overflow-hidden">
          {/* Header */}
          <div className="bg-rhozly-primary text-white p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-2 rounded-full">
                <Bot size={18} />
              </div>
              <div>
                <h3 className="font-black leading-none">Garden AI</h3>
                <p className="text-[10px] opacity-80 mt-0.5">
                  Context-Aware AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleStartFresh}
                title="Start Fresh"
                disabled={isLoading || isLoadingHistory}
                className="hover:bg-white/20 p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            {/* History-load failure surface — non-destructive. The
                visible messages stay whatever they were (welcome stub
                on first ever open, prior thread otherwise). Retry
                refires loadHistory without touching the existing list. */}
            {historyLoadError && !isLoadingHistory && (
              <div
                data-testid="chat-history-retry-banner"
                className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
              >
                <RefreshCw size={13} className="mt-0.5 shrink-0" />
                <div className="flex-1 leading-snug">
                  <p className="font-bold">Couldn't load your earlier chat.</p>
                  <p className="mt-0.5 text-amber-800/85">
                    Your messages are safe — they'll appear once we can reach the server.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="chat-history-retry"
                  onClick={() => loadHistory()}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800 transition"
                >
                  Retry
                </button>
              </div>
            )}
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
                      ref={idx === lastAssistantIdx && msg.role === "assistant" ? lastAssistantRef : undefined}
                      className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-rhozly-surface text-rhozly-on-surface/60" : "bg-rhozly-surface-low text-rhozly-primary"}`}
                      >
                        {msg.role === "user" ? (
                          <User size={14} />
                        ) : (
                          <IconPlant size={14} />
                        )}
                      </div>

                      <div
                        className={`p-3 rounded-2xl max-w-[85%] text-sm flex flex-col gap-2 ${msg.role === "user" ? "bg-rhozly-primary text-white rounded-tr-sm" : "bg-white border border-rhozly-outline/10 text-rhozly-on-surface rounded-tl-sm shadow-sm"}`}
                      >
                        {msg.imagePreviewUrl && (
                          <img
                            src={msg.imagePreviewUrl}
                            alt="Attached photo"
                            className="w-full max-h-48 object-cover rounded-xl mb-1"
                          />
                        )}
                        <div className="whitespace-pre-wrap">{msg.content}</div>

                        {msg.role === "assistant" &&
                          !!msg.preferences_captured &&
                          msg.preferences_captured > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-rhozly-primary font-semibold opacity-70">
                              <IconPlant size={10} />
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

                        {/* Plan suggestion CTA — proactive nudge to turn
                            multi-plant research into a Planner project. */}
                        {msg.role === "assistant" && msg.plan_suggestion && (
                          <PlanSuggestionCard
                            suggestion={msg.plan_suggestion}
                            onAccept={() => setIsOpen(false)}
                          />
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
                              className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${givenFeedback === "positive" ? "text-rhozly-primary bg-rhozly-surface-low" : "text-rhozly-outline hover:text-rhozly-primary hover:bg-rhozly-surface-low"} disabled:cursor-default`}
                            >
                              <ThumbsUp size={14} />
                            </button>
                            <button
                              onClick={() =>
                                handleFeedback(msg.id!, "negative")
                              }
                              disabled={!!givenFeedback}
                              title="Not helpful"
                              className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${givenFeedback === "negative" ? "text-red-500 bg-red-50" : "text-rhozly-outline hover:text-red-500 hover:bg-red-50"} disabled:cursor-default`}
                            >
                              <ThumbsDown size={14} />
                            </button>
                            {isLastAssistant && !isLoading && (
                              <button
                                onClick={() =>
                                  handleRegenerate(lastAssistantIdx)
                                }
                                title="Regenerate response"
                                className="ml-auto p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-rhozly-outline hover:text-rhozly-primary hover:bg-rhozly-surface-low transition-colors"
                              >
                                <RefreshCw size={14} />
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
                    <div className="w-8 h-8 rounded-full bg-rhozly-surface-low text-rhozly-primary flex items-center justify-center shrink-0">
                      <IconPlant size={14} />
                    </div>
                    <div className="p-3 bg-white border border-rhozly-primary/30 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                      <Loader2
                        size={16}
                        className="animate-spin text-rhozly-primary"
                      />
                      <span className="text-sm font-bold text-rhozly-primary">
                        Thinking...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={endOfMessagesRef} />
              </>
            )}
          </div>

          {/* Image preview strip */}
          {pendingImage && (
            <div className="px-3 pt-2 bg-white border-t border-rhozly-outline/10 flex items-center gap-2">
              <div className="relative">
                <img
                  src={pendingImage.previewUrl}
                  alt="Pending attachment"
                  className="h-16 w-16 object-cover rounded-xl border border-rhozly-outline/20"
                />
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow"
                  aria-label="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
              <p className="text-xs text-rhozly-on-surface/50 font-bold">
                Image attached — ask me to identify or diagnose
              </p>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={sendMessage}
            className="p-3 bg-white border-t border-rhozly-outline/10 flex gap-2 shrink-0 items-center"
          >
            {/* Hidden file input for web */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Camera / file button */}
            <button
              type="button"
              data-testid="chat-attach-image-btn"
              onClick={handleCameraCapture}
              disabled={isLoading || isLoadingHistory}
              className="p-2.5 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-surface-low transition-colors disabled:opacity-30 shrink-0"
              title="Attach photo"
            >
              {Capacitor.isNativePlatform() ? <Camera size={20} /> : <ImagePlus size={20} />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pendingImage ? "Ask about this photo…" : "Ask about your garden…"}
              className="flex-1 bg-rhozly-surface-low rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
              disabled={isLoading || isLoadingHistory}
            />
            <button
              type="submit"
              disabled={isLoading || isLoadingHistory || (!input.trim() && !pendingImage)}
              className="bg-rhozly-primary text-white p-3 rounded-xl disabled:opacity-50 hover:bg-rhozly-primary/90 transition-colors shrink-0"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

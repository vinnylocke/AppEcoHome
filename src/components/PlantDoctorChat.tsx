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
  Images,
} from "lucide-react";
import { IconGrowth, IconPlant } from "../constants/icons";
import MicButton, { type VoiceCaptureResult } from "./chat/MicButton";
import ReadAloudButton from "./chat/ReadAloudButton";
import { recordSignal } from "../onboarding/signals";
import { useTextToSpeech } from "../hooks/useTextToSpeech";
import { Camera as CapCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { logEvent, EVENT } from "../events/registry";
import { getPlantWikiInfo } from "../lib/wikipedia";
import { sanitizeAssistantText } from "../lib/stripMarkdownImages";
import { visibleToolResults } from "../lib/visibleToolResults";
import { plantPhotoQuery } from "../lib/plantPhotoQuery";
import { Lightbox, type GalleryImage } from "./DiagnosisImageGallery";
import ImageCredit from "./credit/ImageCredit";
import { coerceImageCredit, isKnownCredit } from "../lib/imageCredit";
import toast from "react-hot-toast";
import { PlantActionButtons } from "./PlantActionButtons";
import { TaskActionButtons } from "./TaskActionButtons";
import PlanSuggestionCard, { type PlanSuggestion } from "./chat/PlanSuggestionCard";
import ToolResultCard from "./chat/ToolResultCard";
import ToolConfirmCard, {
  type PendingCall,
  type ConfirmState,
} from "./chat/ToolConfirmCard";

interface PendingImage {
  base64: string;       // raw base64 (no data-URL prefix)
  previewUrl: string;   // data-URL for display
  mimeType: string;
}

interface ToolResult {
  tool: string;
  args: any;
  summary: string;
  payload: any;
}

interface Message {
  _key?: string;
  id?: string;
  role: "user" | "assistant";
  content: string;
  imagePreviewUrl?: string;
  suggested_plants?: Array<{ name: string; search_query: string; show?: boolean }>;
  suggested_tasks?: Array<any>;
  preferences_captured?: number;
  plan_suggestion?: PlanSuggestion | null;
  /** Set on assistant messages produced by the agent (Phase 1). */
  tool_results?: ToolResult[];
  /** Phase 2 — pending tool calls awaiting user confirmation. */
  pending_tool_calls?: PendingCall[];
}

const WELCOME_CONTENT =
  "Hello! I'm your Garden AI. How can I help your garden grow today?";

// Multi-photo gallery shown when the user asks to SEE a plant. Pulls several
// licensed images (Unsplash / Pixabay / Wikipedia, with attribution) via the
// plant-image-search edge function and renders a tappable strip + shared
// Lightbox — no web-image scraping.
function ChatPlantGallery({ query, label }: { query: string; label: string }) {
  const [images, setImages] = useState<GalleryImage[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("plant-image-search", { body: { query, count: 9 } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setImages(!error && Array.isArray(data?.images) ? data.images : []);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (images === null) {
    return (
      <div className="flex gap-2 overflow-hidden" data-testid="chat-plant-gallery-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-24 h-24 rounded-xl bg-rhozly-surface animate-pulse shrink-0 border border-rhozly-outline/15"
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="w-full h-24 rounded-xl bg-rhozly-surface border border-rhozly-outline/20 flex items-center justify-center text-rhozly-on-surface/40 text-[11px] gap-1.5">
        <Images size={14} /> No photos found
      </div>
    );
  }

  return (
    <>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none" }}
        data-testid="chat-plant-gallery"
      >
        {images.map((img, i) => {
          const credit = coerceImageCredit((img as any).image_credit);
          return (
            <button
              key={img.id}
              data-testid="chat-plant-gallery-thumb"
              onClick={() => setLightboxIndex(i)}
              className="relative shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-rhozly-outline/20 hover:border-rhozly-primary/60 transition-colors"
            >
              <img src={img.thumb_url} alt={img.alt} className="w-full h-full object-cover" />
              {isKnownCredit(credit) && (
                <div
                  className="absolute bottom-0.5 right-0.5 z-[2]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ImageCredit credit={credit} variant="badge-only" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

// Lightweight wiki info card shown per suggested plant. When `plant.show` is set
// (the user asked to SEE the plant), it renders the multi-photo ChatPlantGallery
// instead of the compact thumbnail used for "you might like…" suggestions.
function ChatPlantCard({
  plant,
}: {
  plant: { name: string; search_query: string; show?: boolean };
}) {
  const [info, setInfo] = useState<{
    extract: string | null;
    thumbnail: string | null;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    getPlantWikiInfo(plant.search_query || plant.name).then(setInfo);
  }, [plant.name, plant.search_query]);

  const learnMore = info?.extract ? (
    <>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-rhozly-primary font-bold hover:opacity-80 transition-opacity"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {expanded ? "Less" : "Learn more"}
      </button>
      {expanded && (
        <p className="text-[11px] text-rhozly-on-surface/80 leading-relaxed">
          {info!.extract!.length > 320
            ? `${info!.extract!.slice(0, 320)}…`
            : info!.extract}
        </p>
      )}
    </>
  ) : null;

  // "Show me what X looks like" → prominent multi-photo gallery.
  if (plant.show) {
    return (
      <div
        className="p-2.5 rounded-xl bg-rhozly-surface-low border border-rhozly-outline/20 space-y-2"
        data-testid="chat-plant-card-show"
      >
        <p className="text-xs font-black text-rhozly-on-surface leading-tight">
          {plant.name}
        </p>
        <ChatPlantGallery query={plantPhotoQuery(plant.name, plant.search_query)} label={plant.name} />
        {learnMore}
      </div>
    );
  }

  // Default: compact suggestion card (thumbnail + name + learn more).
  return (
    <div className="p-2.5 rounded-xl bg-rhozly-surface-low border border-rhozly-outline/20">
      <div className="flex items-center gap-2.5">
        {info === null ? (
          <div className="w-10 h-10 rounded-lg bg-rhozly-surface border border-rhozly-outline/20 flex items-center justify-center shrink-0">
            <Loader2 size={14} className="animate-spin text-rhozly-primary" />
          </div>
        ) : info.thumbnail && !imgError ? (
          <img
            src={info.thumbnail}
            alt={plant.name}
            onError={() => setImgError(true)}
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
          <div className="mt-0.5">{learnMore}</div>
        </div>
      </div>
    </div>
  );
}

export default function PlantDoctorChat({ homeId }: { homeId: string }) {
  const { isOpen, setIsOpen, pageContext, setPageContext } = usePlantDoctor();

  // Wave 22.0010 — narrow `pageContext` for the chip + pre-fill logic.
  // pageContext is intentionally typed `string | object | null` upstream,
  // so we coerce defensively at every read.
  const contextPlant = (() => {
    if (!pageContext || typeof pageContext !== "object") return null;
    const plant = (pageContext as any).plant;
    if (!plant || typeof plant !== "object") return null;
    const common = typeof plant.common_name === "string" ? plant.common_name : null;
    const sci = typeof plant.scientific_name === "string" ? plant.scientific_name : null;
    const id = plant.id ?? null;
    if (!common && !sci) return null;
    return { id, common_name: common, scientific_name: sci };
  })();

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

  // Wave 22.0001-A — Voice in chat.
  // `autoReadReplies` mirrors `user_profiles.voice_settings.auto_read_assistant_replies`.
  // Loaded once on chat open; the setting itself is toggled from the
  // GardenerProfile Voice section.
  const [autoReadReplies, setAutoReadReplies] = useState<boolean>(false);
  // When set, the next sendMessage attaches this audio clip to the
  // agent-chat call instead of (or alongside) text.
  const [pendingAudio, setPendingAudio] = useState<VoiceCaptureResult | null>(null);

  /** Per-call confirm/done/failed state for Phase 2 tool calls. Keyed by call_id. */
  const [callStates, setCallStates] = useState<Record<string, ConfirmState>>({});

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const scrollToNewMsgRef = useRef(false);
  const keyCounter = useRef(0);
  // Wave 22.0010 — track the plant we last pre-filled the input for, plus
  // the open state, so we don't trample a draft when the chat re-renders
  // while open or re-opens with the same plant scope still active.
  const lastPrefilledPlantIdRef = useRef<unknown>(null);
  const prevIsOpenRef = useRef<boolean>(false);
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

  // Load voice_settings whenever a user resolves. Cheap: one row.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("voice_settings")
      .eq("uid", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const vs = (data?.voice_settings ?? {}) as { auto_read_assistant_replies?: boolean };
        setAutoReadReplies(!!vs.auto_read_assistant_replies);
      });
    return () => { cancelled = true; };
  }, [userId]);

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

        const ids = data.map((m) => m.id);

        // Fetch feedback + agent tool calls for these messages in parallel.
        const [{ data: feedbackData }, { data: toolCallRows }] = await Promise.all([
          supabase
            .from("chat_feedback")
            .select("message_id, rating")
            .in("message_id", ids),
          supabase
            .from("chat_tool_calls")
            .select("id, message_id, tool_name, tool_args, risk_level, status, preview, result")
            .in("message_id", ids)
            .order("created_at", { ascending: true }),
        ]);

        // Group tool calls by message; rebuild pending cards + resolved states.
        const pendingByMessage: Record<string, PendingCall[]> = {};
        const hydratedCallStates: Record<string, ConfirmState> = {};
        for (const row of toolCallRows ?? []) {
          // Only confirm-risk tools render as cards. Auto (read) tools
          // were already folded into the assistant text on the original turn.
          if (row.risk_level !== "confirm" && row.risk_level !== "strong_confirm") continue;

          const call: PendingCall = {
            id: row.id,
            tool: row.tool_name,
            args: row.tool_args,
            risk_level: row.risk_level,
            preview: row.preview ?? `Run ${row.tool_name}`,
          };
          if (!pendingByMessage[row.message_id]) pendingByMessage[row.message_id] = [];
          pendingByMessage[row.message_id].push(call);

          // Seed the resolved state so the card renders correctly on reload.
          if (row.status === "executed") {
            hydratedCallStates[row.id] = {
              kind: "done",
              summary: row.result?.summary ?? "Done.",
            };
          } else if (row.status === "cancelled") {
            hydratedCallStates[row.id] = { kind: "cancelled" };
          } else if (row.status === "failed" || row.status === "expired") {
            hydratedCallStates[row.id] = {
              kind: "failed",
              error: row.status === "expired" ? "This action expired." : "That action failed.",
            };
          } else {
            hydratedCallStates[row.id] = { kind: "pending" };
          }
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
            pending_tool_calls: pendingByMessage[m.id] ?? undefined,
          })),
        );

        if (Object.keys(hydratedCallStates).length > 0) {
          setCallStates((s) => ({ ...hydratedCallStates, ...s }));
        }

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
    // Wave 23.0001 — record "first chat opened" so the chat walkthrough
    // (added in 23.0003) fires only after the user actually opens it.
    if (isOpen) void recordSignal("first_chat_opened");
  }, [isOpen]);

  // Wave 22.0010 — when the chat opens (or the scoped plant changes), pre-fill
  // the input with a plant-scoped starter so it's obvious which plant the AI
  // is contextualised on. Guards:
  //   - Only fires on the false→true open transition OR on a plant id change
  //     while open.
  //   - Skips when the user has already typed anything.
  //   - Tracks the last pre-filled plant id so re-opening with the same plant
  //     doesn't clobber a draft.
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;
    if (!isOpen) {
      lastPrefilledPlantIdRef.current = null;
      return;
    }
    if (!contextPlant?.common_name) return;
    if (input.trim().length > 0) return;
    if (
      lastPrefilledPlantIdRef.current === contextPlant.id
      && wasOpen
    ) {
      return;
    }
    lastPrefilledPlantIdRef.current = contextPlant.id ?? contextPlant.common_name;
    setInput(`About my ${contextPlant.common_name}: `);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contextPlant?.id, contextPlant?.common_name]);

  // Wave 22.0010 — clears the plant scope from pageContext. The chat itself
  // stays open; the AI just stops contextualising on that specific plant.
  const clearPlantContext = () => {
    if (!pageContext || typeof pageContext !== "object") return;
    const next: Record<string, unknown> = { ...(pageContext as Record<string, unknown>) };
    delete next.plant;
    setPageContext(Object.keys(next).length > 0 ? next : null);
  };

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

  // Wave 22.0001-A — auto-read the latest assistant reply when the setting
  // is enabled. Guarded so we don't speak history on chat open (only fires
  // after scrollToNewMsgRef sets — i.e. genuinely new assistant turn).
  const tts = useTextToSpeech();
  const lastSpokenKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoReadReplies || !isOpen) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant" || !last.content) return;
    // Only speak fresh replies. The welcome message and history loads
    // bypass scrollToNewMsgRef, so check we're not just re-rendering.
    if (lastSpokenKeyRef.current === last._key) return;
    if (isLoading) return;
    lastSpokenKeyRef.current = last._key;
    // Skip the welcome content — it never changes and getting it spoken
    // every open would be annoying.
    if (last.content === WELCOME_CONTENT) return;
    tts.speak(last.content, { key: `chat-${last._key}` }).catch(() => { /* swallowed in hook */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, autoReadReplies, isOpen, isLoading]);

  const handleVoiceRecorded = (audio: VoiceCaptureResult) => {
    setPendingAudio(audio);
    // Auto-send so the user just talks → answer. Keep any draft text
    // alongside the audio in case the user typed something first.
    const form = document.querySelector('form[data-rhozly-chat-form]') as HTMLFormElement | null;
    // Fall back to a synthetic submit if the form ref is unreachable.
    setTimeout(() => {
      if (form) form.requestSubmit();
    }, 50);
  };

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
    userText: string,
    audio?: VoiceCaptureResult | null,
  ): Promise<{
    reply: string;
    /** When the response came from `agent-chat`, the function has already
     *  inserted the assistant row into `chat_messages` and returns its
     *  id. The caller must NOT save another row — doing so was producing
     *  the duplicated-on-reload bug the user reported. */
    assistant_message_id?: string;
    suggested_plants?: Array<{ name: string; search_query: string; show?: boolean }>;
    suggested_tasks?: Array<any>;
    plan_suggestion?: PlanSuggestion | null;
    preferences_captured?: number;
    tool_results?: ToolResult[];
    pending_tool_calls?: PendingCall[];
  }> => {
    // Phase 1 routing: text-only messages go to the agent-chat function
    // (tool-aware), image messages stay on the legacy plant-doctor-ai
    // diagnosis path. Phase 4+ will unify them. Audio rides the agent-chat
    // path too — Gemini transcribes the audio + reasons in one round-trip.
    if (!image) {
      // Convert legacy {role, content} history to Gemini-shape parts.
      const geminiHistory = historyForAI.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: {
          action: "send_message",
          homeId,
          message: userText,
          history: geminiHistory,
          audio: audio ? { base64: audio.base64, mimeType: audio.mimeType } : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return {
        reply: data?.reply ?? "",
        assistant_message_id: data?.messageId,
        suggested_plants: data?.suggested_plants ?? [],
        tool_results: data?.toolResults ?? [],
        pending_tool_calls: data?.pendingToolCalls ?? [],
      };
    }

    // Image path — diagnosis flow stays on plant-doctor-ai.
    const { data, error } = await supabase.functions.invoke("plant-doctor-ai", {
      body: {
        messages: historyForAI,
        currentContext: pageContext,
        homeId,
        priorPlanSuggested,
        imageBase64: image.base64,
        imageMimeType: image.mimeType,
      },
    });
    if (error) throw error;
    if (!data?.reply) throw new Error("No reply received from AI");
    return data as {
      reply: string;
      suggested_plants?: Array<{ name: string; search_query: string; show?: boolean }>;
      suggested_tasks?: Array<any>;
      plan_suggestion?: PlanSuggestion | null;
      preferences_captured?: number;
    };
  };

  const handleToolConfirm = async (call: PendingCall) => {
    setCallStates((s) => ({ ...s, [call.id]: { kind: "executing" } }));
    try {
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: { action: "confirm_tool", callId: call.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCallStates((s) => ({
        ...s,
        [call.id]: {
          kind: "done",
          summary: data?.result?.summary ?? "Done.",
          affected_row_refs: data?.result?.affected_row_refs,
        },
      }));
    } catch (err: any) {
      setCallStates((s) => ({
        ...s,
        [call.id]: { kind: "failed", error: err.message ?? "Couldn't run that action." },
      }));
    }
  };

  const handleToolCancel = async (call: PendingCall) => {
    setCallStates((s) => ({ ...s, [call.id]: { kind: "cancelled" } }));
    try {
      await supabase.functions.invoke("agent-chat", {
        body: { action: "cancel_tool", callId: call.id },
      });
    } catch {
      // Cancel is fire-and-forget — local state already reflects intent.
    }
  };

  const handleToolUndo = async (call: PendingCall) => {
    try {
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: { action: "undo_tool", callId: call.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCallStates((s) => ({ ...s, [call.id]: { kind: "cancelled" } }));
      toast.success("Undone.");
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't undo that.");
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !pendingImage && !pendingAudio) || isLoading) return;

    const audioSnapshot = pendingAudio;
    const userText = input.trim()
      || (pendingImage ? "Please identify or diagnose what you see in this image." : "")
      || (audioSnapshot ? "🎤 Voice message" : "");
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
    setPendingAudio(null);
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

      const data = await callAI(historyForAI, imageSnapshot, priorPlanSuggested, userText, audioSnapshot);

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
          tool_results: data.tool_results ?? undefined,
          pending_tool_calls: data.pending_tool_calls ?? undefined,
        },
      ]);

      // Initialise the per-call state map for any new pending calls.
      if (data.pending_tool_calls && data.pending_tool_calls.length > 0) {
        setCallStates((s) => {
          const next = { ...s };
          for (const call of data.pending_tool_calls!) {
            if (!next[call.id]) next[call.id] = { kind: "pending" };
          }
          return next;
        });
      }
      if (data.plan_suggestion) {
        logEvent(EVENT.PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_SHOWN, {
          plan_name: data.plan_suggestion.plan_name,
        });
      }

      // When the response came from agent-chat, the function already
      // inserted the assistant row (with empty content, then updated)
      // and returned its id. Skip the second insert — that's what was
      // double-saving the reply and showing duplicates on reload.
      // The plant-doctor-ai (image) path still needs the client-side
      // save because that function doesn't persist the message itself.
      const assistantMsgId =
        data.assistant_message_id
        ?? (await saveMessageToDB("assistant", data.reply, {
          suggested_plants: data.suggested_plants,
          suggested_tasks: data.suggested_tasks,
          preferences_captured: data.preferences_captured ?? 0,
          plan_suggestion: data.plan_suggestion ?? null,
        }));
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

      // See the duplicate-on-reload note in handleSend — same rule here.
      const assistantMsgId =
        data.assistant_message_id
        ?? (await saveMessageToDB("assistant", data.reply, {
          suggested_plants: data.suggested_plants,
          suggested_tasks: data.suggested_tasks,
          preferences_captured: data.preferences_captured ?? 0,
          plan_suggestion: data.plan_suggestion ?? null,
        }));
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
        <div
          data-testid="plant-doctor-chat-panel"
          className="fixed bottom-24 right-6 w-[350px] md:w-[450px] max-w-[calc(100vw-3rem)] h-[500px] bg-white rounded-2xl shadow-2xl border border-rhozly-outline/10 flex flex-col z-50 animate-in slide-in-from-bottom-10 overflow-hidden"
        >
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
                data-testid="plant-doctor-chat-close"
                aria-label="Close Garden AI chat"
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
                      data-testid={`chat-message-${msg.role}`}
                      data-message-role={msg.role}
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
                        <div className="whitespace-pre-wrap">{msg.role === "assistant" ? sanitizeAssistantText(msg.content) : msg.content}</div>

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

                        {/* Agent tool results — Phase 1 renders read-only
                            tool outputs (plant lists, task lists, etc.)
                            as inline cards. Display-only tools (e.g.
                            show_plant_images) are surfaced via suggested_plants
                            instead, so they're filtered out here to avoid a raw
                            JSON debug dump. */}
                        {msg.role === "assistant" &&
                          visibleToolResults(msg.tool_results).length > 0 && (
                            <div className="mt-2 space-y-2">
                              {visibleToolResults(msg.tool_results).map((tr, i) => (
                                <ToolResultCard
                                  key={i}
                                  tool={tr.tool}
                                  summary={tr.summary}
                                  payload={tr.payload}
                                />
                              ))}
                            </div>
                          )}

                        {/* Phase 2 — pending tool calls awaiting confirmation. */}
                        {msg.role === "assistant" &&
                          msg.pending_tool_calls &&
                          msg.pending_tool_calls.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {msg.pending_tool_calls.map((call) => (
                                <ToolConfirmCard
                                  key={call.id}
                                  call={call}
                                  state={callStates[call.id] ?? { kind: "pending" }}
                                  onConfirm={() => handleToolConfirm(call)}
                                  onCancel={() => handleToolCancel(call)}
                                  onUndo={() => handleToolUndo(call)}
                                />
                              ))}
                            </div>
                          )}

                        {/* Feedback + regenerate row (DB-saved assistant messages only) */}
                        {msg.role === "assistant" && msg.id && (
                          <div className="flex items-center gap-1 mt-1 pt-1 border-t border-rhozly-outline/5">
                            {/* Wave 22.0001-A — Read aloud */}
                            {msg.content && (
                              <ReadAloudButton
                                text={msg.content}
                                messageKey={`chat-${msg._key}`}
                                size="sm"
                              />
                            )}
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

          {/* Wave 22.0010 — "Talking about" chip when the chat is scoped to
              a specific plant (e.g. opened from a Shed tile's AI button).
              Lets users tap × to clear the plant scope and continue with a
              general garden conversation. */}
          {contextPlant?.common_name && (
            <div className="px-3 pt-2 -mb-1 bg-white border-t border-rhozly-outline/10 shrink-0">
              <div
                data-testid="chat-plant-context-chip"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[11px] font-black"
              >
                <IconPlant size={11} />
                <span>Talking about: {contextPlant.common_name}</span>
                <button
                  type="button"
                  data-testid="chat-plant-context-clear"
                  onClick={clearPlantContext}
                  aria-label={`Stop scoping to ${contextPlant.common_name}`}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-rhozly-primary/20 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <form
            data-rhozly-chat-form="1"
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

            {/* Mic — Wave 22.0001-A */}
            <MicButton
              disabled={isLoading || isLoadingHistory}
              onRecorded={handleVoiceRecorded}
              size="md"
            />

            <input
              data-testid="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pendingImage ? "Ask about this photo…" : pendingAudio ? "🎤 Voice ready — tap send" : "Ask about your garden…"}
              className="flex-1 bg-rhozly-surface-low rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
              disabled={isLoading || isLoadingHistory}
            />
            <button
              data-testid="chat-send"
              type="submit"
              disabled={isLoading || isLoadingHistory || (!input.trim() && !pendingImage && !pendingAudio)}
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

import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Leaf,
  Trash2,
} from "lucide-react";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

// 🚀 IMPORT THE NEW COMPONENT HERE
// (Adjust this path if your PlantActionButtons file is in a different folder)
import { PlantActionButtons } from "./PlantActionButtons";

// 🚀 UPDATED INTERFACE: Now accepts the suggested_plants array
interface Message {
  role: "user" | "assistant";
  content: string;
  suggested_plants?: Array<{ name: string; search_query: string }>;
}

export default function PlantDoctorChat({ homeId }: { homeId: string }) {
  const { isOpen, setIsOpen, pageContext } = usePlantDoctor();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm the Plant Doctor. How can I help your garden grow today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleClearChat = () => {
    setMessages([
      {
        role: "assistant",
        content:
          "Hello! I'm the Plant Doctor. How can I help your garden grow today?",
      },
    ]);
    toast.success("Chat history cleared!");
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "plant-doctor-ai",
        {
          body: {
            // This safely strips out 'suggested_plants' before sending history back to the AI
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            currentContext: pageContext,
            homeId: homeId,
          },
        },
      );

      if (error) throw error;
      if (!data || !data.reply) throw new Error("No reply received from AI");

      // 🚀 NEW: Save both the text reply AND the suggested plants to the chat history
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          suggested_plants: data.suggested_plants,
        },
      ]);
    } catch (error: any) {
      Logger.error("Plant Doctor AI Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Oops! My roots got tangled. I couldn't process that right now.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

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
                onClick={handleClearChat}
                title="Reset Conversation"
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
            {messages.map((msg, idx) => (
              <div
                key={idx}
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
                  {/* Markdown content container */}
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* 🚀 FIX: Pass the entire array to a SINGLE PlantActionButtons component */}
                  {msg.suggested_plants && msg.suggested_plants.length > 0 && (
                    <div className="mt-2 pt-3 border-t border-rhozly-outline/10">
                      <PlantActionButtons
                        plants={msg.suggested_plants}
                        homeId={homeId}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  <Leaf size={14} />
                </div>
                <div className="p-3 bg-white border border-rhozly-outline/10 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                  <Loader2
                    size={14}
                    className="animate-spin text-rhozly-primary"
                  />{" "}
                  <span className="text-xs font-bold text-gray-400">
                    Thinking...
                  </span>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {/* Input Area */}
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
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
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

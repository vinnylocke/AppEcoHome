import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Loader2,
  Wand2,
  Save,
  Image as ImageIcon,
  AlertTriangle,
  Pencil,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";

export default function AdminGuideGenerator() {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [targetAudience, setTargetAudience] = useState("Home Gardeners");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Holds the generated JSON payload
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLabels, setPreviewLabels] = useState<string[]>([]);

  // Inline title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");

  const handleGenerate = async () => {
    if (!topic) return toast.error("Please enter a topic.");
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-guide",
        {
          body: { topic, difficulty, target_audience: targetAudience },
        },
      );

      if (error) throw new Error(error.message);

      // We expect the Edge Function to return { guide_data: {...}, labels: [...] }
      setPreviewData(data.guide_data);
      setPreviewLabels(data.labels);
      setEditedTitle(data.guide_data?.title ?? "");
      setIsEditingTitle(false);
      toast.success("Guide generated successfully!");
    } catch (err: any) {
      toast.error(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!previewData) return;
    setIsSaving(true);

    try {
      const dataToSave = editedTitle
        ? { ...previewData, title: editedTitle }
        : previewData;

      const { error } = await supabase.from("guides").insert({
        data: dataToSave,
        labels: previewLabels,
      });

      if (error) throw error;

      toast.success("Guide published to database!");
      setPreviewData(null);
      setTopic("");
      setEditedTitle("");
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCommitTitle = () => {
    if (!editedTitle.trim()) {
      setEditedTitle(previewData?.title ?? "");
    }
    setIsEditingTitle(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 flex flex-col lg:flex-row gap-8">
      {/* LEFT COLUMN: Controls */}
      <div className="flex-1 space-y-6">
        <div>
          <h2 className="text-3xl font-black text-rhozly-on-surface">
            Guide Studio
          </h2>
          <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Admin Content Engine
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-rhozly-outline/10 shadow-sm space-y-4">
          <label className="text-xs font-black uppercase text-rhozly-on-surface/60">
            Topic / Prompt
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., A beginner's guide to pruning overgrown tomato plants..."
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none focus:ring-2 focus:ring-rhozly-primary focus-visible:ring-2 focus-visible:ring-rhozly-primary resize-none h-32"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full p-3 bg-rhozly-surface-low rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-rhozly-primary focus-visible:ring-2 focus-visible:ring-rhozly-primary cursor-pointer"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40">Audience</label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full p-3 bg-rhozly-surface-low rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-rhozly-primary focus-visible:ring-2 focus-visible:ring-rhozly-primary cursor-pointer"
              >
                <option>Home Gardeners</option>
                <option>Allotment Growers</option>
                <option>Indoor Plant Enthusiasts</option>
                <option>Professional Horticulturists</option>
                <option>Children / Young Learners</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !topic}
            aria-label={isGenerating ? "Generating guide content" : "Generate guide from topic"}
            className="w-full py-4 bg-rhozly-primary text-white rounded-xl font-black flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {isGenerating ? "Drafting Guide..." : "Generate Guide"}
          </button>
        </div>

        {previewLabels.length > 0 && (
          <div className="bg-white p-6 rounded-3xl border border-rhozly-outline/10 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase text-rhozly-on-surface/60">
              Generated Labels (Indexed)
            </h3>
            <div className="flex flex-wrap gap-2">
              {previewLabels.map((label) => (
                <span
                  key={label}
                  className="bg-rhozly-primary/10 text-rhozly-primary px-3 py-1 rounded-lg text-xs font-bold border border-rhozly-primary/20"
                >
                  #{label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Live Preview */}
      <div className="flex-[1.5] bg-rhozly-surface-lowest rounded-[3rem] border border-rhozly-outline/10 shadow-2xl p-8 flex flex-col relative overflow-hidden" aria-busy={isGenerating}>
        {isGenerating ? (
          <div className="flex-1 pb-20 animate-pulse">
            {/* Skeleton Loader */}
            <div className="mb-8">
              <div className="flex gap-2 mb-3">
                <div className="bg-rhozly-outline/20 h-5 w-20 rounded-md"></div>
                <div className="bg-rhozly-outline/20 h-5 w-16 rounded-md"></div>
              </div>
              <div className="bg-rhozly-outline/30 h-9 w-3/4 rounded mb-2"></div>
              <div className="bg-rhozly-outline/20 h-6 w-full rounded"></div>
            </div>
            <div className="space-y-6">
              <div className="bg-rhozly-outline/30 h-7 w-1/2 rounded"></div>
              <div className="bg-rhozly-outline/20 h-4 w-full rounded"></div>
              <div className="bg-rhozly-outline/20 h-4 w-full rounded"></div>
              <div className="bg-rhozly-outline/20 h-4 w-5/6 rounded"></div>
              <div className="space-y-2 pl-6">
                <div className="bg-rhozly-outline/20 h-4 w-full rounded"></div>
                <div className="bg-rhozly-outline/20 h-4 w-11/12 rounded"></div>
                <div className="bg-rhozly-outline/20 h-4 w-full rounded"></div>
              </div>
              <div className="bg-rhozly-outline/20 h-32 w-full rounded-2xl"></div>
              <div className="bg-rhozly-outline/20 h-4 w-full rounded"></div>
              <div className="bg-rhozly-outline/20 h-4 w-4/5 rounded"></div>
            </div>
          </div>
        ) : previewData ? (
          <div className="overflow-y-auto custom-scrollbar flex-1 pb-20">
            {/* THE RENDERER: This is exactly how you will render it in the public app too! */}
            <div className="mb-8">
              <div className="flex gap-2 mb-3">
                <span className="bg-rhozly-secondary/20 text-rhozly-on-surface/70 text-[10px] font-black uppercase px-2 py-1 rounded-md">
                  {previewData.difficulty}
                </span>
                <span className="bg-rhozly-surface-low text-rhozly-on-surface/50 text-[10px] font-black uppercase px-2 py-1 rounded-md">
                  {previewData.estimated_minutes} Min
                </span>
              </div>

              {isEditingTitle ? (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCommitTitle();
                      if (e.key === "Escape") {
                        setEditedTitle(previewData?.title ?? "");
                        setIsEditingTitle(false);
                      }
                    }}
                    autoFocus
                    className="flex-1 text-3xl font-black leading-tight bg-rhozly-surface-low rounded-xl px-3 py-1 outline-none focus:ring-2 focus:ring-rhozly-primary"
                    aria-label="Edit guide title"
                  />
                  <button
                    onClick={handleCommitTitle}
                    aria-label="Confirm title"
                    className="p-2 rounded-xl bg-rhozly-primary text-white hover:opacity-90 transition-opacity shrink-0"
                  >
                    <Check size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2 mb-2 group">
                  <h1 className="text-3xl font-black leading-tight flex-1">
                    {editedTitle || previewData.title}
                  </h1>
                  <button
                    onClick={() => {
                      setEditedTitle(editedTitle || previewData.title);
                      setIsEditingTitle(true);
                    }}
                    aria-label="Edit guide title"
                    className="mt-1 p-1.5 rounded-lg text-rhozly-on-surface/30 hover:text-rhozly-primary hover:bg-rhozly-primary/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              )}

              <p className="text-rhozly-on-surface/60 font-bold">
                {previewData.subtitle}
              </p>
            </div>

            <div className="space-y-6">
              {previewData.sections.map((sec: any, index: number) => {
                if (sec.type === "header")
                  return (
                    <h2 key={index} className="text-xl font-black mt-8">
                      {sec.content}
                    </h2>
                  );
                if (sec.type === "paragraph")
                  return (
                    <p
                      key={index}
                      className="text-rhozly-on-surface/80 leading-relaxed"
                    >
                      {sec.content}
                    </p>
                  );
                if (sec.type === "list")
                  return (
                    <ul
                      key={index}
                      className="list-disc pl-6 space-y-3 text-rhozly-on-surface/80 marker:text-rhozly-primary"
                    >
                      {sec.items?.map((item: string, i: number) => (
                        <li key={i} className="pl-1 leading-relaxed">
                          <span
                            dangerouslySetInnerHTML={{
                              __html: item.replace(
                                /\*\*(.*?)\*\*/g,
                                "<strong>$1</strong>",
                              ),
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  );
                if (sec.type === "tip")
                  return (
                    <div
                      key={index}
                      className="bg-rhozly-primary/10 border-l-4 border-rhozly-primary p-4 rounded-r-2xl"
                    >
                      <strong className="text-rhozly-primary text-xs uppercase tracking-widest block mb-1">
                        Pro Tip
                      </strong>
                      <p className="text-sm font-bold text-rhozly-on-surface/80">
                        {sec.content}
                      </p>
                    </div>
                  );
                if (sec.type === "warning")
                  return (
                    <div
                      key={index}
                      className="bg-rhozly-error/10 border-l-4 border-rhozly-error p-4 rounded-r-2xl flex gap-3"
                    >
                      <AlertTriangle
                        className="text-rhozly-error shrink-0"
                        size={20}
                      />
                      <p className="text-sm font-bold text-rhozly-on-surface/80">
                        {sec.content}
                      </p>
                    </div>
                  );
                if (sec.type === "image")
                  return (
                    <div
                      key={index}
                      className="my-6 rounded-3xl overflow-hidden shadow-md border border-rhozly-outline/10 bg-rhozly-surface-low"
                    >
                      {/* Pollinations URL will generate an image based on the prompt on the fly! */}
                      <img
                        src={sec.content}
                        alt={sec.caption}
                        className="w-full h-64 object-cover"
                        loading="lazy"
                      />
                      {sec.caption && (
                        <p className="p-3 text-center text-xs font-bold text-rhozly-on-surface/50 bg-white">
                          {sec.caption}
                        </p>
                      )}
                    </div>
                  );
                return null;
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30">
            <ImageIcon size={64} className="mb-4" />
            <p className="font-black text-xl">Preview Window</p>
            <p className="font-bold text-sm">
              Generated content will appear here.
            </p>
          </div>
        )}

        {/* Floating Action Bar */}
        {previewData && (
          <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-rhozly-outline/10 flex justify-between items-center">
            <span className="text-xs font-bold text-rhozly-on-surface/50">
              Does this look good?
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setPreviewData(null)}
                className="px-4 font-bold text-sm bg-rhozly-surface-low rounded-xl hover:bg-rhozly-outline/20 min-h-[44px] transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSaveToDatabase}
                disabled={isSaving}
                aria-label={isSaving ? "Saving guide to database" : "Save generated guide to database"}
                className="px-6 font-black text-sm bg-rhozly-primary text-white rounded-xl shadow-md hover:opacity-90 flex items-center gap-2 min-h-[44px] transition-opacity disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}{" "}
                Save to Database
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Screen reader status announcement */}
      <div role="status" className="sr-only">
        {!isGenerating && previewData && "Guide generation complete. Preview is ready."}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X, Loader2, ChevronRight, ChevronLeft, CheckCircle2,
  ImageOff, Leaf, AlertCircle, Upload,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { removeBackground } from "@imgly/background-removal";
import { supabase } from "../lib/supabase";
import { PerenualService } from "../lib/perenualService";
import {
  SILHOUETTE_TYPES,
  SILHOUETTE_LABELS,
  PlantSilhouettePreview,
  silhouetteToPngBlob,
  type SilhouetteType,
} from "./visualiser/PlantSilhouettes";

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase =
  | "loading"
  | "cached"
  | "picking"
  | "removing-bg"
  | "confirming"
  | "saving"
  | "silhouette";

type TabKey = "pixabay" | "perenual" | "wikipedia" | "inaturalist" | "personal";
const ALL_TABS: TabKey[] = ["pixabay", "perenual", "wikipedia", "inaturalist", "personal"];
const TAB_LABELS: Record<TabKey, string> = {
  pixabay: "Pixabay",
  perenual: "Perenual",
  wikipedia: "Wikipedia",
  inaturalist: "iNaturalist",
  personal: "Personal",
};

interface TabImage {
  url: string;
  thumb: string;
}

interface TabState {
  images: TabImage[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

const EMPTY_TAB: TabState = { images: [], loading: false, loaded: false, error: null };

interface Plant {
  id: number | string;
  common_name: string;
  scientific_name?: string[] | null;
  perenual_id?: number | null;
  plant_type?: string | null;
}

interface Props {
  plants: Plant[];
  homeId: string;
  onComplete: (sprites: Map<string, string>) => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SpriteWizardModal({ plants, homeId, onComplete, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("pixabay");
  const [tabStates, setTabStates] = useState<Record<TabKey, TabState>>({
    pixabay: EMPTY_TAB,
    perenual: EMPTY_TAB,
    wikipedia: EMPTY_TAB,
    inaturalist: EMPTY_TAB,
    personal: EMPTY_TAB,
  });
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedObjUrl, setProcessedObjUrl] = useState<string | null>(null);
  const [bgProgress, setBgProgress] = useState(0);
  const [bgLabel, setBgLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedSilhouette, setSelectedSilhouette] = useState<SilhouetteType | null>(null);
  const [confirmedSprites, setConfirmedSprites] = useState<Map<string, string>>(new Map());

  const [personalPreviewUrl, setPersonalPreviewUrl] = useState<string | null>(null);

  const processedObjUrlRef  = useRef<string | null>(null);
  const personalObjUrlRef   = useRef<string | null>(null);
  const plant = plants[idx];

  // ── Reset on plant change ──────────────────────────────────────────────────

  useEffect(() => {
    if (!plant) return;
    if (processedObjUrlRef.current) {
      URL.revokeObjectURL(processedObjUrlRef.current);
      processedObjUrlRef.current = null;
    }
    if (personalObjUrlRef.current) {
      URL.revokeObjectURL(personalObjUrlRef.current);
      personalObjUrlRef.current = null;
    }
    setPhase("loading");
    setCachedUrl(null);
    setSelectedUrl(null);
    setPersonalPreviewUrl(null);
    setProcessedBlob(null);
    setProcessedObjUrl(null);
    setBgProgress(0);
    setBgLabel("");
    setSaving(false);
    setSelectedSilhouette(null);
    setActiveTab("pixabay");
    setTabStates({ pixabay: EMPTY_TAB, perenual: EMPTY_TAB, wikipedia: EMPTY_TAB, inaturalist: EMPTY_TAB, personal: EMPTY_TAB });
    checkCache(plant);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    processedObjUrlRef.current = processedObjUrl;
  }, [processedObjUrl]);

  // ── Cache lookup ───────────────────────────────────────────────────────────

  const checkCache = async (p: Plant) => {
    try {
      let data: { sprite_url: string } | null = null;

      if (p.perenual_id) {
        const { data: row } = await supabase
          .from("plant_sprites")
          .select("sprite_url")
          .eq("perenual_id", p.perenual_id)
          .maybeSingle();
        data = row;
      }

      if (!data && p.common_name) {
        const { data: row } = await supabase
          .from("plant_sprites")
          .select("sprite_url")
          .eq("plant_name", p.common_name.toLowerCase())
          .maybeSingle();
        data = row;
      }

      if (data) {
        setCachedUrl(data.sprite_url);
        setPhase("cached");
      } else {
        enterPicking(p);
      }
    } catch {
      enterPicking(p);
    }
  };

  // ── Picking phase ──────────────────────────────────────────────────────────

  const enterPicking = (p: Plant = plant) => {
    setPhase("picking");
    loadAllTabs(p);
  };

  const updateTab = (tab: TabKey, update: Partial<TabState>) => {
    setTabStates((prev) => ({ ...prev, [tab]: { ...prev[tab], ...update } }));
  };

  const loadAllTabs = (p: Plant) => {
    loadPixabay(p);
    loadPerenual(p);
    loadWikipedia(p);
    loadINaturalist(p);
  };

  const loadPixabay = async (p: Plant) => {
    const key = import.meta.env.VITE_PIXABAY_API_KEY;
    console.debug("[Sprite Wizard] Pixabay key:", key ? `"${key.slice(0, 6)}…" (${key.length} chars)` : "undefined/empty");
    if (!key) {
      updateTab("pixabay", { loaded: true, error: "Pixabay API key not configured" });
      return;
    }
    updateTab("pixabay", { loading: true });
    const name = p.common_name || "";
    const fetchImages = async (q: string): Promise<TabImage[]> => {
      const res = await fetch(
        `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&image_type=photo&per_page=12&safesearch=true`,
      );
      const data = await res.json();
      return (data.hits || []).map((h: any) => ({ url: h.webformatURL, thumb: h.previewURL }));
    };
    try {
      let images = await fetchImages(`${name} plant isolated`);
      if (images.length < 3) {
        const more = await fetchImages(`${name} plant`);
        const seen = new Set(images.map((i) => i.url));
        images = [...images, ...more.filter((i) => !seen.has(i.url))];
      }
      updateTab("pixabay", { loading: false, loaded: true, images });
    } catch (e) {
      console.debug("[Sprite Wizard] Pixabay: fetch failed", e);
      updateTab("pixabay", { loading: false, loaded: true, error: "Failed to load Pixabay images" });
    }
  };

  const loadPerenual = async (p: Plant) => {
    if (!p.perenual_id) {
      updateTab("perenual", { loaded: true, error: "No Perenual data for this plant" });
      return;
    }
    updateTab("perenual", { loading: true });
    try {
      // Bypass cache — Perenual image URLs are signed and expire after 24h
      const key = import.meta.env.VITE_PERENUAL_API_KEY;
      const res = await fetch(
        `https://perenual.com/api/v2/species/details/${p.perenual_id}?key=${key}`,
      );
      const data = await res.json();
      const images: TabImage[] = [];
      if (data.default_image?.regular_url) {
        images.push({
          url: data.default_image.regular_url,
          thumb: data.default_image.thumbnail || data.default_image.regular_url,
        });
      }
      updateTab("perenual", { loading: false, loaded: true, images });
    } catch (e) {
      console.debug("[Sprite Wizard] Perenual: fetch failed", e);
      updateTab("perenual", { loading: false, loaded: true, error: "Failed to load Perenual images" });
    }
  };

  const loadWikipedia = async (p: Plant) => {
    updateTab("wikipedia", { loading: true });
    const sci = (p.scientific_name || [])[0] || "";
    const common = p.common_name || "";
    const genus = sci.split(/[\s'"`]/)[0];

    const tryName = async (q: string): Promise<TabImage[] | null> => {
      if (!q) return null;
      console.debug(`[Sprite Wizard] Wikipedia: trying "${q}"`);
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`,
        );
        if (!res.ok) {
          console.debug(`[Sprite Wizard] Wikipedia: "${q}" → ${res.status}, trying next term`);
          return null;
        }
        const data = await res.json();
        if (!data.thumbnail?.source) {
          console.debug(`[Sprite Wizard] Wikipedia: "${q}" found but no image`);
          return null;
        }
        console.debug(`[Sprite Wizard] Wikipedia: "${q}" → image found`);
        return [{
          url: data.originalimage?.source || data.thumbnail.source,
          thumb: data.thumbnail.source,
        }];
      } catch {
        console.debug(`[Sprite Wizard] Wikipedia: "${q}" → network error, trying next term`);
        return null;
      }
    };

    const images =
      (sci && (await tryName(sci))) ||
      (await tryName(common)) ||
      (genus && genus !== sci && (await tryName(genus))) ||
      [];
    if (!images.length) console.debug(`[Sprite Wizard] Wikipedia: no image found for "${p.common_name}"`);
    updateTab("wikipedia", { loading: false, loaded: true, images });
  };

  const loadINaturalist = async (p: Plant) => {
    updateTab("inaturalist", { loading: true });
    const name = (p.scientific_name || [])[0] || p.common_name || "";
    try {
      const res = await fetch(
        `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&rank=species&per_page=5`,
      );
      const data = await res.json();
      const images: TabImage[] = [];
      const seen = new Set<string>();
      for (const taxon of (data.results || [])) {
        if (taxon.default_photo?.medium_url && !seen.has(taxon.default_photo.medium_url)) {
          images.push({ url: taxon.default_photo.medium_url, thumb: taxon.default_photo.medium_url });
          seen.add(taxon.default_photo.medium_url);
        }
        for (const tp of (taxon.taxon_photos || []).slice(0, 3)) {
          const url = tp.photo?.medium_url;
          if (url && !seen.has(url)) {
            images.push({ url, thumb: url });
            seen.add(url);
          }
        }
      }
      updateTab("inaturalist", { loading: false, loaded: true, images });
    } catch (e) {
      console.debug("[Sprite Wizard] iNaturalist: fetch failed", e);
      updateTab("inaturalist", { loading: false, loaded: true, error: "Failed to load iNaturalist images" });
    }
  };

  // ── Personal file upload ───────────────────────────────────────────────────

  const handlePersonalFile = (file: File) => {
    if (personalObjUrlRef.current) URL.revokeObjectURL(personalObjUrlRef.current);
    const objUrl = URL.createObjectURL(file);
    personalObjUrlRef.current = objUrl;
    setPersonalPreviewUrl(objUrl);
    setSelectedUrl(objUrl);
  };

  // ── Background removal ─────────────────────────────────────────────────────

  const handleRemoveBg = async () => {
    const url = activeTab === "personal" ? personalPreviewUrl : selectedUrl;
    if (!url) return;
    setPhase("removing-bg");
    setBgProgress(0);
    setBgLabel("Preparing…");
    try {
      const blob = await removeBackground(url, {
        progress: (key: string, current: number, total: number) => {
          setBgLabel(key);
          if (total > 0) setBgProgress(Math.round((current / total) * 100));
        },
      } as any);
      const objUrl = URL.createObjectURL(blob);
      setProcessedBlob(blob);
      setProcessedObjUrl(objUrl);
      processedObjUrlRef.current = objUrl;
      setPhase("confirming");
    } catch (err: any) {
      console.error("[Sprite Wizard] Background removal error:", err);
      toast.error("Background removal failed. Try a different image.");
      setPhase("picking");
    }
  };

  // ── Upload & save ─────────────────────────────────────────────────────────

  const uploadAndSave = async (blob: Blob, source: string): Promise<string> => {
    const path = plant.perenual_id
      ? `${plant.perenual_id}/${Date.now()}.png`
      : `manual/${plant.id}/${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("plant-sprites")
      .upload(path, blob, { contentType: "image/png" });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("plant-sprites").getPublicUrl(path);

    const { error: dbError } = await supabase.from("plant_sprites").insert({
      plant_id: plant.id,
      perenual_id: plant.perenual_id || null,
      sprite_url: publicUrl,
      source,
      plant_name: plant.common_name?.toLowerCase() || null,
    });

    if (dbError) throw dbError;

    return publicUrl;
  };

  const handleConfirm = async () => {
    if (!processedBlob) return;
    setSaving(true);
    setPhase("saving");
    try {
      const url = await uploadAndSave(processedBlob, activeTab);
      finalisePlant(url);
    } catch (err: any) {
      toast.error("Failed to save sprite. Please try again.");
      setSaving(false);
      setPhase("confirming");
    }
  };

  const handleSilhouetteConfirm = async () => {
    if (!selectedSilhouette) return;
    setSaving(true);
    setPhase("saving");
    try {
      const blob = await silhouetteToPngBlob(selectedSilhouette);
      const url = await uploadAndSave(blob, "fallback");
      finalisePlant(url);
    } catch {
      toast.error("Failed to save silhouette. Please try again.");
      setSaving(false);
      setPhase("silhouette");
    }
  };

  const handleUseCached = async () => {
    if (!cachedUrl) return;
    const next = new Map(confirmedSprites);
    next.set(plant.id, cachedUrl);
    setConfirmedSprites(next);
    advancePlant(next);
  };

  const finalisePlant = (spriteUrl: string) => {
    const next = new Map(confirmedSprites);
    next.set(plant.id, spriteUrl);
    setConfirmedSprites(next);
    setSaving(false);
    advancePlant(next);
  };

  const advancePlant = (sprites: Map<string, string>) => {
    if (idx + 1 >= plants.length) {
      onComplete(sprites);
    } else {
      setIdx((i) => i + 1);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl border border-rhozly-outline/20 flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-rhozly-outline/10 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
              Plant {idx + 1} of {plants.length}
            </p>
            <h2 className="text-lg font-black text-rhozly-on-surface leading-tight">
              {plant.common_name}
            </h2>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mx-4">
            {plants.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all ${
                  i < idx
                    ? "w-2 h-2 bg-rhozly-primary"
                    : i === idx
                    ? "w-3 h-3 bg-rhozly-primary/60 ring-2 ring-rhozly-primary/20"
                    : "w-2 h-2 bg-rhozly-outline/30"
                }`}
              />
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-rhozly-surface-low transition-colors"
            aria-label="Close wizard"
          >
            <X size={18} className="text-rhozly-on-surface/50" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {phase === "loading" && <LoadingPhase />}
          {phase === "cached" && (
            <CachedPhase
              cachedUrl={cachedUrl!}
              onUse={handleUseCached}
              onFindDifferent={() => enterPicking()}
            />
          )}
          {phase === "picking" && (
            <PickingPhase
              plant={plant}
              activeTab={activeTab}
              tabStates={tabStates}
              selectedUrl={selectedUrl}
              personalPreviewUrl={personalPreviewUrl}
              onTabChange={setActiveTab}
              onSelectImage={setSelectedUrl}
              onPersonalFile={handlePersonalFile}
              onRemoveBg={handleRemoveBg}
              onSilhouette={() => setPhase("silhouette")}
            />
          )}
          {phase === "removing-bg" && (
            <RemovingBgPhase
              imageUrl={(activeTab === "personal" ? personalPreviewUrl : selectedUrl) ?? ""}
              progress={bgProgress}
              label={bgLabel}
            />
          )}
          {phase === "confirming" && (
            <ConfirmingPhase
              processedObjUrl={processedObjUrl!}
              onBack={() => setPhase("picking")}
              onConfirm={handleConfirm}
            />
          )}
          {phase === "saving" && <SavingPhase />}
          {phase === "silhouette" && (
            <SilhouettePhase
              selected={selectedSilhouette}
              onSelect={setSelectedSilhouette}
              onBack={() => setPhase("picking")}
              onConfirm={handleSilhouetteConfirm}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Phase sub-components ─────────────────────────────────────────────────────

function LoadingPhase() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
      <p className="text-sm font-bold text-rhozly-on-surface/40">Checking sprite library…</p>
    </div>
  );
}

function SavingPhase() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
      <p className="text-sm font-bold text-rhozly-on-surface/40">Saving sprite…</p>
    </div>
  );
}

function CachedPhase({
  cachedUrl,
  onUse,
  onFindDifferent,
}: {
  cachedUrl: string;
  onUse: () => void;
  onFindDifferent: () => void;
}) {
  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="rounded-2xl bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] border border-rhozly-outline/10 overflow-hidden flex items-center justify-center h-52">
        <img src={cachedUrl} alt="Cached sprite" crossOrigin="anonymous" className="h-full w-full object-contain" />
      </div>

      <div className="flex items-start gap-3 p-4 bg-rhozly-primary/5 rounded-2xl border border-rhozly-primary/10">
        <CheckCircle2 size={18} className="text-rhozly-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-black text-rhozly-on-surface">Sprite already in library</p>
          <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5">
            A sprite was previously generated for this plant.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onFindDifferent}
          className="flex-1 py-3 rounded-2xl border border-rhozly-outline/30 text-sm font-black text-rhozly-on-surface/60 hover:border-rhozly-outline/60 transition-colors"
        >
          Find different
        </button>
        <button
          onClick={onUse}
          className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-md"
        >
          Use this <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function ImageThumb({
  img,
  selected,
  onSelect,
}: {
  img: TabImage;
  selected: boolean;
  onSelect: () => void;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed) return null;

  return (
    <button
      onClick={onSelect}
      className={`aspect-square rounded-xl overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-rhozly-primary ${
        selected
          ? "border-rhozly-primary shadow-md scale-[1.03]"
          : "border-transparent hover:border-rhozly-primary/30"
      }`}
    >
      <img
        src={img.thumb}
        alt=""
        crossOrigin="anonymous"
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </button>
  );
}

function PickingPhase({
  plant,
  activeTab,
  tabStates,
  selectedUrl,
  personalPreviewUrl,
  onTabChange,
  onSelectImage,
  onPersonalFile,
  onRemoveBg,
  onSilhouette,
}: {
  plant: { common_name: string; perenual_id?: number | null };
  activeTab: TabKey;
  tabStates: Record<TabKey, TabState>;
  selectedUrl: string | null;
  personalPreviewUrl: string | null;
  onTabChange: (t: TabKey) => void;
  onSelectImage: (url: string) => void;
  onPersonalFile: (file: File) => void;
  onRemoveBg: () => void;
  onSilhouette: () => void;
}) {
  const tab = tabStates[activeTab];
  const canRemoveBg = activeTab === "personal" ? !!personalPreviewUrl : !!selectedUrl;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-rhozly-outline/10 px-4 pt-4 gap-1 shrink-0 overflow-x-auto">
        {ALL_TABS.map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`px-3 py-2 text-xs font-black rounded-t-xl whitespace-nowrap transition-all shrink-0 ${
              activeTab === t
                ? "text-rhozly-primary border-b-2 border-rhozly-primary -mb-px bg-white"
                : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-[220px]">
        {activeTab === "personal" ? (
          <PersonalTab previewUrl={personalPreviewUrl} onFileSelected={onPersonalFile} />
        ) : (
          <>
            {tab.loading && (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
              </div>
            )}
            {!tab.loading && tab.error && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
                <AlertCircle size={28} className="text-rhozly-on-surface/20" />
                <p className="text-xs font-bold text-rhozly-on-surface/40">{tab.error}</p>
              </div>
            )}
            {!tab.loading && !tab.error && tab.images.length === 0 && tab.loaded && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
                <ImageOff size={28} className="text-rhozly-on-surface/20" />
                <p className="text-xs font-bold text-rhozly-on-surface/40">
                  No images found for "{plant.common_name}"
                </p>
              </div>
            )}
            {!tab.loading && tab.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {tab.images.map((img, i) => (
                  <ImageThumb
                    key={i}
                    img={img}
                    selected={selectedUrl === img.url}
                    onSelect={() => onSelectImage(img.url)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="p-4 border-t border-rhozly-outline/10 flex items-center justify-between shrink-0">
        <button
          onClick={onSilhouette}
          className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors"
        >
          <Leaf size={14} />
          Use silhouette instead
        </button>

        <button
          onClick={onRemoveBg}
          disabled={!canRemoveBg}
          className="px-5 py-2.5 rounded-2xl bg-rhozly-primary text-white text-sm font-black flex items-center gap-2 hover:scale-[1.02] transition-transform shadow-md disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed"
        >
          Remove background <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function PersonalTab({
  previewUrl,
  onFileSelected,
}: {
  previewUrl: string | null;
  onFileSelected: (file: File) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer transition-all min-h-[200px] overflow-hidden ${
          isDragging
            ? "border-rhozly-primary bg-rhozly-primary/5 scale-[1.01]"
            : previewUrl
            ? "border-rhozly-outline/20 bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]"
            : "border-rhozly-outline/30 bg-rhozly-surface-low hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5"
        }`}
      >
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Your image"
              className="max-h-48 w-full object-contain"
            />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-black text-rhozly-on-surface flex items-center gap-1.5">
                <Upload size={12} /> Replace
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rhozly-outline/10 flex items-center justify-center">
              <Upload size={20} className="text-rhozly-on-surface/40" />
            </div>
            <div>
              <p className="text-sm font-black text-rhozly-on-surface/60">
                Drop an image or click to browse
              </p>
              <p className="text-xs font-bold text-rhozly-on-surface/30 mt-1">
                PNG · JPEG · WebP
              </p>
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {previewUrl && (
        <p className="text-[10px] font-bold text-rhozly-on-surface/30 text-center">
          Background will be removed when you click "Remove background"
        </p>
      )}
    </div>
  );
}

function RemovingBgPhase({
  imageUrl,
  progress,
  label,
}: {
  imageUrl: string;
  progress: number;
  label: string;
}) {
  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="rounded-2xl overflow-hidden border border-rhozly-outline/10 h-44 relative">
        <img src={imageUrl} alt="Processing" crossOrigin="anonymous" className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl px-5 py-4 shadow-lg border border-rhozly-outline/10 text-center min-w-[160px]">
            <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary mx-auto mb-2" />
            <p className="text-xs font-black text-rhozly-on-surface">Removing background…</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs font-bold text-rhozly-on-surface/50">
          <span className="truncate max-w-[200px]">{label || "Processing…"}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-rhozly-surface-low rounded-full overflow-hidden">
          <div
            className="h-full bg-rhozly-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] font-bold text-rhozly-on-surface/30 text-center">
          First use downloads AI model (~5 MB) — cached after that
        </p>
      </div>
    </div>
  );
}

function ConfirmingPhase({
  processedObjUrl,
  onBack,
  onConfirm,
}: {
  processedObjUrl: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="rounded-2xl bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] border border-rhozly-outline/10 overflow-hidden flex items-center justify-center h-52">
        <img src={processedObjUrl} alt="Processed sprite" className="h-full w-full object-contain" />
      </div>

      <div className="flex items-start gap-3 p-4 bg-rhozly-surface-low rounded-2xl">
        <AlertCircle size={16} className="text-rhozly-on-surface/40 shrink-0 mt-0.5" />
        <p className="text-xs font-bold text-rhozly-on-surface/50">
          Check the result on the checkered background — if the cut isn't clean, go back and try a different image.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-2xl border border-rhozly-outline/30 text-sm font-black text-rhozly-on-surface/60 flex items-center justify-center gap-2 hover:border-rhozly-outline/60 transition-colors"
        >
          <ChevronLeft size={15} /> Back
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-md"
        >
          Confirm <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function SilhouettePhase({
  selected,
  onSelect,
  onBack,
  onConfirm,
}: {
  selected: SilhouetteType | null;
  onSelect: (t: SilhouetteType) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="p-6 flex flex-col gap-5">
      <div>
        <p className="text-sm font-black text-rhozly-on-surface">Choose a silhouette shape</p>
        <p className="text-xs font-bold text-rhozly-on-surface/40 mt-0.5">
          A clean SVG silhouette will be used as the sprite.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {SILHOUETTE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-rhozly-primary ${
              selected === type
                ? "border-rhozly-primary bg-rhozly-primary/5 shadow-sm"
                : "border-rhozly-outline/20 hover:border-rhozly-primary/30"
            }`}
          >
            <PlantSilhouettePreview type={type} className="w-12 h-16 object-contain" />
            <span className="text-[10px] font-black text-rhozly-on-surface/60 text-center leading-tight">
              {SILHOUETTE_LABELS[type]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-2xl border border-rhozly-outline/30 text-sm font-black text-rhozly-on-surface/60 flex items-center justify-center gap-2 hover:border-rhozly-outline/60 transition-colors"
        >
          <ChevronLeft size={15} /> Back
        </button>
        <button
          onClick={onConfirm}
          disabled={!selected}
          className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-md disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed"
        >
          Use silhouette <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

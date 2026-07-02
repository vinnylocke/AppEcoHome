import React, { useState } from "react";
import {
  ArrowLeft, ZoomIn, ZoomOut, Settings, CheckCircle2, Loader2, Play, Pause,
  Pencil, MousePointer2, Hand, Sun, Lightbulb, Layers, Sprout, Undo2, Redo2, Magnet,
  Snowflake, Wind, Beaker, Droplets,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export type InteractionMode = "draw" | "move" | "rotate";
export type ViewMode = "2d" | "3d";

interface Layout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
  north_offset_deg: number;
}

interface Props {
  layout: Layout;
  homeId: string;
  saveState: "saved" | "saving" | "unsaved";
  canEdit: boolean;
  isMobile: boolean;

  interactionMode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Sun controls (3D)
  homeLatLng: { lat: number; lng: number } | null;
  setHomeLatLng: (v: { lat: number; lng: number }) => void;
  sunDate: string;
  setSunDate: (s: string) => void;
  sunMinutes: number;
  setSunMinutes: (n: number) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Overlays
  showLuxOverlay: boolean;
  setShowLuxOverlay: (v: boolean | ((prev: boolean) => boolean)) => void;
  showSunOverlay: boolean;
  setShowSunOverlay: (v: boolean | ((prev: boolean) => boolean)) => void;
  showCompanionsOverlay: boolean;
  setShowCompanionsOverlay: (v: boolean | ((prev: boolean) => boolean)) => void;
  showFrostOverlay?: boolean;
  setShowFrostOverlay?: (v: boolean | ((prev: boolean) => boolean)) => void;
  showWindOverlay?: boolean;
  setShowWindOverlay?: (v: boolean | ((prev: boolean) => boolean)) => void;
  showPhOverlay?: boolean;
  setShowPhOverlay?: (v: boolean | ((prev: boolean) => boolean)) => void;
  showMoistureOverlay?: boolean;
  setShowMoistureOverlay?: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Zoom (2D)
  adjustZoom: (delta: number) => void;

  // Navigation + settings
  onBack: () => void;
  onOpenSettings: () => void;

  // History (Wave 5A)
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;

  // Snap-to-grid (Wave 5E)
  snapToGrid?: boolean;
  setSnapToGrid?: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const MODE_META: Record<InteractionMode, { label: string; Icon: any; hint: string }> = {
  draw:   { label: "Draw",  Icon: Pencil,        hint: "Pick a shape, then drag on the canvas" },
  move:   { label: "Edit",  Icon: MousePointer2, hint: "Tap a shape to select, drag to move, handles to resize" },
  rotate: { label: "Look",  Icon: Hand,          hint: "Pan + zoom only. Shapes stay put." },
};

function SaveIndicator({ state, compact }: { state: Props["saveState"]; compact: boolean }) {
  if (state === "saving") {
    return (
      <div className="flex items-center gap-1.5 shrink-0" aria-label="Saving" data-testid="save-state-saving">
        <Loader2 size={14} className="animate-spin text-rhozly-on-surface/40" />
        {!compact && <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Saving…</span>}
      </div>
    );
  }
  if (state === "saved") {
    return (
      <div className="flex items-center gap-1.5 shrink-0" aria-label="Saved" data-testid="save-state-saved">
        <CheckCircle2 size={14} className="text-emerald-500" />
        {!compact && <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Saved</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 shrink-0" aria-label="Unsaved" data-testid="save-state-unsaved">
      <span className="w-2 h-2 rounded-full bg-amber-500" />
      {!compact && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Unsaved</span>}
    </div>
  );
}

function ModeStrip({
  canEdit,
  interactionMode,
  onModeChange,
  full,
}: {
  canEdit: boolean;
  interactionMode: InteractionMode;
  onModeChange: (m: InteractionMode) => void;
  full: boolean;
}) {
  const modes: InteractionMode[] = canEdit ? ["draw", "move", "rotate"] : ["move", "rotate"];

  return (
    <div
      className={`flex items-center gap-1 bg-rhozly-surface rounded-2xl p-1 ${full ? "w-full" : ""}`}
      role="tablist"
      aria-label="Editor mode"
    >
      {modes.map((id) => {
        const { label, Icon } = MODE_META[id];
        const active = interactionMode === id;
        return (
          <button
            key={id}
            data-testid={`mode-${id}-btn`}
            onClick={() => onModeChange(id)}
            role="tab"
            aria-selected={active}
            aria-label={label}
            className={`flex items-center justify-center gap-1.5 ${full ? "flex-1 min-h-[44px]" : "px-3 min-h-[36px]"} rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
              active
                ? "bg-white text-rhozly-on-surface shadow-sm"
                : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"
            }`}
          >
            <Icon size={full ? 16 : 14} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-rhozly-surface rounded-xl p-0.5" role="group" aria-label="View mode">
      {(["2d", "3d"] as ViewMode[]).map((m) => (
        <button
          key={m}
          data-testid={`view-${m}-btn`}
          onClick={() => setViewMode(m)}
          aria-pressed={viewMode === m}
          className={`min-h-[36px] min-w-[40px] px-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors ${
            viewMode === m ? "bg-white text-rhozly-on-surface shadow-sm" : "text-rhozly-on-surface/50"
          }`}
        >
          {m.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function UndoRedoGroup({
  onUndo, onRedo, canUndo, canRedo, vertical,
}: {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  vertical: boolean;
}) {
  return (
    <div className={`flex ${vertical ? "flex-col" : "items-center"} gap-0.5`} role="group" aria-label="History">
      <button
        data-testid="undo-btn"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (Ctrl/Cmd+Z)"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Undo2 size={18} />
      </button>
      <button
        data-testid="redo-btn"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (Ctrl/Cmd+Shift+Z)"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Redo2 size={18} />
      </button>
    </div>
  );
}

function ZoomGroup({ adjustZoom, vertical }: { adjustZoom: (delta: number) => void; vertical: boolean }) {
  return (
    <div className={`flex ${vertical ? "flex-col" : "items-center"} gap-0.5`} role="group" aria-label="Zoom">
      <button
        data-testid="zoom-in-btn"
        onClick={() => adjustZoom(0.15)}
        aria-label="Zoom in"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
      >
        <ZoomIn size={18} />
      </button>
      <button
        data-testid="zoom-out-btn"
        onClick={() => adjustZoom(-0.15)}
        aria-label="Zoom out"
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
      >
        <ZoomOut size={18} />
      </button>
    </div>
  );
}

function SunControlsInline({
  sunDate, setSunDate, sunMinutes, setSunMinutes, isPlaying, setIsPlaying,
}: {
  sunDate: string;
  setSunDate: (s: string) => void;
  sunMinutes: number;
  setSunMinutes: (n: number) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        data-testid="sun-date-input"
        type="date"
        value={sunDate}
        onChange={(e) => { setSunDate(e.target.value); setIsPlaying(false); }}
        className="bg-rhozly-surface rounded-lg px-2 min-h-[36px] text-[11px] font-black text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
      />
      <input
        data-testid="sun-time-slider"
        type="range"
        min={0}
        max={1440}
        step={5}
        value={sunMinutes}
        onChange={(e) => { setSunMinutes(Number(e.target.value)); setIsPlaying(false); }}
        className="w-28 accent-rhozly-primary"
        aria-label="Time of day"
      />
      <span className="text-[11px] font-black text-rhozly-on-surface/70 w-10 shrink-0 tabular-nums">
        {String(Math.floor(sunMinutes / 60)).padStart(2, "0")}:{String(sunMinutes % 60).padStart(2, "0")}
      </span>
      <button
        data-testid="sun-play-btn"
        onClick={() => setIsPlaying((p) => !p)}
        aria-label={isPlaying ? "Pause sun animation" : "Play sun animation"}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
    </div>
  );
}

function LayersGroup({
  showLuxOverlay, setShowLuxOverlay, showSunOverlay, setShowSunOverlay,
  showCompanionsOverlay, setShowCompanionsOverlay,
  showFrostOverlay, setShowFrostOverlay,
  showWindOverlay, setShowWindOverlay,
  showPhOverlay, setShowPhOverlay,
  showMoistureOverlay, setShowMoistureOverlay,
}: Pick<Props, "showLuxOverlay" | "setShowLuxOverlay" | "showSunOverlay" | "setShowSunOverlay" | "showCompanionsOverlay" | "setShowCompanionsOverlay" | "showFrostOverlay" | "setShowFrostOverlay" | "showWindOverlay" | "setShowWindOverlay" | "showPhOverlay" | "setShowPhOverlay" | "showMoistureOverlay" | "setShowMoistureOverlay">) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Layers">
      <button
        data-testid="toggle-lux-btn"
        onClick={() => setShowLuxOverlay((v) => !v)}
        aria-pressed={showLuxOverlay}
        className={`min-h-[36px] px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${
          showLuxOverlay ? "bg-amber-100 text-amber-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface"
        }`}
      >
        <Lightbulb size={14} /> Lux
      </button>
      <button
        data-testid="toggle-sun-btn"
        onClick={() => setShowSunOverlay((v) => !v)}
        aria-pressed={showSunOverlay}
        className={`min-h-[36px] px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${
          showSunOverlay ? "bg-yellow-100 text-yellow-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface"
        }`}
      >
        <Sun size={14} /> Sun
      </button>
      <button
        data-testid="toggle-companions-btn"
        onClick={() => setShowCompanionsOverlay((v) => !v)}
        aria-pressed={showCompanionsOverlay}
        className={`min-h-[36px] px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${
          showCompanionsOverlay ? "bg-emerald-100 text-emerald-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface"
        }`}
      >
        <Sprout size={14} /> Companions
      </button>
      {setShowFrostOverlay && (
        <button
          data-testid="toggle-frost-btn"
          onClick={() => setShowFrostOverlay((v) => !v)}
          aria-pressed={!!showFrostOverlay}
          className={`min-h-[36px] px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${
            showFrostOverlay ? "bg-sky-100 text-sky-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface"
          }`}
        >
          <Snowflake size={14} /> Frost
        </button>
      )}
      {setShowWindOverlay && (
        <button
          data-testid="toggle-wind-btn"
          onClick={() => setShowWindOverlay((v) => !v)}
          aria-pressed={!!showWindOverlay}
          className={`min-h-[36px] px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${
            showWindOverlay ? "bg-cyan-100 text-cyan-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface"
          }`}
        >
          <Wind size={14} /> Wind
        </button>
      )}
      {setShowPhOverlay && (
        <button
          data-testid="toggle-ph-btn"
          onClick={() => setShowPhOverlay((v) => !v)}
          aria-pressed={!!showPhOverlay}
          className={`min-h-[36px] px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${
            showPhOverlay ? "bg-purple-100 text-purple-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface"
          }`}
        >
          <Beaker size={14} /> pH
        </button>
      )}
      {setShowMoistureOverlay && (
        <button
          data-testid="toggle-moisture-btn"
          onClick={() => setShowMoistureOverlay((v) => !v)}
          aria-pressed={!!showMoistureOverlay}
          className={`min-h-[36px] px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${
            showMoistureOverlay ? "bg-blue-100 text-blue-700" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface"
          }`}
        >
          <Droplets size={14} /> Moisture
        </button>
      )}
    </div>
  );
}

function LocationPrompt({
  setHomeLatLng, homeId,
}: {
  setHomeLatLng: (v: { lat: number; lng: number }) => void;
  homeId: string;
}) {
  return (
    <button
      data-testid="sun-location-prompt"
      onClick={() =>
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setHomeLatLng({ lat, lng });
            supabase.from("homes").update({ lat, lng }).eq("id", homeId);
          },
          () => {},
        )
      }
      className="min-h-[44px] px-3 rounded-xl text-[11px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-1.5 shrink-0"
      title="Sun simulation needs your location"
    >
      <Sun size={16} /> Enable location
    </button>
  );
}

export default function GardenEditorToolbar(props: Props) {
  const {
    layout, homeId, saveState, canEdit, isMobile,
    interactionMode, onModeChange,
    viewMode, setViewMode,
    homeLatLng, setHomeLatLng,
    sunDate, setSunDate, sunMinutes, setSunMinutes, isPlaying, setIsPlaying,
    showLuxOverlay, setShowLuxOverlay, showSunOverlay, setShowSunOverlay,
    showCompanionsOverlay, setShowCompanionsOverlay,
    showFrostOverlay, setShowFrostOverlay,
    showWindOverlay, setShowWindOverlay,
    showPhOverlay, setShowPhOverlay,
    showMoistureOverlay, setShowMoistureOverlay,
    adjustZoom, onBack, onOpenSettings,
    onUndo, onRedo, canUndo, canRedo,
    snapToGrid, setSnapToGrid,
  } = props;

  const [bubbleOpen, setBubbleOpen] = useState<null | "view" | "sun" | "layers">(null);

  if (isMobile) {
    return (
      <>
        {/* Row 1 — back + name + save */}
        <div
          data-testid="editor-toolbar-mobile-row-1"
          className="flex items-center gap-2 px-3 py-2 bg-white border-b border-rhozly-outline/20 shrink-0"
        >
          <button
            data-testid="back-to-layouts-btn"
            onClick={onBack}
            aria-label="Back to layouts"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-black text-rhozly-on-surface text-sm truncate">{layout.name}</p>
            <p className="text-[10px] font-bold text-rhozly-on-surface/40">{layout.canvas_w_m}m × {layout.canvas_h_m}m</p>
          </div>
          <SaveIndicator state={saveState} compact />
        </div>

        {/* Row 2 — full-width mode strip + active mode hint */}
        <div
          data-testid="editor-toolbar-mobile-row-2"
          className="px-3 py-2 bg-white border-b border-rhozly-outline/20 shrink-0 space-y-1.5"
        >
          <ModeStrip canEdit={canEdit} interactionMode={interactionMode} onModeChange={onModeChange} full />
          <p className="text-[10px] font-bold text-rhozly-on-surface/50 text-center px-2">
            {MODE_META[interactionMode].hint}
          </p>
        </div>

        {/* Floating action bubble — bottom-right of canvas, above shape rail */}
        <div
          data-testid="editor-floating-bubble"
          className="absolute right-3 z-30 flex flex-col items-end gap-2 pointer-events-none"
          style={{ bottom: "calc(110px + env(safe-area-inset-bottom, 0px))" }}
        >
          {/* Popovers */}
          {bubbleOpen === "view" && (
            <div className="pointer-events-auto bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 p-2 flex items-center gap-2">
              <ViewToggle viewMode={viewMode} setViewMode={(m) => { setViewMode(m); setBubbleOpen(null); }} />
            </div>
          )}
          {bubbleOpen === "sun" && viewMode === "3d" && homeLatLng && (
            <div className="pointer-events-auto bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 p-3 max-w-[calc(100vw-24px)]">
              <SunControlsInline
                sunDate={sunDate}
                setSunDate={setSunDate}
                sunMinutes={sunMinutes}
                setSunMinutes={setSunMinutes}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
              />
            </div>
          )}
          {bubbleOpen === "layers" && (
            <div className="pointer-events-auto bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 p-2 flex items-center gap-1">
              <LayersGroup
                // Type-only cast: this call site never passed the companions
                // overlay props (pre-existing behaviour, preserved verbatim —
                // the Companions button here receives undefined setters).
                {...({
                  showLuxOverlay,
                  setShowLuxOverlay,
                  showSunOverlay,
                  setShowSunOverlay,
                } as React.ComponentProps<typeof LayersGroup>)}
              />
            </div>
          )}

          {/* Buttons */}
          <div className="pointer-events-auto bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 p-1 flex flex-col gap-0.5">
            {canEdit && <UndoRedoGroup onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} vertical />}
            <button
              data-testid="bubble-view-btn"
              onClick={() => setBubbleOpen((s) => (s === "view" ? null : "view"))}
              aria-label="View mode"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/70 hover:bg-rhozly-surface transition-colors"
            >
              {viewMode.toUpperCase()}
            </button>
            {viewMode === "2d" && (
              <ZoomGroup adjustZoom={adjustZoom} vertical />
            )}
            {canEdit && setSnapToGrid && (
              <button
                data-testid="toggle-snap-btn"
                onClick={() => setSnapToGrid((v) => !v)}
                aria-pressed={!!snapToGrid}
                aria-label="Snap to grid"
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
                  snapToGrid ? "bg-rhozly-primary/15 text-rhozly-primary" : "text-rhozly-on-surface/60 hover:bg-rhozly-surface"
                }`}
              >
                <Magnet size={18} />
              </button>
            )}
            {viewMode === "3d" && homeLatLng && (
              <>
                <button
                  data-testid="bubble-sun-btn"
                  onClick={() => setBubbleOpen((s) => (s === "sun" ? null : "sun"))}
                  aria-label="Sun controls"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors"
                >
                  <Sun size={18} />
                </button>
                <button
                  data-testid="bubble-layers-btn"
                  onClick={() => setBubbleOpen((s) => (s === "layers" ? null : "layers"))}
                  aria-label="Layers"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors"
                >
                  <Layers size={18} />
                </button>
              </>
            )}
            {viewMode === "3d" && !homeLatLng && (
              <LocationPrompt setHomeLatLng={setHomeLatLng} homeId={homeId} />
            )}
            <button
              data-testid="canvas-settings-btn"
              onClick={onOpenSettings}
              aria-label="Canvas settings"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </>
    );
  }

  // Desktop — single row
  return (
    <div
      data-testid="editor-toolbar-desktop"
      className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-rhozly-outline/20 shrink-0"
    >
      <button
        data-testid="back-to-layouts-btn"
        onClick={onBack}
        aria-label="Back to layouts"
        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="min-w-0 max-w-[280px]">
        <p className="font-black text-rhozly-on-surface text-sm truncate">{layout.name}</p>
        <p className="text-[10px] font-bold text-rhozly-on-surface/40">{layout.canvas_w_m}m × {layout.canvas_h_m}m</p>
      </div>

      <SaveIndicator state={saveState} compact={false} />

      <div className="flex-1" />

      {canEdit && <UndoRedoGroup onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} vertical={false} />}

      <ModeStrip canEdit={canEdit} interactionMode={interactionMode} onModeChange={onModeChange} full={false} />

      <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />

      {viewMode === "2d" && <ZoomGroup adjustZoom={adjustZoom} vertical={false} />}

      {canEdit && setSnapToGrid && (
        <button
          data-testid="toggle-snap-btn"
          onClick={() => setSnapToGrid((v) => !v)}
          aria-pressed={!!snapToGrid}
          title="Snap to 0.5 m grid"
          className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors ${
            snapToGrid ? "bg-rhozly-primary/15 text-rhozly-primary" : "text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface"
          }`}
        >
          <Magnet size={16} />
        </button>
      )}

      {viewMode === "3d" && (
        homeLatLng ? (
          <>
            <SunControlsInline
              sunDate={sunDate}
              setSunDate={setSunDate}
              sunMinutes={sunMinutes}
              setSunMinutes={setSunMinutes}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
            />
            <LayersGroup
              showLuxOverlay={showLuxOverlay}
              setShowLuxOverlay={setShowLuxOverlay}
              showSunOverlay={showSunOverlay}
              setShowSunOverlay={setShowSunOverlay}
              showCompanionsOverlay={showCompanionsOverlay}
              setShowCompanionsOverlay={setShowCompanionsOverlay}
              showFrostOverlay={showFrostOverlay}
              setShowFrostOverlay={setShowFrostOverlay}
              showWindOverlay={showWindOverlay}
              setShowWindOverlay={setShowWindOverlay}
              showPhOverlay={showPhOverlay}
              setShowPhOverlay={setShowPhOverlay}
              showMoistureOverlay={showMoistureOverlay}
              setShowMoistureOverlay={setShowMoistureOverlay}
            />
          </>
        ) : (
          <LocationPrompt setHomeLatLng={setHomeLatLng} homeId={homeId} />
        )
      )}

      <button
        data-testid="canvas-settings-btn"
        onClick={onOpenSettings}
        aria-label="Canvas settings"
        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ImageOff,
  Clock,
  X,
  ScanSearch,
} from "lucide-react";
import { IconPest } from "../constants/icons";
import type { PlantDoctorSession, SessionCandidate, SessionRegion } from "../hooks/usePlantDoctorSessions";
import { boxToCropRect } from "../lib/sceneMap";

interface Props {
  sessions: PlantDoctorSession[];
  isLoading: boolean;
  onLoad: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Handles both old plain-string candidates and new {name, scientific_name, confidence} objects
function candidateName(c: SessionCandidate): string {
  return typeof c === "string" ? c : c.name;
}

function candidateConfidence(c: SessionCandidate): number | null {
  return typeof c === "string" ? null : (c.confidence ?? null);
}

function candidateScientific(c: SessionCandidate): string | null {
  return typeof c === "string" ? null : (c.scientific_name ?? null);
}

/** Renders the photo cropped to a detected plant's bounding box (canvas
 *  drawImage — display only, so no CORS-taint with the signed storage URL).
 *  Preserves the region's true aspect ratio; the parent constrains the box. */
function CroppedPlantImage({ src, box, alt }: { src: string | null; box: number[]; alt?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src || box.length !== 4) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const { sx, sy, sw, sh } = boxToCropRect(box as [number, number, number, number], img.naturalWidth, img.naturalHeight);
      const MAX = 320;
      const scale = Math.min(1, MAX / Math.max(sw, sh));
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try { ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); }
      catch { if (!cancelled) setFailed(true); }
    };
    img.onerror = () => { if (!cancelled) setFailed(true); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, box]);

  if (failed || !src) {
    return <ImageOff size={16} className="text-rhozly-on-surface/20" />;
  }
  return <canvas ref={canvasRef} aria-label={alt} className="max-w-full max-h-full" />;
}

/** A drill-down row for one detected plant in a Group ID session. */
function SceneRegionRow({ session, region, index }: { session: PlantDoctorSession; region: SessionRegion; index: number }) {
  const confirmedName = session.results.confirmed?.[String(index)] ?? null;
  return (
    <div data-testid={`doctor-history-scene-plant-${index}`} className="flex gap-3 p-2 rounded-xl bg-rhozly-surface-low/60">
      <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-rhozly-surface-low flex items-center justify-center">
        <CroppedPlantImage src={session.imageUrl ?? null} box={region.box} alt={`Plant ${index + 1}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">Plant {index + 1}</p>
        <div className="space-y-1">
          {(region.candidates ?? []).map((c, i) => {
            const name = candidateName(c);
            const confidence = candidateConfidence(c);
            const isConfirmed = confirmedName != null && name === confirmedName;
            return (
              <div key={i} className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-xs font-bold ${isConfirmed ? "bg-green-50 text-green-800" : "text-rhozly-on-surface/60"}`}>
                <span className="flex items-center gap-1.5 min-w-0">
                  {isConfirmed && <CheckCircle2 size={12} className="text-green-600 shrink-0" />}
                  <span className="truncate">{name}</span>
                </span>
                {confidence !== null && <span className="shrink-0 text-[10px] font-black text-rhozly-on-surface/50 tabular-nums">{confidence}%</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: PlantDoctorSession }) {
  const [expanded, setExpanded] = useState(false);
  const isScene = session.action === "scene";
  const isIdentify = session.action === "identify";
  const isPest = session.action === "pest";
  const regions = session.results.regions ?? [];
  // Summary names for a Group ID card — confirmed identity preferred, else top candidate.
  const sceneNames = isScene
    ? regions.map((r, i) => session.results.confirmed?.[String(i)] ?? (r.candidates?.[0] ? candidateName(r.candidates[0]) : "Unknown"))
    : [];
  const candidates = isIdentify
    ? session.results.possible_names ?? []
    : isPest
    ? session.results.possible_pests ?? []
    : isScene
    ? []
    : session.results.possible_diseases ?? [];

  return (
    <div
      data-testid={`doctor-history-card-${session.id}`}
      className="bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm overflow-hidden"
    >
      <button
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex gap-3 p-4">
          {/* Thumbnail */}
          <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-rhozly-surface-low flex items-center justify-center">
            {session.imageUrl ? (
              <img
                src={session.imageUrl}
                alt="Session"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageOff size={20} className="text-rhozly-on-surface/20" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  isScene
                    ? "bg-sky-100 text-sky-700"
                    : isIdentify
                    ? "bg-rhozly-primary/10 text-rhozly-primary"
                    : isPest
                    ? "bg-orange-100 text-orange-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isScene ? <ScanSearch size={9} /> : isIdentify ? <Search size={9} /> : isPest ? <IconPest size={9} /> : <Activity size={9} />}
                {isScene ? "Group ID" : isIdentify ? "Identify" : isPest ? "Pest" : "Diagnose"}
              </span>
              <span className="text-[10px] font-bold text-rhozly-on-surface/40 flex items-center gap-1">
                <Clock size={9} />
                {formatDate(session.created_at)}
              </span>
            </div>

            {isScene ? (
              regions.length > 0 ? (
                <p className="text-xs font-bold text-rhozly-on-surface/50 truncate">
                  {regions.length} plant{regions.length === 1 ? "" : "s"} — {sceneNames.slice(0, 2).join(", ")}
                  {sceneNames.length > 2 && ` +${sceneNames.length - 2} more`}
                </p>
              ) : (
                <p className="text-xs font-bold text-rhozly-on-surface/30 italic">No plants detected</p>
              )
            ) : session.confirmed_value ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                <span className="text-sm font-black text-rhozly-on-surface truncate">
                  {session.confirmed_value}
                </span>
              </div>
            ) : candidates.length > 0 ? (
              <p className="text-xs font-bold text-rhozly-on-surface/50 truncate">
                {candidates.slice(0, 2).map(candidateName).join(", ")}
                {candidates.length > 2 && ` +${candidates.length - 2} more`}
              </p>
            ) : (
              <p className="text-xs font-bold text-rhozly-on-surface/30 italic">
                No candidates recorded
              </p>
            )}
          </div>

          <div className="shrink-0 self-center text-rhozly-on-surface/30">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-rhozly-outline/10 p-4 space-y-4 animate-in fade-in duration-200">
          {session.imageUrl && (
            <img
              src={session.imageUrl}
              alt="Session full"
              className="w-full max-h-64 object-contain rounded-xl bg-rhozly-surface-low"
            />
          )}

          {session.results.notes && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">
                Doctor's Notes
              </p>
              <p className="text-sm text-rhozly-on-surface/70 font-medium leading-relaxed whitespace-pre-wrap">
                {session.results.notes}
              </p>
            </div>
          )}

          {isScene && regions.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
                Detected plants
              </p>
              <div className="space-y-2" data-testid="doctor-history-scene-plants">
                {regions.map((region, i) => (
                  <SceneRegionRow key={i} session={session} region={region} index={i} />
                ))}
              </div>
            </div>
          )}

          {candidates.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
                {isIdentify ? "Possible Plants" : isPest ? "Possible Insects / Pests" : "Possible Conditions"}
              </p>
              <div className="space-y-1.5">
                {candidates.map((c, i) => {
                  const name = candidateName(c);
                  const confidence = candidateConfidence(c);
                  const scientific = candidateScientific(c);
                  const isConfirmed = name === session.confirmed_value;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-bold ${
                        isConfirmed
                          ? "bg-green-50 border border-green-200 text-green-800"
                          : "bg-rhozly-surface-low text-rhozly-on-surface/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isConfirmed && (
                          <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate">{name}</div>
                          {scientific && (
                            <div className="text-[10px] font-medium italic opacity-60 truncate">{scientific}</div>
                          )}
                        </div>
                      </div>
                      {confidence !== null && (
                        <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${
                          confidence >= 80 ? "bg-emerald-100 text-emerald-700"
                          : confidence >= 60 ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                        }`}>
                          {confidence}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isScene && (session.confirmed_value ? (
            <div className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-xl border border-green-200">
              <CheckCircle2 size={15} className="text-green-600 shrink-0" />
              <div>
                <p className="text-xs font-black text-green-700">Confirmed</p>
                <p className="text-sm font-black text-green-800">
                  {session.confirmed_value}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs font-bold text-rhozly-on-surface/30 italic text-center py-1">
              Result not confirmed
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

type ActionFilter = "all" | "identify" | "diagnose" | "pest" | "scene";

const ACTION_LABELS: Record<ActionFilter, string> = {
  all: "All",
  identify: "Identify",
  diagnose: "Diagnose",
  pest: "Pest",
  scene: "Group ID",
};

export default function PlantDoctorHistory({ sessions, isLoading, onLoad }: Props) {
  useEffect(() => {
    onLoad();
  }, [onLoad]);

  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions.filter((s) => {
      if (actionFilter !== "all" && s.action !== actionFilter) return false;
      if (!q) return true;
      // Match against confirmed value + every candidate name (string or object).
      const haystack: string[] = [s.confirmed_value ?? ""];
      const pushCandidate = (c: SessionCandidate) => {
        if (typeof c === "string") haystack.push(c);
        else {
          haystack.push(c.name);
          if (c.scientific_name) haystack.push(c.scientific_name);
        }
      };
      if (s.action === "scene") {
        Object.values(s.results.confirmed ?? {}).forEach((v) => haystack.push(v));
        (s.results.regions ?? []).forEach((r) => (r.candidates ?? []).forEach(pushCandidate));
      } else {
        const candidatesList = s.action === "identify"
          ? s.results.possible_names
          : s.action === "pest"
            ? s.results.possible_pests
            : s.results.possible_diseases;
        (candidatesList ?? []).forEach(pushCandidate);
      }
      return haystack.some((h) => h.toLowerCase().includes(q));
    });
  }, [sessions, actionFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-rhozly-on-surface/40">
        <Loader2 size={28} className="animate-spin" />
        <p className="text-sm font-bold">Loading history…</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-rhozly-on-surface/40">
        <div className="w-16 h-16 rounded-full bg-rhozly-surface-low flex items-center justify-center">
          <Clock size={24} className="text-rhozly-on-surface/20" />
        </div>
        <p className="text-sm font-black text-rhozly-on-surface/50">No sessions yet</p>
        <p className="text-xs font-bold text-center max-w-xs">
          Identify or diagnose a plant and your results will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="doctor-history-list">
      {/* Filter row */}
      <div className="bg-white rounded-2xl border border-rhozly-outline/10 p-3 space-y-2.5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by plant or condition name…"
            data-testid="doctor-history-search"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-rhozly-outline/20 bg-rhozly-surface-lowest text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-rhozly-surface-low rounded-xl p-1" data-testid="doctor-history-action-filter">
          {(Object.keys(ACTION_LABELS) as ActionFilter[]).map((key) => (
            <button
              key={key}
              onClick={() => setActionFilter(key)}
              aria-pressed={actionFilter === key}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${actionFilter === key ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
              data-testid={`doctor-history-filter-${key}`}
            >
              {ACTION_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-rhozly-on-surface/40">
          <p className="text-sm font-black">No matching sessions</p>
          <p className="text-xs font-bold mt-1">Try a different filter or search term.</p>
        </div>
      ) : (
        filtered.map((s) => <SessionCard key={s.id} session={s} />)
      )}
    </div>
  );
}

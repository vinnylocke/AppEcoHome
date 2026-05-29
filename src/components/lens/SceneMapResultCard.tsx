import React, { useEffect, useRef, useState } from "react";
import { Sprout } from "lucide-react";
import type { SceneMapResult } from "../../services/plantDoctorService";
import { boxToPercent, clampConfidence, type Box2d } from "../../lib/sceneMap";

interface Props {
  imageUrl: string;
  result: SceneMapResult;
}

// Distinct, repeating palette so adjacent boxes/rows are easy to tell apart.
const PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4",
  "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#eab308",
];
const colorFor = (i: number) => PALETTE[i % PALETTE.length];

/**
 * Multi-ID result — the photo with a numbered, colour-coded bounding box per
 * detected plant, and a mapping below listing each box's ranked candidate
 * identities with a confidence weight bar. Tapping a box highlights its mapping
 * row and vice-versa.
 */
export default function SceneMapResultCard({ imageUrl, result }: Props) {
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  // When a region becomes active (e.g. from tapping a box), bring its mapping
  // row into view so the two stay in sync on small screens.
  useEffect(() => {
    if (activeRegion == null) return;
    rowRefs.current[activeRegion]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeRegion]);

  const regions = result.regions ?? [];

  if (regions.length === 0) {
    return (
      <div
        data-testid="scene-map-result"
        className="flex flex-col items-center justify-center gap-3 py-12 text-center text-rhozly-on-surface/50"
      >
        <Sprout size={28} className="text-rhozly-primary/40" />
        <p className="text-sm font-black text-rhozly-on-surface/70">No distinct plants found</p>
        <p className="text-xs font-bold max-w-xs">
          Try a clearer, wider shot in good light — and make sure the plants you want identified are in frame.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="scene-map-result" className="space-y-5">
      {/* Photo with the detected-plant overlay */}
      <div className="relative rounded-3xl overflow-hidden border border-rhozly-outline/15 bg-rhozly-surface-low/40">
        <img src={imageUrl} alt="Your plants" className="block w-full h-auto select-none" draggable={false} />
        {regions.map((region, i) => {
          const { topPct, leftPct, widthPct, heightPct } = boxToPercent(region.box as Box2d);
          const isActive = activeRegion === i;
          const color = colorFor(i);
          return (
            <button
              key={i}
              type="button"
              data-testid={`scene-map-box-${i}`}
              onClick={() => setActiveRegion((prev) => (prev === i ? null : i))}
              aria-label={`Plant ${i + 1}`}
              aria-pressed={isActive}
              className="absolute rounded-lg transition-all"
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                border: `2.5px solid ${color}`,
                boxShadow: isActive ? `0 0 0 3px ${color}66` : "none",
                background: isActive ? `${color}1f` : "transparent",
                zIndex: isActive ? 2 : 1,
              }}
            >
              <span
                className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow"
                style={{ background: color }}
              >
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>

      {result.notes && (
        <p className="text-[11px] font-bold text-rhozly-on-surface/55 leading-relaxed px-1">{result.notes}</p>
      )}

      {/* Mapping — ranked, weighted candidates per box */}
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1">
          What we think each plant is
        </p>
        {regions.map((region, i) => {
          const color = colorFor(i);
          const isActive = activeRegion === i;
          return (
            <div
              key={i}
              ref={(el) => { rowRefs.current[i] = el; }}
              data-testid={`scene-map-region-${i}`}
              onClick={() => setActiveRegion((prev) => (prev === i ? null : i))}
              className={`rounded-2xl border bg-white p-3 cursor-pointer transition-all ${
                isActive ? "border-rhozly-primary ring-1 ring-rhozly-primary/30" : "border-rhozly-outline/15 hover:border-rhozly-primary/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                  style={{ background: color }}
                >
                  {i + 1}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  Plant {i + 1}
                </span>
              </div>
              <ul className="space-y-2">
                {region.candidates.map((c, j) => {
                  const pct = clampConfidence(c.confidence);
                  return (
                    <li key={j} className={j === 0 ? "" : "opacity-80"}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0">
                          <span className={`text-sm ${j === 0 ? "font-black text-rhozly-on-surface" : "font-bold text-rhozly-on-surface/70"} leading-tight`}>
                            {c.name}
                          </span>
                          {c.scientific_name && (
                            <span className="block text-[10px] font-medium italic text-rhozly-on-surface/45 truncate">
                              {c.scientific_name}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] font-black text-rhozly-on-surface/60 shrink-0 tabular-nums">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-rhozly-surface-low overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: color, opacity: j === 0 ? 1 : 0.55 }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

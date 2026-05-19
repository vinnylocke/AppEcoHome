import React, { useState } from "react";
import { X, Compass } from "lucide-react";
import GardenCompass from "../GardenCompass";

interface Props {
  initialOffset: number;
  onSave: (offsetDeg: number) => void | Promise<void>;
  onClose: () => void;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const snap45 = (d: number) => DIRS[Math.round(((d % 360) + 360) % 360 / 45) % 8];

export default function GardenNorthSheet({ initialOffset, onSave, onClose }: Props) {
  const [offset, setOffset] = useState<number>(initialOffset);
  const [readState, setReadState] = useState<"idle" | "ready" | "done">("idle");
  const [saving, setSaving] = useState(false);

  async function takeReading() {
    try {
      if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm !== "granted") { setReadState("idle"); return; }
      }
      setReadState("ready");
      const onReading = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
        let heading: number | null = null;
        if (e.webkitCompassHeading != null) {
          heading = e.webkitCompassHeading;
        } else if (e.absolute && e.alpha != null) {
          heading = (360 - e.alpha) % 360;
        }
        if (heading == null) return;
        setOffset(Math.round(heading) % 360);
        setReadState("done");
        window.removeEventListener("deviceorientationabsolute", onReading as any);
        window.removeEventListener("deviceorientation", onReading as any);
      };
      window.addEventListener("deviceorientationabsolute", onReading as any, { once: true });
      window.addEventListener("deviceorientation", onReading as any, { once: true });
      setTimeout(() => {
        window.removeEventListener("deviceorientationabsolute", onReading as any);
        window.removeEventListener("deviceorientation", onReading as any);
        if (readState !== "done") setReadState("idle");
      }, 8000);
    } catch { setReadState("idle"); }
  }

  async function handleSave() {
    setSaving(true);
    try { await onSave(offset); } finally { setSaving(false); }
  }

  const northLabel = snap45(offset === 0 ? 0 : (360 - offset) % 360);

  return (
    <div
      data-testid="north-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-rhozly-outline/10">
          <div className="flex items-center gap-2">
            <Compass size={18} className="text-rhozly-primary" />
            <p className="font-black text-rhozly-on-surface">Set North</p>
          </div>
          <button
            data-testid="north-sheet-close"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:bg-rhozly-surface"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-rhozly-on-surface/60 leading-relaxed">
            Drag the <span className="font-black text-rhozly-primary">N arrow</span> to point where North actually is relative to your garden, or tap <span className="font-black text-rhozly-on-surface">Read Now</span> to use your phone's compass.
          </p>

          <div className="relative w-44 h-44 mx-auto rounded-2xl overflow-hidden bg-rhozly-bg border border-rhozly-outline/20">
            <svg width="100%" height="100%" viewBox="0 0 176 176" className="absolute inset-0 pointer-events-none">
              {[44, 88, 132].map(p => (
                <g key={p}>
                  <line x1={p} y1={0} x2={p} y2={176} stroke="#e5e7eb" strokeWidth={0.8} />
                  <line x1={0} y1={p} x2={176} y2={p} stroke="#e5e7eb" strokeWidth={0.8} />
                </g>
              ))}
              <line x1={0} y1={88} x2={176} y2={88} stroke="#9ca3af" strokeWidth={1.5} />
              <line x1={88} y1={0} x2={88} y2={176} stroke="#9ca3af" strokeWidth={1.5} />
              <text x={158} y={82} fontSize={9} fontWeight="bold" fill="#9ca3af">+X</text>
              <text x={92} y={168} fontSize={9} fontWeight="bold" fill="#9ca3af">+Z</text>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <GardenCompass value={offset} onChange={v => { setOffset(v); setReadState("idle"); }} size={120} />
            </div>
          </div>

          <p className="text-xs text-center text-rhozly-on-surface/60">
            North is <span className="font-black text-rhozly-primary">{northLabel}</span> of the grid origin
          </p>

          <div className="bg-rhozly-surface rounded-2xl p-3">
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">Auto-calibrate</p>
            {readState !== "done" ? (
              <>
                <p className="text-xs text-rhozly-on-surface/60 mb-2 leading-relaxed">
                  Stand in the garden, hold the phone flat, rotate until the on-screen layout matches reality, then tap Read Now.
                </p>
                <button
                  data-testid="north-sheet-read-btn"
                  onClick={takeReading}
                  className={`w-full min-h-[44px] rounded-xl text-xs font-black transition-colors ${
                    readState === "ready" ? "bg-rhozly-primary/20 text-rhozly-primary animate-pulse" : "bg-rhozly-primary text-white"
                  }`}
                >
                  {readState === "ready" ? "Waiting for sensor…" : "Read Now"}
                </button>
              </>
            ) : (
              <p className="text-xs text-rhozly-primary font-black text-center py-1">
                ✓ Set from phone compass — drag the N arrow to fine-tune
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-rhozly-outline/10">
          <button
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60"
          >
            Cancel
          </button>
          <button
            data-testid="north-sheet-save"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

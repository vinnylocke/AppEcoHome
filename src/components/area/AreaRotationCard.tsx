import React, { useEffect, useMemo, useState } from "react";
import { Sprout, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import InfoTooltip from "../InfoTooltip";
import {
  buildAreaRotationHistory,
  recommendRotation,
  type InventoryItemForRotation,
} from "../../lib/rotationEngine";
import { usePersona } from "../../hooks/usePersona";
import SuggestRotationPlantsSheet from "./SuggestRotationPlantsSheet";

interface Props {
  homeId: string;
  areaId: string;
  areaName: string;
  aiEnabled: boolean;
}

/**
 * Crop-rotation card — slotted inside AreaInsightsPanel.
 *
 * - Builds the area's per-year family history from `inventory_items`
 *   joined to `plants.family`.
 * - Renders the timeline (newest first, full history — no lookback cap).
 * - Renders avoid + prefer chips driven by the family rules map.
 * - For AI-enabled tiers: shows a "Suggest plants for next season"
 *   button that opens SuggestRotationPlantsSheet (Layer B).
 */
export default function AreaRotationCard({
  homeId,
  areaId,
  areaName,
  aiEnabled,
}: Props) {
  const persona = usePersona();
  const [rows, setRows] = useState<InventoryItemForRotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    if (!homeId || !areaId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: queryErr } = await supabase
          .from("inventory_items")
          .select(
            "id, area_id, plant_name, planted_at, ended_at, created_at, plants(family)",
          )
          .eq("home_id", homeId)
          .eq("area_id", areaId);
        if (queryErr) throw queryErr;
        if (cancelled) return;
        const mapped: InventoryItemForRotation[] = (data ?? []).map((r: any) => ({
          id: r.id,
          area_id: r.area_id,
          plant_name: r.plant_name ?? null,
          planted_at: r.planted_at ?? null,
          ended_at: r.ended_at ?? null,
          created_at: r.created_at ?? null,
          family: r.plants?.family ?? null,
        }));
        setRows(mapped);
      } catch (err: any) {
        Logger.error("AreaRotationCard: load failed", err, { areaId });
        if (!cancelled) setError(err?.message ?? "Couldn't load rotation history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeId, areaId]);

  const history = useMemo(
    () => buildAreaRotationHistory(areaId, rows),
    [areaId, rows],
  );
  const recommendation = useMemo(
    () => recommendRotation(history),
    [history],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs font-bold text-rhozly-on-surface/40">
        <Loader2 size={14} className="animate-spin" /> Loading rotation history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-xs font-bold text-red-700">
        {error}
      </div>
    );
  }

  const tooltipBody =
    persona === "experienced"
      ? "Avoid replanting the same family for the listed window. Reduces pest + pathogen buildup and balances soil nutrient draw."
      : "Different plant families take different things from the soil and attract different pests. Rotating what grows where every year keeps the soil healthier and reduces problems before they start.";

  return (
    <div className="space-y-4" data-testid="area-rotation-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600">
            <Sprout size={14} />
          </div>
          <h3 className="text-sm font-black text-rhozly-on-surface flex items-center gap-1.5">
            Crop rotation <InfoTooltip content={tooltipBody} size={11} />
          </h3>
        </div>
      </div>

      {/* Recommendation banner */}
      {recommendation.isClear ? (
        history.seasons.length === 0 ? (
          <div className="rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/15 px-4 py-3 text-xs font-bold text-rhozly-on-surface/60">
            First time here? Anything goes — Rhozly will start tracking rotation once you plant something.
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs font-bold text-emerald-900">
            Looking good — anything will fit here this year.
          </div>
        )
      ) : (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-3">
          <div className="flex items-start gap-2 text-xs font-black text-amber-900">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Rotate away from{" "}
              {recommendation.avoid
                .map((a) => a.commonName)
                .join(", ")}{" "}
              this season.
            </span>
          </div>
          <div className="space-y-1.5">
            {recommendation.avoid.map((a) => (
              <div
                key={a.family}
                data-testid="rotation-avoid-chip"
                className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-bold text-amber-900/80"
              >
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-200/60 text-[10px] font-black uppercase tracking-widest text-amber-900">
                  {a.commonName}
                </span>
                <span className="italic text-amber-900/60">{a.family}</span>
                <span>· {a.reason}</span>
              </div>
            ))}
          </div>
          {recommendation.prefer.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1.5">
                Try these instead
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recommendation.prefer.map((p) => (
                  <span
                    key={p.family}
                    data-testid="rotation-prefer-chip"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold"
                    title={p.reason}
                  >
                    <span>{p.commonName}</span>
                    <span className="italic text-emerald-700/60">{p.family}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI suggestion CTA */}
      {aiEnabled && history.seasons.length > 0 && (
        <button
          type="button"
          onClick={() => setSuggestOpen(true)}
          data-testid="rotation-suggest-plants"
          className="w-full inline-flex items-center justify-center gap-2 bg-rhozly-primary text-white text-sm font-black px-4 py-2.5 rounded-2xl hover:opacity-90 active:scale-95 transition"
        >
          <Sparkles size={14} /> Suggest plants for next season
        </button>
      )}

      {/* History timeline — newest first, no lookback cap */}
      {history.seasons.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
            What grew here
          </p>
          <ol className="space-y-2.5">
            {history.seasons.map((season) => (
              <li
                key={season.year}
                className="bg-white border border-rhozly-outline/10 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-rhozly-on-surface/80"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-black text-rhozly-on-surface">
                    {season.year}
                  </span>
                  <div className="flex-1 flex flex-wrap gap-x-3 gap-y-1">
                    {season.families.map((fam) => (
                      <span
                        key={fam.family}
                        className="inline-flex items-baseline gap-1"
                      >
                        <span className="font-black">
                          {fam.display.common}
                        </span>
                        {fam.display.latin && (
                          <span className="italic text-rhozly-on-surface/40">
                            {fam.display.latin}
                          </span>
                        )}
                        <span className="text-rhozly-on-surface/40">
                          · {fam.plants.join(", ")}
                        </span>
                      </span>
                    ))}
                    {season.unknown.length > 0 && (
                      <span className="text-rhozly-on-surface/40 italic">
                        + {season.unknown.length} unclassified
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Layer B sheet */}
      {suggestOpen && (
        <SuggestRotationPlantsSheet
          homeId={homeId}
          areaId={areaId}
          areaName={areaName}
          onClose={() => setSuggestOpen(false)}
        />
      )}
    </div>
  );
}

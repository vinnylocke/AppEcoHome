import "leaflet/dist/leaflet.css";
import React, { useState } from "react";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import {
  MapPin,
  Thermometer,
  Leaf,
  Bug,
  FlowerIcon,
  Bird,
  Calendar,
  Lightbulb,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Droplets,
  Layers,
} from "lucide-react";
import { useHomeLocationDetails } from "../hooks/useHomeLocationDetails";

// HomeWithRole shape — only the fields we need
interface HomeSnap {
  id: string;
  lat: number | null;
  lng: number | null;
  hardiness_zone: number | null;
  climate_zone: string | null;
  country: string | null;
}

interface Props {
  home: HomeSnap;
}

const SEVERITY_STYLES: Record<string, string> = {
  low:    "bg-green-50 text-green-700 border-green-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high:   "bg-red-50 text-red-700 border-red-200",
};

const SEASON_ICONS: Record<string, string> = {
  spring: "🌸", summer: "☀️", autumn: "🍂", winter: "❄️",
};

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-rhozly-primary/60">{icon}</span>
      <h3 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">{label}</h3>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col items-center bg-rhozly-surface rounded-2xl px-4 py-3 text-center">
      <span className="text-lg font-black text-rhozly-primary leading-none">{value ?? "—"}</span>
      <span className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mt-1">{label}</span>
    </div>
  );
}

export default function HomeLocationInsights({ home }: Props) {
  const hasLocation = !!(home.lat && home.lng);
  const { data, loading, error, fetched, load, refresh } = useHomeLocationDetails(home.id, hasLocation);
  const [activeSeason, setActiveSeason] = useState<"spring" | "summer" | "autumn" | "winter">("spring");

  // --- No location set ---
  if (!hasLocation) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-rhozly-surface flex items-center justify-center">
          <MapPin size={22} className="text-rhozly-on-surface/30" />
        </div>
        <p className="text-sm font-black text-rhozly-on-surface/50">No location set</p>
        <p className="text-xs font-medium text-rhozly-on-surface/30 max-w-xs leading-relaxed">
          Add a postcode to your home in the Settings tab to unlock location-specific gardening insights.
        </p>
      </div>
    );
  }

  // --- Not yet loaded ---
  if (!fetched && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
          <Leaf size={22} className="text-rhozly-primary" />
        </div>
        <div>
          <p className="text-sm font-black text-rhozly-on-surface">Location Insights</p>
          <p className="text-xs font-medium text-rhozly-on-surface/40 mt-1 leading-relaxed max-w-xs">
            AI-powered insights about your location — soil, pests, wildlife, and growing tips.
          </p>
        </div>
        <button
          data-testid="load-insights-btn"
          onClick={() => load()}
          className="flex items-center gap-2 px-5 py-2.5 bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-rhozly-primary/90 transition-colors shadow-sm"
        >
          <Leaf size={13} />
          Load Insights
        </button>
      </div>
    );
  }

  // --- Loading ---
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <Loader2 size={24} className="animate-spin text-rhozly-primary" />
        <p className="text-sm font-black text-rhozly-on-surface/60">Generating insights…</p>
        <p className="text-xs text-rhozly-on-surface/30 font-medium max-w-xs leading-relaxed">
          Fetching soil data and generating AI insights for your location. This only happens once.
        </p>
      </div>
    );
  }

  // --- Error ---
  if (error && error !== "location_not_set" && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertTriangle size={20} className="text-red-500" />
        </div>
        <p className="text-sm font-black text-rhozly-on-surface/70">Failed to load insights</p>
        <p className="text-xs text-rhozly-on-surface/40 font-medium">{error}</p>
        <button
          onClick={() => load()}
          className="text-xs font-black text-rhozly-primary uppercase tracking-widest hover:text-rhozly-primary/70 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // --- Data loaded ---
  const d = data!;
  const climateRaw = home.climate_zone ?? d.climate_zone_key ?? null;
  const climateLabel = climateRaw
    ? climateRaw.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    : null;
  const hemisphere = home.lat != null ? (home.lat >= 0 ? "Northern" : "Southern") : null;
  const seasons = (["spring", "summer", "autumn", "winter"] as const);

  return (
    <div className="space-y-6">
      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-rhozly-outline/10" style={{ height: 240 }}>
        <MapContainer
          center={[home.lat!, home.lng!]}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
          scrollWheelZoom={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          <CircleMarker
            center={[home.lat!, home.lng!]}
            radius={10}
            pathOptions={{ color: "#075737", fillColor: "#075737", fillOpacity: 0.8, weight: 2 }}
          />
        </MapContainer>
      </div>

      {/* Climate overview */}
      <div>
        <SectionHeading icon={<Thermometer size={14} />} label="Climate Overview" />
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Chip label="Hardiness Zone" value={home.hardiness_zone != null ? `Zone ${home.hardiness_zone}` : null} />
          <Chip label="Climate" value={climateLabel} />
          <Chip label="Hemisphere" value={hemisphere} />
        </div>
        <p className="text-sm text-rhozly-on-surface/60 font-medium leading-relaxed">{d.climate_summary}</p>
      </div>

      {/* Soil profile */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-rhozly-primary/60"><Layers size={14} /></span>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Soil Profile</h3>
          {d.soil_estimated && (
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
              AI Estimate
            </span>
          )}
        </div>
        {d.soil.ph != null || d.soil.clay_pct != null || d.soil.sand_pct != null || d.soil.organic_carbon_gkg != null ? (
          <div className="grid grid-cols-4 gap-2 mb-3">
            <Chip label="pH" value={d.soil.ph} />
            <Chip label="Clay" value={d.soil.clay_pct != null ? `${d.soil.clay_pct}%` : null} />
            <Chip label="Sand" value={d.soil.sand_pct != null ? `${d.soil.sand_pct}%` : null} />
            <Chip label="Org. Carbon" value={d.soil.organic_carbon_gkg != null ? `${d.soil.organic_carbon_gkg} g/kg` : null} />
          </div>
        ) : (
          <p className="text-xs font-medium text-rhozly-on-surface/30 mb-3">No soil data available for this location.</p>
        )}
        <p className="text-sm text-rhozly-on-surface/60 font-medium leading-relaxed">{d.soil_interpretation}</p>
      </div>

      {/* Overview */}
      <div className="bg-rhozly-primary/5 border border-rhozly-primary/10 rounded-2xl px-4 py-3">
        <p className="text-sm font-medium text-rhozly-on-surface/70 leading-relaxed">{d.gardening_overview}</p>
      </div>

      {/* Pests & Diseases */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pests */}
        <div>
          <SectionHeading icon={<Bug size={14} />} label="Common Pests" />
          <div className="space-y-2">
            {d.common_pests.map((p, i) => (
              <div key={i} className="bg-rhozly-surface rounded-2xl px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black text-rhozly-on-surface">{p.name}</span>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${SEVERITY_STYLES[p.severity.toLowerCase()] ?? SEVERITY_STYLES.medium}`}>
                    {p.severity}
                  </span>
                </div>
                <p className="text-[11px] text-rhozly-on-surface/50 font-medium leading-snug">{p.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Diseases */}
        <div>
          <SectionHeading icon={<Droplets size={14} />} label="Common Diseases" />
          <div className="space-y-2">
            {d.common_diseases.map((d_, i) => (
              <div key={i} className="bg-rhozly-surface rounded-2xl px-3 py-2.5">
                <p className="text-xs font-black text-rhozly-on-surface mb-1">{d_.name}</p>
                <p className="text-[11px] text-rhozly-on-surface/50 font-medium leading-snug">{d_.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wildlife */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Beneficial */}
        <div>
          <SectionHeading icon={<FlowerIcon size={14} />} label="Beneficial Wildlife" />
          <div className="space-y-1.5">
            {d.beneficial_wildlife.map((w, i) => (
              <div key={i} className="flex gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                <span className="text-xs font-black text-green-800 shrink-0 mt-0.5">{w.name}</span>
                <span className="text-[11px] text-green-700/70 font-medium leading-snug">{w.benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Common wildlife */}
        <div>
          <SectionHeading icon={<Bird size={14} />} label="Local Wildlife" />
          <div className="space-y-1.5">
            {d.common_wildlife.map((w, i) => (
              <div key={i} className="flex gap-2 bg-rhozly-surface border border-rhozly-outline/10 rounded-xl px-3 py-2">
                <span className="text-xs font-black text-rhozly-on-surface shrink-0 mt-0.5">{w.name}</span>
                <span className="text-[11px] text-rhozly-on-surface/50 font-medium leading-snug">{w.notes}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Seasonal calendar */}
      <div>
        <SectionHeading icon={<Calendar size={14} />} label="Seasonal Gardening Calendar" />
        <div className="flex bg-rhozly-surface-low p-1 rounded-2xl gap-1 mb-3">
          {seasons.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSeason(s)}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors ${
                activeSeason === s ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
              }`}
            >
              {SEASON_ICONS[s]} {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-sm text-rhozly-on-surface/60 font-medium leading-relaxed">
          {d.seasonal_gardening_calendar[activeSeason]}
        </p>
      </div>

      {/* Top tips */}
      <div>
        <SectionHeading icon={<Lightbulb size={14} />} label="Top Tips for Your Location" />
        <ul className="space-y-2">
          {d.top_tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rhozly-primary/50 shrink-0" />
              <span className="text-sm text-rhozly-on-surface/60 font-medium leading-snug">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer — generated timestamp + refresh */}
      <div className="flex items-center justify-between pt-2 border-t border-rhozly-outline/10">
        <p className="text-[10px] font-bold text-rhozly-on-surface/25 uppercase tracking-widest">
          Generated {new Date(d.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <button
          data-testid="refresh-insights-btn"
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/30 hover:text-rhozly-primary transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Refresh insights
        </button>
      </div>
    </div>
  );
}

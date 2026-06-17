// Shared "Weather handling" controls for both automation builders.
//
// Lets the user pick how an automation reacts to rain — Off / Skip if rain /
// Smart (defer & recheck) — plus the Smart dials. The moisture sensor stays the
// source of truth: Smart only DEFERS watering and always rechecks. See
// docs/plans/hybrid-weather-sensor-automations.md.

import { useState } from "react";
import { CloudRain, CloudOff, Sparkles, ChevronDown, ChevronUp, Lock } from "lucide-react";

export type WeatherMode = "off" | "skip" | "defer";

export interface WeatherConfig {
  weather_mode: WeatherMode;
  rain_threshold_mm: number;
  weather_min_probability: number;
  weather_defer_window_hours: number;
  critical_threshold_value: number | null;
  max_defers: number;
  defer_skip_in_heat: boolean;
}

export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  weather_mode: "off",
  rain_threshold_mm: 5,
  weather_min_probability: 60,
  weather_defer_window_hours: 12,
  critical_threshold_value: null,
  max_defers: 2,
  defer_skip_in_heat: true,
};

/** Build a WeatherConfig from a loaded automation row (back-fills legacy skip). */
export function weatherConfigFromRow(a: Partial<{
  weather_mode: WeatherMode | null;
  skip_if_rained: boolean | null;
  rain_threshold_mm: number | null;
  weather_min_probability: number | null;
  weather_defer_window_hours: number | null;
  critical_threshold_value: number | null;
  max_defers: number | null;
  defer_skip_in_heat: boolean | null;
}> | null | undefined): WeatherConfig {
  if (!a) return { ...DEFAULT_WEATHER_CONFIG };
  const mode: WeatherMode = a.weather_mode ?? (a.skip_if_rained ? "skip" : "off");
  return {
    weather_mode: mode,
    rain_threshold_mm: a.rain_threshold_mm ?? 5,
    weather_min_probability: a.weather_min_probability ?? 60,
    weather_defer_window_hours: a.weather_defer_window_hours ?? 12,
    critical_threshold_value: a.critical_threshold_value ?? null,
    max_defers: a.max_defers ?? 2,
    defer_skip_in_heat: a.defer_skip_in_heat ?? true,
  };
}

const METHODS: Array<{ id: WeatherMode; label: string; icon: typeof CloudRain; hint: string }> = [
  { id: "off", label: "Off", icon: CloudOff, hint: "Ignore the forecast." },
  { id: "skip", label: "Skip if rain", icon: CloudRain, hint: "Skip the run when rain is forecast." },
  { id: "defer", label: "Smart", icon: Sparkles, hint: "Wait for forecast rain, then recheck the sensor and water if it stayed dry." },
];

interface Props {
  value: WeatherConfig;
  onChange: (next: WeatherConfig) => void;
  /** When false, the Smart option is disabled (no moisture sensor to recheck). */
  canDefer: boolean;
  /** Optional moisture-target control (scheduled builder, which has no threshold UI). */
  moistureTarget?: { value: number; onChange: (n: number) => void };
}

export default function WeatherHandlingSection({ value, onChange, canDefer, moistureTarget }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const set = (patch: Partial<WeatherConfig>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3" data-testid="weather-handling-section">
      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
        <CloudRain size={14} /> Weather handling
      </label>

      <div className="grid grid-cols-3 gap-2">
        {METHODS.map((m) => {
          const disabled = m.id === "defer" && !canDefer;
          const active = value.weather_mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              data-testid={`weather-mode-${m.id}`}
              disabled={disabled}
              onClick={() => set({ weather_mode: m.id })}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold transition-colors ${
                active ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : disabled ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {disabled ? <Lock size={16} /> : <Icon size={16} />}
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-500">
        {value.weather_mode === "defer" && !canDefer
          ? "Add a soil sensor to this area to use Smart."
          : METHODS.find((m) => m.id === value.weather_mode)?.hint}
      </p>

      {(value.weather_mode === "skip" || value.weather_mode === "defer") && (
        <div className="space-y-3 rounded-xl bg-gray-50 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600">
              Rain counts at (mm)
              <input
                type="number" min={0} step={0.5}
                data-testid="weather-rain-mm"
                value={value.rain_threshold_mm}
                onChange={(e) => set({ rain_threshold_mm: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 p-2"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              Min confidence (%)
              <input
                type="number" min={0} max={100} step={5}
                data-testid="weather-min-prob"
                value={value.weather_min_probability}
                onChange={(e) => set({ weather_min_probability: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-200 p-2"
              />
            </label>
          </div>

          {value.weather_mode === "defer" && moistureTarget && (
            <label className="block text-xs font-medium text-gray-600">
              Water when moisture below (%)
              <input
                type="number" min={0} max={100}
                data-testid="weather-moisture-target"
                value={moistureTarget.value}
                onChange={(e) => moistureTarget.onChange(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-gray-200 p-2"
              />
            </label>
          )}

          {value.weather_mode === "defer" && (
            <>
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-gray-600"
              >
                {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Advanced
              </button>
              {advanced && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-medium text-gray-600">
                      Look-ahead (hours)
                      <input
                        type="number" min={1} max={48}
                        data-testid="weather-window-hours"
                        value={value.weather_defer_window_hours}
                        onChange={(e) => set({ weather_defer_window_hours: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-gray-200 p-2"
                      />
                    </label>
                    <label className="block text-xs font-medium text-gray-600">
                      Max waits
                      <input
                        type="number" min={0} max={5}
                        data-testid="weather-max-defers"
                        value={value.max_defers}
                        onChange={(e) => set({ max_defers: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-gray-200 p-2"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-medium text-gray-600">
                    Critically dry at (below %) — waters regardless of forecast
                    <input
                      type="number" min={0} max={100}
                      data-testid="weather-critical"
                      placeholder="auto"
                      value={value.critical_threshold_value ?? ""}
                      onChange={(e) => set({ critical_threshold_value: e.target.value === "" ? null : Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-gray-200 p-2"
                    />
                  </label>
                  <div className="flex items-center justify-between rounded-lg bg-white p-2">
                    <span className="text-xs font-medium text-gray-600">During heatwaves</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        data-testid="weather-heat-water"
                        onClick={() => set({ defer_skip_in_heat: true })}
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${value.defer_skip_in_heat ? "bg-emerald-100 text-emerald-800" : "text-gray-400"}`}
                      >
                        Water anyway
                      </button>
                      <button
                        type="button"
                        data-testid="weather-heat-wait"
                        onClick={() => set({ defer_skip_in_heat: false })}
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${!value.defer_skip_in_heat ? "bg-emerald-100 text-emerald-800" : "text-gray-400"}`}
                      >
                        Keep waiting
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

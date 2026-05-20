import React from "react";
import { CloudRain, Droplets, CheckCircle2 } from "lucide-react";

interface Props {
  /** Today's forecast rainfall (mm). */
  todayRainMm: number;
  /** Tomorrow's forecast rainfall (mm). */
  tomorrowRainMm: number;
  /** Number of open (Pending) watering tasks for today. */
  openWateringTaskCount: number;
  /** Skip-watering threshold; defaults to 5 mm. */
  rainSkipMm?: number;
  /** Water-today threshold; defaults to 1 mm. */
  rainWaterMm?: number;
}

const DEFAULT_RAIN_SKIP_MM = 5;
const DEFAULT_RAIN_WATER_MM = 1;

type Verdict = "skip" | "settled" | "water" | "info";

interface AdviceComputed {
  verdict: Verdict;
  headline: string;
  body: string;
}

/**
 * Pure helper — exported so unit tests can exercise each branch without
 * rendering. Parent passes mm + task count + thresholds; we synthesise the
 * advice string locally (no AI call).
 */
export function computeRainAdvice({
  todayRainMm,
  tomorrowRainMm,
  openWateringTaskCount,
  rainSkipMm = DEFAULT_RAIN_SKIP_MM,
  rainWaterMm = DEFAULT_RAIN_WATER_MM,
}: Props): AdviceComputed {
  const totalRain = Number((todayRainMm + tomorrowRainMm).toFixed(1));

  if (totalRain >= rainSkipMm && openWateringTaskCount > 0) {
    return {
      verdict: "skip",
      headline: `Skip watering today`,
      body: `${totalRain}mm of rain expected over the next 48h — your ${openWateringTaskCount} watering task${openWateringTaskCount === 1 ? "" : "s"} can wait.`,
    };
  }
  if (totalRain >= rainSkipMm) {
    return {
      verdict: "settled",
      headline: `Rain's got it covered`,
      body: `${totalRain}mm of rain expected — no watering scheduled, you're set.`,
    };
  }
  if (totalRain < rainWaterMm && openWateringTaskCount > 0) {
    return {
      verdict: "water",
      headline: `Water today`,
      body: `Only ${totalRain}mm forecast in the next 48h — your ${openWateringTaskCount} watering task${openWateringTaskCount === 1 ? "" : "s"} will need attention.`,
    };
  }
  return {
    verdict: "info",
    headline: `${totalRain}mm forecast`,
    body: openWateringTaskCount > 0
      ? `${openWateringTaskCount} watering task${openWateringTaskCount === 1 ? "" : "s"} due today.`
      : `No watering scheduled — light rain in the forecast.`,
  };
}

const VERDICT_STYLE: Record<Verdict, { tone: string; icon: React.ReactNode }> = {
  skip: {
    tone: "bg-sky-50 border-sky-200 text-sky-900",
    icon: <CloudRain size={20} className="text-sky-600" />,
  },
  settled: {
    tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
    icon: <CheckCircle2 size={20} className="text-emerald-600" />,
  },
  water: {
    tone: "bg-amber-50 border-amber-200 text-amber-900",
    icon: <Droplets size={20} className="text-amber-600" />,
  },
  info: {
    tone: "bg-rhozly-surface-low border-rhozly-outline/20 text-rhozly-on-surface",
    icon: <Droplets size={20} className="text-rhozly-primary" />,
  },
};

export default function RainWaterAdvice(props: Props) {
  const advice = computeRainAdvice(props);
  const style = VERDICT_STYLE[advice.verdict];

  return (
    <section
      data-testid="rain-water-advice"
      data-verdict={advice.verdict}
      className={`rounded-3xl border p-4 sm:p-5 flex items-start gap-3 ${style.tone}`}
    >
      <div className="shrink-0 mt-0.5">{style.icon}</div>
      <div className="flex-1 min-w-0">
        <p
          data-testid="rain-water-advice-headline"
          className="font-black text-sm tracking-tight"
        >
          {advice.headline}
        </p>
        <p
          data-testid="rain-water-advice-body"
          className="text-xs sm:text-sm mt-1 leading-snug opacity-85"
        >
          {advice.body}
        </p>
      </div>
    </section>
  );
}

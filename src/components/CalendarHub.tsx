import { useEffect, useRef } from "react";
import { CalendarDays, CloudSun, Repeat } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { SegmentedTabs, type SegmentedTab } from "./ui/SegmentedTabs";
import TaskCalendar from "./TaskCalendar";
import WeatherForecast from "./WeatherForecast";
import { WeatherAlertBanner } from "./WeatherAlertBanner";
import BlueprintManager from "./BlueprintManager";

// #12 IA reorg — the Calendar + Weather views left the Dashboard (their `?view=`
// pills + persistence were retired) and Routines left the Planner. This hub
// reunites the three time-and-schedule surfaces under a single top-level
// `/calendar` section with a segmented switch. It mirrors JournalNotesHub: a
// pure UI shell — each tab still renders its original component unchanged
// (TaskCalendar / WeatherForecast / BlueprintManager), no data migration.
//
// `?tab=weather` / `?tab=routines` deep-link the non-default tabs; "calendar"
// is the default so the URL stays clean (`/calendar`). Legacy
// `/dashboard?view=calendar|weather` links redirect here (see App.tsx).
//
// Structure follows PlannerHub (a proven hub hosting BlueprintManager embedded):
// an `h-full flex flex-col` root with a non-growing header and a `flex-1
// overflow-auto` content pane, so TaskCalendar / BlueprintManager — both
// `h-full` surfaces with their own internal agenda/list scroll — size correctly.

const TABS: SegmentedTab[] = [
  { id: "calendar", label: "Calendar", icon: <CalendarDays size={14} />, testId: "calendar-hub-tab-calendar" },
  { id: "weather", label: "Weather", icon: <CloudSun size={14} />, testId: "calendar-hub-tab-weather" },
  { id: "routines", label: "Routines", icon: <Repeat size={14} />, testId: "calendar-hub-tab-routines" },
];

type TabId = "calendar" | "weather" | "routines";

interface Props {
  homeId: string;
  locations: any[];
  aiEnabled: boolean;
  rawWeather: any;
  alerts: any[];
  /** True while the first weather fetch is still in flight (show a skeleton). */
  weatherLoading: boolean;
  onWeatherRefresh: () => void | Promise<void>;
}

export default function CalendarHub({
  homeId,
  locations,
  aiEnabled,
  rawWeather,
  alerts,
  weatherLoading,
  onWeatherRefresh,
}: Props) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = raw === "weather" || raw === "routines" ? raw : "calendar";
  const scrollRef = useRef<HTMLDivElement>(null);

  // The content pane persists across tab swaps — reset to the top so a scrolled
  // Weather tab doesn't open Routines mid-page (mirrors JournalNotesHub).
  useEffect(() => {
    // Optional-call `scrollTo` — jsdom (unit tests) doesn't implement it.
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [tab]);

  const setTab = (id: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // "calendar" is the default — keep the URL clean rather than ?tab=calendar.
        if (id === "weather" || id === "routines") next.set("tab", id);
        else next.delete("tab");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-4 md:px-8 pt-4 pb-1 flex justify-center sm:justify-start">
        <SegmentedTabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          aria-label="Switch between Calendar, Weather and Routines"
          data-testid="calendar-hub-switch"
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {/* TaskCalendar + BlueprintManager self-pad (p-4 md:p-8) and fill h-full;
            the Weather panel is plain content, so it gets its own padding. */}
        {tab === "calendar" && (
          <TaskCalendar homeId={homeId} preloadedLocations={locations} aiEnabled={aiEnabled} />
        )}

        {tab === "weather" && (
          <div className="p-4 md:p-8 space-y-6">
            <WeatherAlertBanner alerts={alerts} isForecastScreen />
            {weatherLoading ? (
              <div className="space-y-4">
                <div className="rounded-3xl bg-rhozly-surface-low animate-pulse h-48" />
                <div className="rounded-3xl bg-rhozly-surface-low animate-pulse h-32" />
              </div>
            ) : (
              <WeatherForecast
                weatherData={rawWeather}
                alerts={alerts}
                homeId={homeId}
                onRefresh={onWeatherRefresh}
              />
            )}
          </div>
        )}

        {tab === "routines" && (
          <BlueprintManager homeId={homeId} aiEnabled={aiEnabled} embedded />
        )}
      </div>
    </div>
  );
}

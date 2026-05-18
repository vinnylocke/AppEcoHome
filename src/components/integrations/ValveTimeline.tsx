import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Loader2, Droplets, StopCircle, Clock, PlayCircle } from "lucide-react";

interface ValveEvent {
  id: string;
  event_type: "turn_on" | "turn_off";
  triggered_by: "scheduled" | "manual";
  duration_seconds: number | null;
  fired_at: string;
}

interface Props {
  deviceId: string;
}

export default function ValveTimeline({ deviceId }: Props) {
  const [events, setEvents] = useState<ValveEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("valve_events")
      .select("id, event_type, triggered_by, duration_seconds, fired_at")
      .eq("device_id", deviceId)
      .gte("fired_at", since)
      .order("fired_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setEvents((data ?? []) as ValveEvent[]);
        setLoading(false);
      });
  }, [deviceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <Loader2 size={18} className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-rhozly-on-surface-variant text-center py-6">
        No valve activity in the last 30 days.
      </p>
    );
  }

  // Group by calendar date label
  const groups: { date: string; events: ValveEvent[] }[] = [];
  for (const ev of events) {
    const label = new Date(ev.fired_at).toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.date === label) {
      last.events.push(ev);
    } else {
      groups.push({ date: label, events: [ev] });
    }
  }

  return (
    <div className="space-y-5" data-testid="valve-timeline">
      {groups.map(({ date, events: dayEvents }) => (
        <div key={date}>
          <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-2">
            {date}
          </p>
          <div className="space-y-1">
            {dayEvents.map((ev) => (
              <ValveEventRow key={ev.id} event={ev} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ValveEventRow({ event }: { event: ValveEvent }) {
  const time = new Date(event.fired_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isOn = event.event_type === "turn_on";

  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-rhozly-outline/10 last:border-0">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isOn ? "bg-blue-100" : "bg-slate-100"
        }`}
      >
        {isOn ? (
          <Droplets size={14} className="text-blue-600" />
        ) : (
          <StopCircle size={14} className="text-slate-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-rhozly-on-surface">
          {isOn ? "Valve opened" : "Valve closed"}
          {isOn && event.duration_seconds != null && (
            <span className="font-normal text-rhozly-on-surface-variant ml-1">
              · {Math.round(event.duration_seconds / 60)} min
            </span>
          )}
        </p>
        <p className="text-[10px] text-rhozly-on-surface-variant flex items-center gap-1 mt-0.5">
          {event.triggered_by === "manual" ? (
            <PlayCircle size={10} />
          ) : (
            <Clock size={10} />
          )}
          {event.triggered_by === "manual" ? "Manual" : "Scheduled"}
          {" · "}
          {time}
        </p>
      </div>
    </div>
  );
}

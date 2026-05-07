import React, { useEffect, useState } from "react";
import {
  Search,
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ImageOff,
  Clock,
  Bug,
} from "lucide-react";
import type { PlantDoctorSession } from "../hooks/usePlantDoctorSessions";

interface Props {
  sessions: PlantDoctorSession[];
  isLoading: boolean;
  onLoad: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SessionCard({ session }: { session: PlantDoctorSession }) {
  const [expanded, setExpanded] = useState(false);
  const isIdentify = session.action === "identify";
  const isPest = session.action === "pest";
  const candidates = isIdentify
    ? session.results.possible_names ?? []
    : isPest
    ? session.results.possible_pests ?? []
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
                  isIdentify
                    ? "bg-rhozly-primary/10 text-rhozly-primary"
                    : isPest
                    ? "bg-orange-100 text-orange-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isIdentify ? <Search size={9} /> : isPest ? <Bug size={9} /> : <Activity size={9} />}
                {isIdentify ? "Identify" : isPest ? "Pest" : "Diagnose"}
              </span>
              <span className="text-[10px] font-bold text-rhozly-on-surface/40 flex items-center gap-1">
                <Clock size={9} />
                {formatDate(session.created_at)}
              </span>
            </div>

            {session.confirmed_value ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                <span className="text-sm font-black text-rhozly-on-surface truncate">
                  {session.confirmed_value}
                </span>
              </div>
            ) : candidates.length > 0 ? (
              <p className="text-xs font-bold text-rhozly-on-surface/50 truncate">
                {candidates.slice(0, 2).join(", ")}
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

          {candidates.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
                {isIdentify ? "Possible Plants" : isPest ? "Possible Insects / Pests" : "Possible Conditions"}
              </p>
              <div className="space-y-1.5">
                {candidates.map((c, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold ${
                      c === session.confirmed_value
                        ? "bg-green-50 border border-green-200 text-green-800"
                        : "bg-rhozly-surface-low text-rhozly-on-surface/60"
                    }`}
                  >
                    {c === session.confirmed_value && (
                      <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                    )}
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.confirmed_value ? (
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
          )}
        </div>
      )}
    </div>
  );
}

export default function PlantDoctorHistory({ sessions, isLoading, onLoad }: Props) {
  useEffect(() => {
    onLoad();
  }, [onLoad]);

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
    <div className="space-y-3">
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
    </div>
  );
}

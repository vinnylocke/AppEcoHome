import React, { useState } from "react";
import { X, Sparkles, Wrench, TrendingUp, Trash2 } from "lucide-react";
import type { ReleaseNote, ReleaseNoteSection } from "../hooks/useReleaseNotes";

interface Props {
  notes: ReleaseNote[];
  currentVersion: string;
  mode: "latest" | "history";
  onClose: () => void;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  New:      <Sparkles size={13} />,
  Fixed:    <Wrench size={13} />,
  Improved: <TrendingUp size={13} />,
  Removed:  <Trash2 size={13} />,
};

function SectionBlock({ section }: { section: ReleaseNoteSection }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-rhozly-primary/60">{SECTION_ICONS[section.label] ?? <Sparkles size={13} />}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">{section.label}</span>
      </div>
      <ul className="space-y-1 pl-1">
        {(section.items ?? []).map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-rhozly-on-surface/70 font-medium leading-snug">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-rhozly-primary/40 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function ReleaseNotesModal({ notes, currentVersion, mode: initialMode, onClose }: Props) {
  const [mode, setMode] = useState(initialMode);
  const latest = notes[0];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        data-testid="release-notes-modal"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rhozly-outline/10 shrink-0">
          <div>
            <h2 className="text-base font-black text-rhozly-on-surface">
              {mode === "latest" ? `What's new in Rhozly OS ${currentVersion}` : "Release Notes"}
            </h2>
            {mode === "latest" && latest && (
              <p className="text-xs text-rhozly-on-surface/40 font-medium mt-0.5">
                {formatDate(latest.released_at)}
              </p>
            )}
          </div>
          <button
            data-testid="release-notes-close"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {mode === "latest" ? (
            /* Latest version only */
            latest && latest.sections?.length > 0 ? (
              latest.sections.map((s, i) => <SectionBlock key={i} section={s} />)
            ) : (
              <p className="text-sm text-rhozly-on-surface/40 font-medium text-center py-4">
                No release notes were recorded for this version.
              </p>
            )
          ) : (
            /* Full history */
            <div className="space-y-6">
              {notes.map((note) => (
                <div key={note.version}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h3 className="text-sm font-black text-rhozly-on-surface">
                      Rhozly OS {note.version}
                    </h3>
                    {note.version === currentVersion && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-1.5 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                    <span className="text-[10px] text-rhozly-on-surface/30 font-medium ml-auto">
                      {formatDate(note.released_at)}
                    </span>
                  </div>
                  {note.sections?.length > 0 ? (
                    note.sections.map((s, i) => <SectionBlock key={i} section={s} />)
                  ) : (
                    <p className="text-xs text-rhozly-on-surface/30 font-medium pl-1">No notes recorded.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-rhozly-outline/10 flex items-center gap-3 shrink-0">
          {mode === "latest" ? (
            <>
              <button
                data-testid="release-notes-view-all"
                onClick={() => setMode("history")}
                className="flex-1 py-2.5 rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface/60 hover:border-rhozly-primary/30 hover:text-rhozly-primary transition-colors"
              >
                View all versions
              </button>
              <button
                data-testid="release-notes-got-it"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-rhozly-primary text-white text-sm font-bold hover:bg-rhozly-primary/90 transition-colors"
              >
                Got it
              </button>
            </>
          ) : (
            <button
              data-testid="release-notes-close-history"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-rhozly-primary text-white text-sm font-bold hover:bg-rhozly-primary/90 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

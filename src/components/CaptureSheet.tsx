import { Stethoscope, Sprout, PenLine, CheckSquare, Footprints, BookOpen, NotebookPen, ChevronLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ModalShell } from "./ui/ModalShell";
import { Z } from "./ui/zIndex";

// Phase 6b — the Capture sheet. The phone Deck's raised centre FAB opens this
// instead of navigating: it is the one create/capture hub for the in-garden
// verbs, folding in what the desktop header "+" (GlobalQuickAdd) offers. It is
// a ROUTER — every tile deep-links into an existing surface's own flow; there
// is zero duplicated capture logic here.

interface CaptureAction {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  url: string;
  testId: string;
}

const HERO: CaptureAction = {
  id: "diagnose",
  label: "Diagnose a plant",
  hint: "Point your camera at a leaf or problem",
  icon: <Stethoscope size={22} />,
  url: "/doctor",
  testId: "capture-diagnose",
};

const ACTIONS: CaptureAction[] = [
  { id: "add-plant", label: "Add a plant", hint: "To your Shed", icon: <Sprout size={20} />, url: "/shed?open=add-plant", testId: "capture-add-plant" },
  { id: "journal", label: "Journal note", hint: "Jot something down", icon: <PenLine size={20} />, url: "/journal?open=add-entry", testId: "capture-journal" },
  { id: "add-task", label: "Add a task", hint: "One-off or today", icon: <CheckSquare size={20} />, url: "/dashboard?view=calendar&open=add-task", testId: "capture-add-task" },
  { id: "walk", label: "Garden walk", hint: "Tend bed by bed", icon: <Footprints size={20} />, url: "/walk", testId: "capture-walk" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}

// The two journal-note destinations, shown in the in-sheet chooser (#8).
const JOURNAL_CHOICES = [
  { id: "entry", label: "New journal entry", hint: "Logged against a plant, area or date", icon: <BookOpen size={20} />, url: "/journal?open=add-entry", testId: "capture-journal-entry" },
  { id: "note", label: "Add a note", hint: "A free-form note in your notebook", icon: <NotebookPen size={20} />, url: "/journal?tab=notes&open=add-note", testId: "capture-journal-note" },
];

export default function CaptureSheet({ open, onClose, onNavigate }: Props) {
  // Tapping "Journal note" opens an in-sheet chooser (journal entry vs note)
  // rather than jumping straight into the event-anchored journal composer (#8).
  const [journalChoice, setJournalChoice] = useState(false);
  useEffect(() => { if (!open) setJournalChoice(false); }, [open]);

  const go = (url: string) => {
    onClose();
    onNavigate(url);
  };

  return (
    <ModalShell
      isOpen={open}
      onClose={onClose}
      sheet
      z={Z.modal}
      closeOnOverlay
      aria-label="Capture"
      data-testid="capture-sheet"
      className="rounded-t-3xl"
    >
      <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-rhozly-outline/25" />

        {journalChoice ? (
          <div data-testid="capture-journal-choice">
            <button
              type="button"
              data-testid="capture-journal-back"
              onClick={() => setJournalChoice(false)}
              className="flex items-center gap-1 text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-3 -ml-1"
            >
              <ChevronLeft size={12} /> Capture
            </button>
            <div className="grid grid-cols-1 gap-2.5">
              {JOURNAL_CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={c.testId}
                  onClick={() => go(c.url)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 text-left active:scale-[0.98] transition-transform duration-100 ease-spring"
                >
                  <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-rhozly-primary/10 text-rhozly-primary">
                    {c.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-sm text-rhozly-on-surface leading-tight">{c.label}</span>
                    <span className="block text-2xs text-rhozly-on-surface/45 leading-tight">{c.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-3">
              Capture
            </h2>

            {/* Hero — the flagship in-garden capture flow */}
            <button
              type="button"
              data-testid={HERO.testId}
              onClick={() => go(HERO.url)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-rhozly-primary text-white text-left shadow-raised active:scale-[0.98] transition-transform duration-100 ease-spring"
            >
              <span className="shrink-0 grid place-items-center w-11 h-11 rounded-full bg-white/15">
                {HERO.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-black leading-tight">{HERO.label}</span>
                <span className="block text-xs text-white/70">{HERO.hint}</span>
              </span>
            </button>

            {/* The rest of the create/capture verbs */}
            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-testid={a.testId}
                  onClick={() => (a.id === "journal" ? setJournalChoice(true) : go(a.url))}
                  className="flex flex-col gap-1.5 p-3.5 min-h-[84px] rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 text-left active:scale-[0.98] transition-transform duration-100 ease-spring"
                >
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-rhozly-primary/10 text-rhozly-primary">
                    {a.icon}
                  </span>
                  <span className="font-bold text-sm text-rhozly-on-surface leading-tight">{a.label}</span>
                  <span className="text-2xs text-rhozly-on-surface/45 leading-tight">{a.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

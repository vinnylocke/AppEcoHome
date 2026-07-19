import { useEffect, useRef } from "react";
import { BookOpen, NotebookPen } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { SegmentedTabs, type SegmentedTab } from "./ui/SegmentedTabs";
import GlobalJournal from "./GlobalJournal";
import NotesPage from "./notes/NotesPage";

// Phase 5 IA pass — Journal and Notes were two adjacent nav items in the
// Plan group covering the same "write things down" job. This hub folds them
// into one surface with a segmented switch, so there's a single entry point.
// It is a pure UI merge: each tab still renders its original component
// against its own table (plant_journals / notes) — no data migration, no
// change to either component's own toolbar, composer, or testids.

const TABS: SegmentedTab[] = [
  { id: "journal", label: "Journal", icon: <BookOpen size={14} /> },
  { id: "notes", label: "Notes", icon: <NotebookPen size={14} /> },
];

interface Props {
  homeId: string;
}

export default function JournalNotesHub({ homeId }: Props) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "notes" ? "notes" : "journal";
  const scrollRef = useRef<HTMLDivElement>(null);

  // The scroll container persists across tab swaps, so a scrolled Journal
  // would otherwise open Notes mid-page. Reset to the top whenever the tab
  // changes so each surface starts from its own beginning.
  useEffect(() => {
    // Optional-call `scrollTo` — jsdom (unit tests) doesn't implement it.
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [tab]);

  const setTab = (id: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // "journal" is the default — keep the URL clean rather than ?tab=journal.
        if (id === "notes") next.set("tab", "notes");
        else next.delete("tab");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div ref={scrollRef} className="h-full overflow-auto animate-in fade-in duration-500">
      <div className="max-w-5xl mx-auto px-4 pt-6 flex justify-center sm:justify-start">
        <SegmentedTabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          aria-label="Switch between Journal and Notes"
          data-testid="journal-notes-switch"
        />
      </div>
      {tab === "journal" ? (
        <GlobalJournal homeId={homeId} />
      ) : (
        <NotesPage homeId={homeId} />
      )}
    </div>
  );
}

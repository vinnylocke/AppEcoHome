import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Plus, ArrowRight } from "lucide-react";
import { ModalShell } from "./ui/ModalShell";
import { Z } from "./ui/zIndex";
import TaskList from "./TaskList";
import QuickAddTaskModal from "./quick/QuickAddTaskModal";
import { TaskEngine } from "../lib/taskEngine";

interface Props {
  open: boolean;
  onClose: () => void;
  homeId: string | null;
  /** Overdue-task count for the header badge (App already computes it). */
  overdueCount: number;
}

/**
 * Global "Today's Tasks" tray (dashboard-nav-tasks-tray redesign Stage 2,
 * 2026-07-21). A right-anchored slide-out reachable from the header on every
 * non-focus screen, so today's + overdue tasks are one tap away no matter
 * where you are in the app. Built on ModalShell's `drawer` variant — it inherits
 * the portal, focus trap, shared Escape stack and backdrop for free.
 *
 * The body is the SAME compact `TaskList` the home renders (today + overdue,
 * every row carrying inline complete / postpone / delete), so basic task-doing
 * happens right here. A quick "add task" opens the slim QuickAddTaskModal; a
 * footer button jumps to the full board. It pulls from the shared TaskEngine
 * cache, so opening it on a screen that already warmed today's list is instant.
 */
export default function TodayTasksTray({ open, onClose, homeId, overdueCount }: Props) {
  const navigate = useNavigate();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Bumping this remounts the embedded TaskList so it refetches after a
  // quick-add (the direct insert doesn't flow through TaskList's own state).
  const [refreshKey, setRefreshKey] = useState(0);
  // Today / Completed (2026-07-22) — drives TaskList's compactView so ticked-off
  // tasks stay reviewable (and undoable) without leaving the tray.
  const [view, setView] = useState<"pending" | "completed">("pending");

  if (!homeId) return null;

  // Escape / backdrop on the tray must NOT also close it when the quick-add
  // modal is open on top — QuickAddTaskModal isn't a ModalShell, so it can't
  // join ModalShell's shared "only the topmost closes" Escape stack, and one
  // Escape would otherwise collapse both layers. Close only the quick-add then.
  const handleClose = () => {
    if (quickAddOpen) {
      setQuickAddOpen(false);
      return;
    }
    onClose();
  };

  return (
    <>
      <ModalShell
        isOpen={open}
        onClose={handleClose}
        drawer
        aria-labelledby="today-tray-title"
        data-testid="today-tasks-tray"
        z={Z.drawer}
      >
        <div className="flex flex-col min-h-full">
          <div className="sticky top-0 z-10 bg-rhozly-surface-lowest/95 backdrop-blur-sm border-b border-rhozly-outline/10 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 id="today-tray-title" className="text-sm font-black text-rhozly-on-surface">
                Today's tasks
              </h2>
              {overdueCount > 0 && (
                <span
                  data-testid="today-tray-overdue-badge"
                  className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-status-danger-fill text-status-danger-ink border border-status-danger-line"
                >
                  {overdueCount} overdue
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                data-testid="today-tray-quick-add"
                onClick={() => setQuickAddOpen(true)}
                aria-label="Add a task"
                className="flex items-center justify-center min-w-9 min-h-9 pointer-coarse:min-w-11 pointer-coarse:min-h-11 rounded-xl bg-rhozly-primary/5 text-rhozly-primary can-hover:hover:bg-rhozly-primary/10 active:scale-95 transition"
              >
                <Plus size={18} />
              </button>
              <button
                type="button"
                data-testid="today-tray-close"
                onClick={onClose}
                aria-label="Close today's tasks"
                className="flex items-center justify-center min-w-9 min-h-9 pointer-coarse:min-w-11 pointer-coarse:min-h-11 rounded-xl text-rhozly-on-surface-variant can-hover:hover:text-rhozly-on-surface active:scale-95 transition"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 p-4">
            <div className="flex bg-rhozly-surface-low p-1 rounded-2xl mb-3">
              <button
                type="button"
                data-testid="today-tray-tab-pending"
                onClick={() => setView("pending")}
                className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${view === "pending" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
              >
                Today
              </button>
              <button
                type="button"
                data-testid="today-tray-tab-completed"
                onClick={() => setView("completed")}
                className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${view === "completed" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 can-hover:hover:text-rhozly-on-surface"}`}
              >
                Completed
              </button>
            </div>
            <TaskList key={refreshKey} homeId={homeId} compact compactView={view} hideCalendarLink targetDate={new Date()} />
          </div>

          <div className="sticky bottom-0 bg-rhozly-surface-lowest/95 backdrop-blur-sm border-t border-rhozly-outline/10 px-4 py-3">
            <button
              type="button"
              data-testid="today-tray-open-board"
              onClick={() => {
                onClose();
                navigate("/calendar");
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-black text-rhozly-primary bg-rhozly-primary/5 py-2.5 rounded-full can-hover:hover:bg-rhozly-primary/10 active:scale-[0.98] transition"
            >
              Open the full board <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </ModalShell>

      {open && quickAddOpen && (
        <QuickAddTaskModal
          homeId={homeId}
          onClose={() => setQuickAddOpen(false)}
          onSuccess={() => {
            TaskEngine.invalidateCache(homeId);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

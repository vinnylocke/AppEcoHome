import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Loader2, Trash2, ListChecks, ListPlus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { TASK_CATEGORIES, type TaskCategory } from "../../constants/taskCategories";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import toast from "react-hot-toast";
import { getLocalDateString } from "../../lib/dateUtils";

interface Props {
  homeId: string;
  onClose: () => void;
  /** Fired once the list (and its tasks) have been written. Hosts use this to
   *  refresh their task views. */
  onSuccess?: (newListId: string) => void;
  /** Optional: open the "My to-do lists" manage modal instead of just closing. */
  onViewLists?: () => void;
}

interface DraftTask {
  /** Local key so React can identify rows across re-renders. */
  key: string;
  title: string;
  type: TaskCategory;
  description: string;
}

let nextKey = 0;
const freshTask = (): DraftTask => ({
  key: `t${++nextKey}`,
  title: "",
  type: "Maintenance",
  description: "",
});

/**
 * Create a new to-do list — a named group of `tasks` rows sharing a `due_date`.
 * The list is one INSERT to `todo_lists`; the N task lines are one bulk INSERT
 * to `tasks` with `todo_list_id` set so the Manage modal can group them later.
 * Tasks created here surface on the calendar like any other task — see the
 * data-model-tasks app-reference doc.
 */
export default function AddToDoListModal({ homeId, onClose, onSuccess, onViewLists }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState<string>(getLocalDateString(new Date()));
  const [tasks, setTasks] = useState<DraftTask[]>(() => [freshTask()]);
  const [submitting, setSubmitting] = useState(false);

  const validTasks = tasks.filter((t) => t.title.trim() !== "");
  const canSubmit = !!dueDate && validTasks.length > 0 && !submitting;

  const updateTask = (key: string, patch: Partial<DraftTask>) => {
    setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  };
  const removeTask = (key: string) => {
    setTasks((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.key !== key)));
  };
  const addTask = () => {
    setTasks((prev) => [...prev, freshTask()]);
    // Focus the new row's title on next paint.
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>("[data-testid^=\"add-todo-task-title-\"]");
      inputs[inputs.length - 1]?.focus();
    }, 0);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const created_by = userData?.user?.id ?? null;
      // 1) Insert the list row.
      const { data: list, error: listErr } = await supabase
        .from("todo_lists")
        .insert({
          home_id: homeId,
          name: name.trim() ? name.trim() : null,
          due_date: dueDate,
          created_by,
        })
        .select("id")
        .single();
      if (listErr) throw listErr;

      // 2) Bulk-insert the task rows linked to the new list.
      const rows = validTasks.map((t) => ({
        home_id: homeId,
        title: t.title.trim(),
        description: t.description.trim() || null,
        type: t.type,
        due_date: dueDate,
        status: "Pending" as const,
        todo_list_id: list.id,
      }));
      const { error: tasksErr } = await supabase.from("tasks").insert(rows);
      if (tasksErr) throw tasksErr;

      toast.success(`Added ${rows.length} task${rows.length === 1 ? "" : "s"} to your to-do list.`);
      onSuccess?.(list.id);
      onClose();
    } catch (err: any) {
      Logger.error("AddToDoListModal — create failed", err, { homeId }, err?.message || "Couldn't create the to-do list.");
    } finally {
      setSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add to-do list"
        data-testid="add-todo-list-modal"
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-rhozly-primary/10 text-rhozly-primary">
              <ListChecks size={16} />
            </span>
            <p className="font-black text-rhozly-on-surface">New to-do list</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Date + list name */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block">
                Date
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="add-todo-due-date"
                className="w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block">
                List name (optional)
              </span>
              <input
                ref={titleInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`To-do for ${dueDate}`}
                data-testid="add-todo-list-name"
                className="w-full bg-rhozly-bg border border-rhozly-outline/20 rounded-2xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
              />
            </label>
          </div>

          {/* Task lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                Tasks
              </p>
              <button
                type="button"
                onClick={addTask}
                data-testid="add-todo-add-row"
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:underline"
              >
                <Plus size={11} /> Add task
              </button>
            </div>
            {tasks.map((t, i) => (
              <div
                key={t.key}
                data-testid={`add-todo-task-row-${i}`}
                className="rounded-2xl bg-rhozly-bg border border-rhozly-outline/15 p-3 space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={t.title}
                    onChange={(e) => updateTask(t.key, { title: e.target.value })}
                    placeholder="What needs doing?"
                    data-testid={`add-todo-task-title-${i}`}
                    className="flex-1 min-w-0 bg-white border border-rhozly-outline/20 rounded-xl px-3 py-2 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                  />
                  <select
                    value={t.type}
                    onChange={(e) => updateTask(t.key, { type: e.target.value as TaskCategory })}
                    data-testid={`add-todo-task-type-${i}`}
                    className="shrink-0 bg-white border border-rhozly-outline/20 rounded-xl px-2 py-2 text-xs font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                  >
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(t.key)}
                      data-testid={`add-todo-task-remove-${i}`}
                      aria-label="Remove task"
                      className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <textarea
                  value={t.description}
                  onChange={(e) => updateTask(t.key, { description: e.target.value })}
                  placeholder="Description (optional)"
                  data-testid={`add-todo-task-description-${i}`}
                  rows={2}
                  className="w-full bg-white border border-rhozly-outline/20 rounded-xl px-3 py-2 text-xs font-medium text-rhozly-on-surface outline-none focus:border-rhozly-primary resize-none"
                />
              </div>
            ))}
          </div>

          {onViewLists && (
            <button
              type="button"
              onClick={() => { onClose(); onViewLists(); }}
              data-testid="add-todo-view-lists"
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-primary"
            >
              <ListChecks size={12} /> View existing to-do lists
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 shrink-0">
          <button
            type="button"
            data-testid="add-todo-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:bg-rhozly-primary/90 disabled:opacity-50 transition"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
            {submitting
              ? "Adding…"
              : `Add to-do list${validTasks.length ? ` (${validTasks.length} task${validTasks.length === 1 ? "" : "s"})` : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, ChevronUp, Trash2, Loader2, CheckCircle2, Circle, ListChecks, Pencil, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import toast from "react-hot-toast";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: "Pending" | "Completed" | "Skipped";
  due_date: string;
}

interface ListRow {
  id: string;
  name: string | null;
  due_date: string;
  created_at: string;
  tasks: TaskRow[];
}

interface Props {
  homeId: string;
  /** If supplied, that list is expanded on mount + scrolled into view. */
  initialOpenListId?: string;
  onClose: () => void;
  /** Fired whenever a task is ticked / edited / deleted so the host can refresh
   *  any calendar / agenda views that show the same task rows. */
  onChange?: () => void;
}

/** Display name for a list — falls back to "To-do for <date>" when blank. */
function listLabel(l: ListRow): string {
  return l.name?.trim() || `To-do for ${l.due_date}`;
}

function isComplete(l: ListRow): boolean {
  if (l.tasks.length === 0) return true;
  return l.tasks.every((t) => t.status !== "Pending");
}

function completedCount(l: ListRow): number {
  return l.tasks.filter((t) => t.status !== "Pending").length;
}

/**
 * Manage to-do lists for the current home — see each list, expand to inspect
 * its tasks, tick / edit / delete tasks (each operation hits the underlying
 * `tasks` row directly so the calendar / agenda stay in sync), and delete a
 * list either *keeping the tasks* (the tasks lose their list link only) or
 * *cascading the delete* (the tasks go too).
 *
 * List status is computed from its tasks (pending iff any task is Pending) —
 * no stored status column, no trigger, no drift.
 */
export default function ToDoListsModal({ homeId, initialOpenListId, onClose, onChange }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initialOpenListId ? [initialOpenListId] : []),
  );
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; description: string }>({ title: "", description: "" });
  const [deleting, setDeleting] = useState<{ list: ListRow; phase: "ask" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: listsData, error: listsErr } = await supabase
        .from("todo_lists")
        .select("id, name, due_date, created_at")
        .eq("home_id", homeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (listsErr) throw listsErr;
      const ids = (listsData ?? []).map((l) => l.id);
      let tasksData: TaskRow[] = [];
      if (ids.length > 0) {
        const { data, error: tasksErr } = await supabase
          .from("tasks")
          .select("id, title, description, type, status, due_date, todo_list_id")
          .in("todo_list_id", ids);
        if (tasksErr) throw tasksErr;
        tasksData = (data ?? []) as unknown as TaskRow[];
      }
      const byList = new Map<string, TaskRow[]>();
      for (const t of tasksData) {
        const lid = (t as any).todo_list_id as string;
        if (!byList.has(lid)) byList.set(lid, []);
        byList.get(lid)!.push(t);
      }
      const merged: ListRow[] = (listsData ?? []).map((l) => ({
        ...l,
        tasks: (byList.get(l.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
      }));
      setLists(merged);
      // If we were asked to open a specific list, scroll it into view.
      if (initialOpenListId) {
        setTimeout(() => {
          document
            .querySelector(`[data-testid="todo-list-${initialOpenListId}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
      }
    } catch (err: any) {
      Logger.error("ToDoListsModal — load failed", err, { homeId }, err?.message || "Couldn't load your to-do lists.");
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [homeId, initialOpenListId]);

  useEffect(() => { load(); }, [load]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const patchTaskLocal = (listId: string, taskId: string, patch: Partial<TaskRow>) => {
    setLists((prev) =>
      prev?.map((l) =>
        l.id !== listId
          ? l
          : { ...l, tasks: l.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) },
      ) ?? prev,
    );
  };

  const toggleTask = async (list: ListRow, task: TaskRow) => {
    const nextStatus: TaskRow["status"] = task.status === "Pending" ? "Completed" : "Pending";
    patchTaskLocal(list.id, task.id, { status: nextStatus });
    try {
      const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);
      if (error) throw error;
      onChange?.();
    } catch (err: any) {
      // Roll back.
      patchTaskLocal(list.id, task.id, { status: task.status });
      Logger.error("ToDoListsModal — toggle failed", err, { taskId: task.id }, err?.message || "Couldn't update that task.");
    }
  };

  const startEdit = (task: TaskRow) => {
    setEditingTaskId(task.id);
    setEditDraft({ title: task.title, description: task.description ?? "" });
  };
  const cancelEdit = () => setEditingTaskId(null);
  const saveEdit = async (list: ListRow, task: TaskRow) => {
    const title = editDraft.title.trim();
    if (!title) { cancelEdit(); return; }
    const description = editDraft.description.trim() ? editDraft.description.trim() : null;
    patchTaskLocal(list.id, task.id, { title, description });
    setEditingTaskId(null);
    try {
      const { error } = await supabase.from("tasks").update({ title, description }).eq("id", task.id);
      if (error) throw error;
      onChange?.();
    } catch (err: any) {
      patchTaskLocal(list.id, task.id, { title: task.title, description: task.description });
      Logger.error("ToDoListsModal — edit failed", err, { taskId: task.id }, err?.message || "Couldn't save your edit.");
    }
  };

  const deleteTask = async (list: ListRow, task: TaskRow) => {
    setLists((prev) =>
      prev?.map((l) => (l.id !== list.id ? l : { ...l, tasks: l.tasks.filter((t) => t.id !== task.id) })) ?? prev,
    );
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      onChange?.();
    } catch (err: any) {
      Logger.error("ToDoListsModal — delete task failed", err, { taskId: task.id }, err?.message || "Couldn't delete that task.");
      // Reload to recover.
      load();
    }
  };

  const deleteListKeepTasks = async (list: ListRow) => {
    setDeleting(null);
    try {
      // Unlink tasks first so the list-delete cascade leaves them intact.
      await supabase.from("tasks").update({ todo_list_id: null }).eq("todo_list_id", list.id);
      const { error } = await supabase.from("todo_lists").delete().eq("id", list.id);
      if (error) throw error;
      toast.success("To-do list removed — your tasks stay on the calendar.");
      setLists((prev) => prev?.filter((l) => l.id !== list.id) ?? prev);
      onChange?.();
    } catch (err: any) {
      Logger.error("ToDoListsModal — delete list (keep tasks) failed", err, { listId: list.id }, err?.message || "Couldn't delete that list.");
    }
  };

  const deleteListAndTasks = async (list: ListRow) => {
    setDeleting(null);
    try {
      // Delete the linked tasks explicitly — the FK is ON DELETE SET NULL,
      // so the cascade alone won't remove them.
      await supabase.from("tasks").delete().eq("todo_list_id", list.id);
      const { error } = await supabase.from("todo_lists").delete().eq("id", list.id);
      if (error) throw error;
      toast.success("To-do list and its tasks deleted.");
      setLists((prev) => prev?.filter((l) => l.id !== list.id) ?? prev);
      onChange?.();
    } catch (err: any) {
      Logger.error("ToDoListsModal — delete list+tasks failed", err, { listId: list.id }, err?.message || "Couldn't delete that list.");
    }
  };

  const body = useMemo(() => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 justify-center py-12 text-sm font-bold text-rhozly-on-surface/55">
          <Loader2 size={16} className="animate-spin text-rhozly-primary" /> Loading your to-do lists…
        </div>
      );
    }
    if (!lists || lists.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-rhozly-on-surface/50">
          <ListChecks size={28} className="text-rhozly-primary/40" />
          <p className="text-sm font-black text-rhozly-on-surface/70">No to-do lists yet</p>
          <p className="text-xs font-bold max-w-xs">
            Tap <em>Add to-do list</em> on the Today screen or the calendar to group a batch of tasks under one date.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {lists.map((list) => {
          const expanded = expandedIds.has(list.id);
          const complete = isComplete(list);
          const done = completedCount(list);
          const total = list.tasks.length;
          return (
            <div
              key={list.id}
              data-testid={`todo-list-${list.id}`}
              className={`rounded-2xl border bg-white transition-colors ${complete ? "border-emerald-200" : "border-rhozly-outline/15"}`}
            >
              {/* Header row */}
              <button
                type="button"
                onClick={() => toggleExpanded(list.id)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-xl shrink-0 ${
                    complete ? "bg-emerald-100 text-emerald-700" : "bg-rhozly-primary/10 text-rhozly-primary"
                  }`}
                >
                  {complete ? <CheckCircle2 size={14} /> : <ListChecks size={14} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-black text-rhozly-on-surface truncate">{listLabel(list)}</span>
                  <span className="block text-[10px] font-bold text-rhozly-on-surface/50">
                    {list.due_date} · {done}/{total} done · {complete ? "Complete" : "Pending"}
                  </span>
                </span>
                <span className="shrink-0 text-rhozly-on-surface/40">
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {/* Tasks */}
              {expanded && (
                <div data-testid={`todo-list-tasks-${list.id}`} className="border-t border-rhozly-outline/10 p-3 space-y-1.5">
                  {list.tasks.length === 0 ? (
                    <p className="text-[11px] font-bold text-rhozly-on-surface/40 italic text-center py-2">
                      All tasks for this list have been removed.
                    </p>
                  ) : (
                    list.tasks.map((task) => {
                      const isEditing = editingTaskId === task.id;
                      const taskDone = task.status !== "Pending";
                      return (
                        <div
                          key={task.id}
                          data-testid={`todo-task-${task.id}`}
                          className="flex items-start gap-2 px-2 py-1.5 rounded-xl hover:bg-rhozly-surface-low/60"
                        >
                          <button
                            type="button"
                            onClick={() => toggleTask(list, task)}
                            data-testid={`todo-task-toggle-${task.id}`}
                            aria-pressed={taskDone}
                            className="shrink-0 mt-0.5 text-rhozly-on-surface/50 hover:text-rhozly-primary"
                          >
                            {taskDone ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  value={editDraft.title}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                                  data-testid={`todo-task-edit-title-${task.id}`}
                                  className="w-full bg-white border border-rhozly-outline/20 rounded-lg px-2 py-1 text-xs font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                                />
                                <textarea
                                  value={editDraft.description}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                                  data-testid={`todo-task-edit-description-${task.id}`}
                                  rows={2}
                                  className="w-full bg-white border border-rhozly-outline/20 rounded-lg px-2 py-1 text-[11px] font-medium text-rhozly-on-surface outline-none focus:border-rhozly-primary resize-none"
                                />
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-on-surface px-2"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => saveEdit(list, task)}
                                    data-testid={`todo-task-edit-save-${task.id}`}
                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary"
                                  >
                                    <Check size={11} /> Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span
                                  className={`block text-xs font-black leading-tight ${
                                    taskDone ? "text-rhozly-on-surface/40 line-through" : "text-rhozly-on-surface"
                                  }`}
                                >
                                  {task.title}
                                </span>
                                <span className="block text-[10px] font-bold text-rhozly-on-surface/50">
                                  {task.type}{task.description ? ` · ${task.description}` : ""}
                                </span>
                              </>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEdit(task)}
                                data-testid={`todo-task-edit-${task.id}`}
                                aria-label="Edit"
                                className="p-1 rounded-lg text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-primary/5"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTask(list, task)}
                                data-testid={`todo-task-delete-${task.id}`}
                                aria-label="Delete task"
                                className="p-1 rounded-lg text-rhozly-on-surface/40 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setDeleting({ list, phase: "ask" })}
                      data-testid={`todo-list-delete-${list.id}`}
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-red-600"
                    >
                      <Trash2 size={11} /> Delete list
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [lists, loading, expandedIds, editingTaskId, editDraft]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="My to-do lists"
        data-testid="todo-lists-modal"
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-rhozly-primary/10 text-rhozly-primary">
              <ListChecks size={16} />
            </span>
            <p className="font-black text-rhozly-on-surface">My to-do lists</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">{body}</div>
      </div>

      {/* Two-option delete confirm — default is the safe "Keep tasks" choice. */}
      {deleting && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div>
              <p className="font-black text-rhozly-on-surface">Delete "{listLabel(deleting.list)}"?</p>
              <p className="text-xs font-bold text-rhozly-on-surface/50 mt-1">
                Choose what happens to its {deleting.list.tasks.length} task{deleting.list.tasks.length === 1 ? "" : "s"}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => deleteListKeepTasks(deleting.list)}
              data-testid="todo-list-delete-keep-tasks"
              className="w-full py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition"
            >
              Keep tasks, delete list only
            </button>
            <button
              type="button"
              onClick={() => deleteListAndTasks(deleting.list)}
              data-testid="todo-list-delete-cascade"
              className="w-full py-3 rounded-2xl border border-red-200 text-sm font-black text-red-700 hover:bg-red-50 transition"
            >
              Delete list and all its tasks
            </button>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="w-full text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

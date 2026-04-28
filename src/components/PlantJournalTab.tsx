import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { format } from "date-fns";
import {
  BookOpen,
  Plus,
  Camera,
  Loader2,
  X,
  Save,
  Trash2,
  CheckSquare,
  Link as LinkIcon,
} from "lucide-react";
import toast from "react-hot-toast";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface PlantJournalTabProps {
  inventoryItemId: string;
  homeId: string;
}

export default function PlantJournalTab({
  inventoryItemId,
  homeId,
}: PlantJournalTabProps) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const [entries, setEntries] = useState<any[]>([]);
  const [availableTasks, setAvailableTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    subject: "",
    description: "",
    image_url: "",
    task_id: "",
  });

  useEffect(() => {
    fetchEntries();
    fetchTasksForLinking();
  }, [inventoryItemId]);

  // 🧠 LIVE AI SYNC: Let the AI see the plant's history and what the user is currently writing
  useEffect(() => {
    setPageContext({
      action: isAdding
        ? "Drafting a New Journal Entry"
        : "Reviewing Plant Journal history",
      journalContext: {
        totalEntries: entries.length,
        historySummary: entries.slice(0, 3).map((e) => ({
          subject: e.subject,
          date: e.created_at,
          hasImage: !!e.image_url,
        })),
      },
      currentDraft: isAdding
        ? {
            subject: form.subject || "Untitled",
            description: form.description,
            linkedTask:
              availableTasks.find((t) => t.id === form.task_id)?.title ||
              "None",
            hasImageAttached: !!form.image_url,
          }
        : null,
    });

    // Cleanup when moving away from the journal
    return () => setPageContext(null);
  }, [isAdding, form, entries, availableTasks, setPageContext]);

  // Focus trap for delete confirmation modal
  useEffect(() => {
    if (!deleteConfirm || !deleteModalRef.current) return;

    const modalElement = deleteModalRef.current;
    const focusableElements = modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Set initial focus to first button
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDeleteConfirm(null);
        return;
      }

      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable?.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable?.focus();
          }
        }
      }
    };

    modalElement.addEventListener("keydown", handleKeyDown);
    return () => modalElement.removeEventListener("keydown", handleKeyDown);
  }, [deleteConfirm]);

  const fetchEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("plant_journals")
        .select("*, tasks(title, type)")
        .eq("inventory_item_id", inventoryItemId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error("Failed to fetch journal entries", error);
      toast.error("Failed to load journal.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTasksForLinking = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, status")
        .contains("inventory_item_ids", [inventoryItemId])
        .order("due_date", { ascending: false })
        .limit(20);

      if (error) throw error;
      setAvailableTasks(data || []);
    } catch (error) {
      console.error("Failed to fetch tasks for linking", error);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error("Image must be under 5MB");
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `journal-${Math.random()}.${fileExt}`;
      const filePath = `plant-photos/${fileName}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 10;
        });
      }, 100);

      const { error: uploadError } = await supabase.storage
        .from("plant-images")
        .upload(filePath, file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("plant-images").getPublicUrl(filePath);

      setForm((prev) => ({ ...prev, image_url: publicUrl }));
      toast.success("Photo attached!");
    } catch (err: any) {
      toast.error("Failed to attach photo.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSave = async () => {
    if (!form.subject.trim()) {
      setSubjectError(true);
      return toast.error("Subject is required.");
    }
    setSubjectError(false);
    setSaving(true);

    try {
      const { error } = await supabase.from("plant_journals").insert([
        {
          home_id: homeId,
          inventory_item_id: inventoryItemId,
          subject: form.subject,
          description: form.description,
          image_url: form.image_url,
          task_id: form.task_id || null,
        },
      ]);

      if (error) throw error;

      toast.success("Journal entry saved!");
      setIsAdding(false);
      setForm({ subject: "", description: "", image_url: "", task_id: "" });
      fetchEntries();
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("plant_journals")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setEntries(entries.filter((e) => e.id !== id));
      toast.success("Entry deleted");
      setDeleteConfirm(null);
      // Return focus to the previously focused delete button if it exists
      deleteButtonRef.current?.focus();
    } catch (error: any) {
      toast.error("Failed to delete entry");
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-black text-xl">Plant Journal</h3>
          <p className="text-xs font-bold text-rhozly-on-surface/50 mt-1">
            Document progress, blooming, or issues.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 bg-rhozly-primary text-white px-4 py-2 rounded-2xl text-xs font-black hover:scale-105 transition-transform shadow-sm"
          >
            <Plus size={16} /> New Entry
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-rhozly-surface-low border border-rhozly-outline/20 p-5 rounded-2xl space-y-4 animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center">
            <h4 className="font-black text-sm uppercase tracking-widest text-rhozly-primary">
              New Entry
            </h4>
            <button
              onClick={() => setIsAdding(false)}
              className="text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            >
              <X size={20} />
            </button>
          </div>

          <div>
            <input
              type="text"
              placeholder="Subject (e.g., First Bloom!)"
              value={form.subject}
              onChange={(e) => {
                setForm({ ...form, subject: e.target.value });
                if (subjectError) setSubjectError(false);
              }}
              aria-invalid={subjectError}
              aria-describedby={subjectError ? "subject-error" : undefined}
              className={`w-full p-4 bg-white rounded-2xl font-black border ${
                subjectError
                  ? "border-red-500 focus:border-red-500"
                  : "border-transparent focus:border-rhozly-primary"
              } outline-none text-sm`}
            />
            {subjectError && (
              <p
                id="subject-error"
                className="text-red-500 text-xs font-bold mt-2 ml-4"
                role="alert"
              >
                Subject is required.
              </p>
            )}
          </div>

          {availableTasks.length > 0 && (
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none">
                <LinkIcon size={16} />
              </div>
              <select
                value={form.task_id}
                onChange={(e) => setForm({ ...form, task_id: e.target.value })}
                className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm appearance-none cursor-pointer"
              >
                <option value="">No task linked (Optional)</option>
                {availableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} ({task.due_date}){" "}
                    {task.status === "Completed" ? "✓" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <textarea
            rows={3}
            placeholder="Add some details..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full p-4 bg-white rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none text-sm resize-none"
          />

          {form.image_url ? (
            <div className="relative w-full h-40 rounded-2xl overflow-hidden group">
              <img
                src={form.image_url}
                alt="Attached"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setForm({ ...form, image_url: "" })}
                className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-xl hover:bg-red-500 backdrop-blur-sm transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach photo to entry"
              className="w-full py-6 border-2 border-dashed border-rhozly-outline/20 rounded-2xl flex flex-col items-center justify-center gap-2 text-rhozly-on-surface/50 hover:border-rhozly-primary/30 hover:text-rhozly-primary transition-colors bg-white"
            >
              {uploading ? (
                <>
                  <Loader2 className="animate-spin" />
                  <div className="w-full max-w-[200px] h-2 bg-rhozly-outline/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rhozly-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Uploading... {uploadProgress}%
                  </span>
                </>
              ) : (
                <>
                  <Camera size={24} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Attach Photo
                  </span>
                </>
              )}
            </button>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            capture="environment"
            className="hidden"
          />

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:scale-[1.02] transition-transform disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                <Save size={18} /> Save Entry
              </>
            )}
          </button>
        </div>
      )}

      <div className={entries.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "space-y-4"}>
        {entries.length === 0 && !isAdding ? (
          <div className="text-center p-8 border-2 border-dashed border-rhozly-outline/20 rounded-3xl opacity-50">
            <BookOpen className="mx-auto mb-2" size={24} />
            <p className="font-bold text-sm">No journal entries yet.</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white p-5 rounded-2xl border border-rhozly-outline/10 shadow-sm flex flex-col gap-3 transition-transform hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-black text-lg text-rhozly-on-surface">
                    {entry.subject}
                  </h4>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rhozly-primary">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  ref={deleteButtonRef}
                  onClick={() => setDeleteConfirm(entry.id)}
                  aria-label="Delete journal entry"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {entry.tasks && (
                <div className="inline-flex items-center gap-1.5 self-start bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest mt-1">
                  <CheckSquare size={12} />
                  <span>Linked: {entry.tasks.title}</span>
                </div>
              )}

              {entry.description && (
                <p className="text-sm font-normal text-rhozly-on-surface/55 whitespace-pre-wrap leading-relaxed mt-1">
                  {entry.description}
                </p>
              )}

              {entry.image_url && (
                <div className="mt-2 rounded-2xl overflow-hidden border border-rhozly-outline/10">
                  <img
                    src={entry.image_url}
                    alt="Journal attachment"
                    className="w-full h-auto max-h-64 object-cover"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in"
          onClick={() => setDeleteConfirm(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div
            ref={deleteModalRef}
            className="bg-white rounded-3xl p-6 max-w-sm mx-4 shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-dialog-title"
              className="font-black text-lg mb-3 text-rhozly-on-surface"
            >
              Delete this journal entry?
            </h3>
            <p className="text-sm font-bold text-rhozly-on-surface/70 mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 px-4 bg-rhozly-surface-low text-rhozly-on-surface rounded-2xl font-black hover:bg-rhozly-outline/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-3 px-4 bg-red-500 text-white rounded-2xl font-black hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import toast from "react-hot-toast";
import PhotoUploader from "../PhotoUploader";
import TargetPicker, { applyTargetToPayload } from "./TargetPicker";
import type { TargetSelection } from "./TargetPicker";
import type { JournalTargetType } from "../../types";
import { useGlobalJournal } from "../../hooks/useGlobalJournal";
import { logEvent, EVENT } from "../../events/registry";

interface Props {
  homeId: string;
  /** Optional fixed target — used when the composer is embedded on an
   *  instance edit page, area page, etc. Hides the target picker. */
  fixedType?: JournalTargetType;
  fixedId?: string;
  fixedLabel?: string;
  /** Optional close handler — when present the composer renders as a
   *  closable card; otherwise inline. */
  onClose?: () => void;
  /** Called after a successful save with the new entry id. */
  onSaved?: (entryId: string) => void;
  autoFocus?: boolean;
}

/**
 * Reusable journal composer. Used by the global journal page, the Quick
 * Capture screen, and embedded surfaces.
 */
export default function JournalComposer({
  homeId,
  fixedType,
  fixedId,
  fixedLabel,
  onClose,
  onSaved,
  autoFocus,
}: Props) {
  const { create } = useGlobalJournal(homeId);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subjectError, setSubjectError] = useState(false);

  const [target, setTarget] = useState<TargetSelection>(() => {
    if (fixedType && fixedId) {
      return { type: fixedType, id: fixedId, label: fixedLabel ?? null };
    }
    return { type: "none", id: null, label: null };
  });

  const handleSave = async () => {
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) {
      setSubjectError(true);
      toast.error("Add a subject for this entry.");
      return;
    }
    // Single-target validation: if a non-none type is chosen, an id is required.
    if (target.type !== "none" && !target.id) {
      toast.error(`Pick a ${target.type} to attach to.`);
      return;
    }
    setSaving(true);
    try {
      const payload = applyTargetToPayload(target, {
        subject: trimmedSubject,
        description: description.trim() || null,
        image_url: imageUrl || null,
      });
      const created = await create(payload);
      if (created) {
        logEvent(EVENT.JOURNAL_ENTRY_ADDED, {
          target_type: target.type,
          has_image: !!imageUrl,
          source: "global_journal",
        });
        toast.success("Journal entry saved");
        setSubject("");
        setDescription("");
        setImageUrl("");
        setSubjectError(false);
        if (!fixedType) {
          setTarget({ type: "none", id: null, label: null });
        }
        onSaved?.(created.id);
        onClose?.();
      }
    } catch (err: any) {
      const msg = err?.message ?? "Couldn't save the entry.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="journal-composer"
      className="bg-white border border-rhozly-outline/15 rounded-2xl p-5 space-y-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-rhozly-on-surface uppercase tracking-widest">
          New journal entry
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block">
          Subject
        </label>
        <input
          type="text"
          autoFocus={autoFocus}
          placeholder="e.g. First bloom, Spotted aphids, Tomatoes ripening"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            if (subjectError) setSubjectError(false);
          }}
          aria-invalid={subjectError}
          data-testid="journal-composer-subject"
          className={`w-full px-4 py-3 bg-rhozly-surface-low rounded-2xl font-bold text-sm border outline-none transition-colors ${
            subjectError
              ? "border-red-500 focus:border-red-500"
              : "border-transparent focus:border-rhozly-primary"
          }`}
        />
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block">
          Description
        </label>
        <textarea
          rows={4}
          placeholder="What did you notice? What did you do?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="journal-composer-description"
          className="w-full px-4 py-3 bg-rhozly-surface-low rounded-2xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none resize-y"
        />
      </div>

      <TargetPicker
        homeId={homeId}
        value={target}
        onChange={setTarget}
        fixedType={fixedType}
        fixedId={fixedId}
        fixedLabel={fixedLabel}
      />

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block">
          Photo (optional)
        </label>
        <PhotoUploader
          bucket="plant-images"
          pathPrefix={`journal/${homeId}`}
          value={imageUrl || null}
          onChange={(url) => setImageUrl(url ?? "")}
          onUploadStart={() => setUploading(true)}
          onUploadEnd={() => setUploading(false)}
          testIdPrefix="journal-composer-photo"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || uploading}
        data-testid="journal-composer-save"
        className="w-full flex items-center justify-center gap-2 bg-rhozly-primary text-white text-sm font-black px-4 py-3 rounded-2xl hover:opacity-90 active:scale-95 transition disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Save entry
      </button>
    </div>
  );
}

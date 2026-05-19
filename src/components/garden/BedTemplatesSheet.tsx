import React, { useEffect, useState } from "react";
import { X, Loader2, Trash2, Layers, Plus, BookmarkPlus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";
import type { ShapeData } from "../GardenShapeProperties";

interface TemplateRow {
  id: string;
  name: string;
  shape_type: string;
  preset_id: string | null;
  colour: string;
  width_m: number | null;
  height_m: number | null;
  radius_m: number | null;
  points: { x: number; y: number }[] | null;
  extrude_m: number | null;
  dashed: boolean;
  suggested_plant_species: string[];
  created_at: string;
}

interface Props {
  /** Shape currently selected — gives the "Save as Template" affordance a source. */
  saveSourceShape: ShapeData | null;
  onApply: (template: TemplateRow) => void;
  onClose: () => void;
}

export default function BedTemplatesSheet({ saveSourceShape, onApply, onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingName, setSavingName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { void fetchTemplates(); }, []);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("garden_shape_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTemplates(data ?? []);
    } catch (err) {
      Logger.error("Failed to load bed templates", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!saveSourceShape || saving) return;
    const name = savingName.trim() || saveSourceShape.label || "My Template";
    setSaving(true);
    try {
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) throw new Error("Not authenticated");
      const { error } = await supabase.from("garden_shape_templates").insert({
        user_id: userResp.user.id,
        name,
        shape_type: saveSourceShape.shape_type,
        preset_id: saveSourceShape.preset_id,
        colour: saveSourceShape.color,
        width_m: saveSourceShape.width_m,
        height_m: saveSourceShape.height_m,
        radius_m: saveSourceShape.radius_m,
        points: saveSourceShape.points,
        extrude_m: saveSourceShape.extrude_m,
        dashed: saveSourceShape.dashed,
      });
      if (error) throw error;
      toast.success("Template saved");
      setSavingName("");
      await fetchTemplates();
    } catch (err) {
      Logger.error("Failed to save template", err);
      toast.error("Could not save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("garden_shape_templates").delete().eq("id", id);
      if (error) throw error;
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      Logger.error("Failed to delete template", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      data-testid="bed-templates-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-3xl w-full max-w-md shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-rhozly-outline/10 shrink-0">
          <div className="flex items-center gap-2">
            <BookmarkPlus size={18} className="text-rhozly-primary" />
            <p className="font-black text-rhozly-on-surface">Bed Templates</p>
          </div>
          <button
            data-testid="templates-sheet-close"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:bg-rhozly-surface"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {saveSourceShape && (
            <div className="bg-rhozly-surface rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Save current selection</p>
              <input
                data-testid="template-name-input"
                value={savingName}
                onChange={e => setSavingName(e.target.value)}
                placeholder={saveSourceShape.label ?? "Template name"}
                className="w-full bg-white rounded-xl px-3 py-2 text-xs font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
              />
              <button
                data-testid="template-save-btn"
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Save Template
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-rhozly-on-surface/30" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-center text-[11px] font-bold text-rhozly-on-surface/40 py-4">
              No templates yet. Select a shape and tap "Save Template" to reuse it later.
            </p>
          ) : (
            templates.map(t => {
              const dims = t.shape_type === "circle"
                ? `r ${(t.radius_m ?? 0).toFixed(1)} m`
                : `${(t.width_m ?? 0).toFixed(1)} × ${(t.height_m ?? 0).toFixed(1)} m`;
              return (
                <div
                  key={t.id}
                  data-testid={`template-row-${t.id}`}
                  className="flex items-center gap-3 bg-rhozly-surface rounded-2xl p-3 border border-rhozly-outline/10"
                >
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: t.colour + "30" }}
                  >
                    <Layers size={16} style={{ color: t.colour }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-rhozly-on-surface truncate">{t.name}</p>
                    <p className="text-[10px] font-bold text-rhozly-on-surface/40">{t.preset_id ?? t.shape_type} · {dims}</p>
                  </div>
                  <button
                    data-testid={`template-apply-${t.id}`}
                    onClick={() => { onApply(t); onClose(); }}
                    className="min-h-[40px] px-3 rounded-xl bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-primary/90 transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    data-testid={`template-delete-${t.id}`}
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    aria-label="Delete template"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
                  >
                    {deletingId === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export type { TemplateRow };

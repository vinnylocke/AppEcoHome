import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LayoutTemplate, Pencil, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";

interface Layout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  homeId: string;
}

export default function GardenLayoutList({ homeId }: Props) {
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchLayouts();
  }, [homeId]);

  const fetchLayouts = async () => {
    try {
      const { data, error } = await supabase
        .from("garden_layouts")
        .select("*")
        .eq("home_id", homeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLayouts(data ?? []);
    } catch (err) {
      Logger.error("Failed to fetch garden layouts", err);
      toast.error("Could not load layouts.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim() || "New Layout";
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("garden_layouts")
        .insert({ home_id: homeId, name })
        .select()
        .single();
      if (error) throw error;
      setShowCreate(false);
      setNewName("");
      navigate(`/garden-layout/${data.id}`);
    } catch (err) {
      Logger.error("Failed to create layout", err);
      toast.error("Could not create layout.");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      const { error } = await supabase
        .from("garden_layouts")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setLayouts(prev => prev.map(l => l.id === id ? { ...l, name } : l));
      setRenamingId(null);
    } catch (err) {
      Logger.error("Failed to rename layout", err);
      toast.error("Could not rename layout.");
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("garden_layouts").delete().eq("id", id);
      if (error) throw error;
      setLayouts(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      Logger.error("Failed to delete layout", err);
      toast.error("Could not delete layout.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-rhozly-bg">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-black text-rhozly-on-surface">Garden Layouts</h1>
          <button
            data-testid="create-layout-btn"
            onClick={() => setShowCreate(true)}
            className="w-10 h-10 bg-rhozly-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rhozly-primary/20 active:scale-95 transition-transform"
          >
            <Plus size={20} />
          </button>
        </div>
        <p className="text-xs font-bold text-rhozly-on-surface/50">Draw and manage your garden spaces</p>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mx-6 mb-4 bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 p-4 space-y-3 animate-in fade-in zoom-in-95">
          <p className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest">New layout name</p>
          <input
            data-testid="new-layout-name-input"
            autoFocus
            type="text"
            placeholder="e.g. Back Garden"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="w-full bg-rhozly-bg rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCreate(false); setNewName(""); }}
              className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60"
            >
              Cancel
            </button>
            <button
              data-testid="create-layout-confirm"
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : null}
              Create
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center pt-16">
            <Loader2 size={24} className="animate-spin text-rhozly-on-surface/30" />
          </div>
        ) : layouts.length === 0 ? (
          <div className="text-center pt-16 space-y-3">
            <div className="w-16 h-16 bg-rhozly-surface rounded-3xl flex items-center justify-center mx-auto">
              <LayoutTemplate size={28} className="text-rhozly-on-surface/20" />
            </div>
            <p className="font-black text-rhozly-on-surface text-sm">No layouts yet</p>
            <p className="text-xs font-bold text-rhozly-on-surface/50">Create a layout to start mapping your garden</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black text-sm shadow-lg shadow-rhozly-primary/20"
            >
              Create your first layout
            </button>
          </div>
        ) : (
          layouts.map(layout => (
            <div
              key={layout.id}
              data-testid={`layout-card-${layout.id}`}
              className="bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 overflow-hidden"
            >
              {renamingId === layout.id ? (
                <div className="p-4 space-y-3">
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRename(layout.id); if (e.key === "Escape") setRenamingId(null); }}
                    className="w-full bg-rhozly-bg rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setRenamingId(null)} className="flex-1 py-2.5 rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60">Cancel</button>
                    <button onClick={() => handleRename(layout.id)} className="flex-1 py-2.5 rounded-2xl bg-rhozly-primary text-white text-xs font-black">Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 bg-rhozly-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                    <LayoutTemplate size={18} className="text-rhozly-primary" />
                  </div>
                  <button
                    onClick={() => navigate(`/garden-layout/${layout.id}`)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="font-black text-rhozly-on-surface text-sm truncate">{layout.name}</p>
                    <p className="text-xs font-bold text-rhozly-on-surface/40">{layout.canvas_w_m}m × {layout.canvas_h_m}m</p>
                  </button>
                  <button
                    onClick={() => { setRenamingId(layout.id); setRenameValue(layout.name); }}
                    className="p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
                    aria-label="Rename layout"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(layout.id)}
                    disabled={deletingId === layout.id}
                    className="p-2 rounded-xl text-rhozly-on-surface/40 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                    aria-label="Delete layout"
                  >
                    {deletingId === layout.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                  <button
                    onClick={() => navigate(`/garden-layout/${layout.id}`)}
                    className="p-2 rounded-xl text-rhozly-on-surface/30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

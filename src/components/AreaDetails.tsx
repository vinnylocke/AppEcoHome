import React, { useState, useEffect } from "react";
import {
  X,
  Trash2,
  MapPin,
  Loader2,
  Database,
  Sprout,
  Settings2,
  Navigation,
  Hash,
  Calendar,
  Info,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { ConfirmModal } from "./ConfirmModal";

interface InventoryItem {
  id: string;
  home_id: string;
  plant_name: string;
  status: string;
  growth_state: string | null;
  identifier: string;
  is_established: boolean;
  location_id: string;
  area_id: string;
  planted_at: string | null;
}

interface AreaDetailsProps {
  homeId: string;
  area: { id: string; name: string };
  onClose: () => void;
}

const GROWTH_STATES = [
  "Germination",
  "Seedling",
  "Vegetative",
  "Budding/Pre-Flowering",
  "Flowering/Bloom",
  "Fruiting/Pollination",
  "Ripening/Maturity",
  "Senescence",
];

export default function AreaDetails({
  homeId,
  area,
  onClose,
}: AreaDetailsProps) {
  const [plants, setPlants] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  if (!area) return null;

  // Edit Instance State
  const [editingInstance, setEditingInstance] = useState<InventoryItem | null>(
    null,
  );
  const [editForm, setEditForm] = useState<any>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [savingInstance, setSavingInstance] = useState(false);

  // Delete State
  const [plantToDelete, setPlantToDelete] = useState<InventoryItem | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPlants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("area_id", area.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlants(data || []);
    } catch (error: any) {
      Logger.error("Failed to fetch plants", error, { areaId: area.id });
      toast.error("Could not load plants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlants();
  }, [area.id]);

  useEffect(() => {
    if (editingInstance && locations.length === 0) {
      const fetchLocations = async () => {
        const { data } = await supabase
          .from("locations")
          .select("id, name, areas(id, name)")
          .eq("home_id", editingInstance.home_id);
        if (data) setLocations(data);
      };
      fetchLocations();
    }
  }, [editingInstance]);

  const openEditModal = (item: InventoryItem) => {
    setEditForm({
      identifier: item.identifier || item.plant_name,
      location_id: item.location_id,
      area_id: item.area_id,
      status: item.status,
      growth_state: item.growth_state || "Vegetative",
      is_established: item.is_established,
      planted_at: item.planted_at
        ? item.planted_at.split("T")[0]
        : new Date().toISOString().split("T")[0],
    });
    setEditingInstance(item);
  };

  const handleUpdateInstance = async () => {
    setSavingInstance(true);
    try {
      const loc = locations.find((l) => l.id === editForm.location_id);
      const areaObj = loc?.areas.find((a: any) => a.id === editForm.area_id);

      const payload = {
        identifier: editForm.identifier,
        location_id: editForm.location_id,
        location_name: loc?.name,
        area_id: editForm.area_id,
        area_name: areaObj?.name,
        status: editForm.status,
        growth_state:
          editForm.status === "Planted" ? editForm.growth_state : null,
        is_established:
          editForm.status === "Planted" ? editForm.is_established : false,
        planted_at:
          editForm.status === "Planted" && !editForm.is_established
            ? editForm.planted_at
            : null,
      };

      const { error } = await supabase
        .from("inventory_items")
        .update(payload)
        .eq("id", editingInstance!.id);
      if (error) throw error;

      toast.success("Plant instance updated!");

      if (payload.area_id !== area.id) {
        setPlants(plants.filter((p) => p.id !== editingInstance!.id));
      } else {
        setPlants(
          plants.map((p) =>
            p.id === editingInstance!.id ? { ...p, ...payload } : p,
          ),
        );
      }

      setEditingInstance(null);
    } catch (error: any) {
      Logger.error("Failed to update instance", error);
      toast.error("Could not update plant.");
    } finally {
      setSavingInstance(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!plantToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", plantToDelete.id);

      if (error) throw error;

      toast.success("Plant removed from area.");
      setPlants(plants.filter((p) => p.id !== plantToDelete.id));
    } catch (error: any) {
      Logger.error("Failed to delete plant instance", error);
      toast.error("Could not remove plant.");
    } finally {
      setIsDeleting(false);
      setPlantToDelete(null);
    }
  };

  const availableAreas = editForm.location_id
    ? locations.find((l) => l.id === editForm.location_id)?.areas || []
    : [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Area Header */}
      <div className="flex items-center justify-between bg-rhozly-surface-lowest rounded-3xl p-6 border border-rhozly-outline/30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-rhozly-primary/10 p-3 rounded-2xl">
            <MapPin className="w-6 h-6 text-rhozly-primary" />
          </div>
          <div>
            <h3 className="text-2xl font-black font-display text-rhozly-on-surface tracking-tight">
              {area.name}
            </h3>
            <p className="text-sm font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
              Area Details
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-3 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-2xl transition-all border border-rhozly-outline/10"
          title="Back to Areas"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* 🚀 REDESIGNED: Sleek Horizontal Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-rhozly-primary to-rhozly-primary-container rounded-3xl p-6 text-white shadow-md">
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">
            Total Plants
          </p>
          <p className="text-3xl font-black font-display">{plants.length}</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-rhozly-outline/10 shadow-sm">
          <p className="text-xs font-bold text-rhozly-on-surface/50 uppercase tracking-widest mb-1">
            In Ground
          </p>
          <p className="text-3xl font-black font-display text-rhozly-primary">
            {plants.filter((p) => p.status === "Planted").length}
          </p>
        </div>
      </div>

      {/* Area Inventory List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1 mt-4">
          <h3 className="font-display font-black text-rhozly-on-surface/60 uppercase tracking-widest text-sm">
            Inventory
          </h3>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
          </div>
        ) : plants.length > 0 ? (
          plants.map((plant) => (
            <div
              key={plant.id}
              className="bg-white rounded-3xl p-5 border border-rhozly-outline/10 shadow-sm flex items-center justify-between hover:border-rhozly-primary/30 transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-rhozly-primary/5 p-3 rounded-2xl hidden sm:block shrink-0">
                  <Sprout className="w-6 h-6 text-rhozly-primary" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-lg text-rhozly-on-surface flex items-center gap-2 truncate">
                    {plant.identifier}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-rhozly-on-surface/50 border border-rhozly-outline/10 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                      {plant.plant_name}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${plant.status === "Planted" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"}`}
                    >
                      {plant.status}
                    </span>
                    {plant.growth_state && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-orange-50 text-orange-600">
                        {plant.growth_state}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={() => openEditModal(plant)}
                  className="p-3 text-rhozly-primary/60 hover:text-rhozly-primary hover:bg-rhozly-primary/10 rounded-xl transition-all"
                >
                  <Settings2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setPlantToDelete(plant)}
                  className="p-3 text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="py-16 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30">
            <div className="w-20 h-20 bg-rhozly-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Database className="w-10 h-10 text-rhozly-primary/30" />
            </div>
            <p className="text-rhozly-on-surface/80 font-black text-lg mb-2">
              No plants in this area yet.
            </p>
            <p className="text-sm text-rhozly-on-surface/50 font-bold max-w-[280px] mx-auto leading-relaxed">
              Head over to <span className="text-rhozly-primary">The Shed</span>{" "}
              to assign plants from your master library to this location.
            </p>
          </div>
        )}
      </div>

      {/* EDIT INSTANCE MODAL */}
      {editingInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-rhozly-surface-lowest w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-[3rem] p-8 shadow-2xl border border-rhozly-outline/20 relative">
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div>
                <h3 className="text-3xl font-black text-rhozly-on-surface">
                  Edit Instance
                </h3>
                <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">
                  {editingInstance.plant_name}
                </p>
              </div>
              <button
                onClick={() => setEditingInstance(null)}
                className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <Hash size={14} /> Unique Identifier / Nickname
                </label>
                <input
                  type="text"
                  value={editForm.identifier}
                  onChange={(e) =>
                    setEditForm({ ...editForm, identifier: e.target.value })
                  }
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-black border border-transparent focus:border-rhozly-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    <MapPin size={14} /> Location
                  </label>
                  <select
                    value={editForm.location_id}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        location_id: e.target.value,
                        area_id: "",
                      })
                    }
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    <Navigation size={14} /> Area
                  </label>
                  <select
                    value={editForm.area_id}
                    onChange={(e) =>
                      setEditForm({ ...editForm, area_id: e.target.value })
                    }
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                  >
                    <option value="" disabled>
                      Select Area...
                    </option>
                    {availableAreas.map((area: any) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <hr className="border-rhozly-outline/10" />

              <div className="p-1 bg-rhozly-surface-low rounded-2xl flex">
                <button
                  onClick={() =>
                    setEditForm({ ...editForm, status: "Unplanted" })
                  }
                  className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${editForm.status === "Unplanted" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
                >
                  Unplanted
                </button>
                <button
                  onClick={() =>
                    setEditForm({ ...editForm, status: "Planted" })
                  }
                  className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${editForm.status === "Planted" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
                >
                  Planted
                </button>
              </div>

              {editForm.status === "Planted" && (
                <div className="space-y-6 p-6 bg-rhozly-surface-low rounded-3xl animate-in zoom-in-95 border border-rhozly-outline/5">
                  <div className="space-y-3">
                    <label className="flex items-center justify-between text-[10px] font-black uppercase text-rhozly-on-surface/60">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} /> Date Planted
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-rhozly-outline/10">
                        <input
                          type="checkbox"
                          checked={editForm.is_established}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              is_established: e.target.checked,
                            })
                          }
                          className="accent-rhozly-primary"
                        />
                        <span className="text-[9px] tracking-widest text-rhozly-primary">
                          Already Established?
                        </span>
                      </label>
                    </label>
                    {!editForm.is_established ? (
                      <input
                        type="date"
                        value={editForm.planted_at}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            planted_at: e.target.value,
                          })
                        }
                        className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
                      />
                    ) : (
                      <div className="w-full p-4 bg-white/50 rounded-xl border border-dashed border-rhozly-outline/20 text-center opacity-60">
                        <p className="text-xs font-bold flex items-center justify-center gap-2">
                          <Info size={14} /> Date unknown (Established)
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                      <Sprout size={14} /> Current Growth State
                    </label>
                    <select
                      value={editForm.growth_state}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          growth_state: e.target.value,
                        })
                      }
                      className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                    >
                      {GROWTH_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <button
                onClick={handleUpdateInstance}
                disabled={savingInstance || !editForm.area_id}
                className="w-full py-5 mt-4 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl shadow-rhozly-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {savingInstance ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    <Check size={24} /> Save Updates
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={plantToDelete !== null}
        isLoading={isDeleting}
        onClose={() => setPlantToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Remove Plant Instance"
        description={`Are you sure you want to remove "${plantToDelete?.identifier}" from this area? (This will not delete the master plant from your Shed).`}
        confirmText="Remove"
        isDestructive={true}
      />
    </div>
  );
}

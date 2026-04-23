import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Loader2,
  Sparkles,
  Map,
  MoreVertical,
  Archive,
  Trash2,
  ArchiveRestore,
} from "lucide-react";
import toast from "react-hot-toast";
import NewPlanForm from "./NewPlanForm";
import { ConfirmModal } from "./ConfirmModal";
import PlanStaging from "./PlanStaging"; // 🚀 NEW: Imported the Staging Engine

interface PlannerDashboardProps {
  homeId: string;
}

export default function PlannerDashboard({ homeId }: PlannerDashboardProps) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "Pending" | "Completed" | "Archived"
  >("Pending");
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);

  // 🚀 NEW: State to hold the currently selected plan for the Staging Engine
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [planToDelete, setPlanToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("home_id", homeId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load plans.");
      console.error(error);
    } else {
      setPlans(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
  }, [homeId]);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const updatePlanStatus = async (planId: string, newStatus: string) => {
    const { error } = await supabase
      .from("plans")
      .update({ status: newStatus })
      .eq("id", planId);
    if (error) {
      toast.error("Failed to update plan.");
    } else {
      toast.success(`Plan moved to ${newStatus}`);
      fetchPlans();
    }
  };

  const executeDeletePlan = async () => {
    if (!planToDelete) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("plans")
        .delete()
        .eq("id", planToDelete.id);
      if (error) throw error;

      toast.success("Project deleted successfully.");
      setPlanToDelete(null);
      fetchPlans();
    } catch (err: any) {
      toast.error("Failed to delete plan.");
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredPlans = plans.filter((plan) => {
    if (activeTab === "Pending")
      return plan.status === "Draft" || plan.status === "In Progress";
    return plan.status === activeTab;
  });

  const pendingCount = plans.filter(
    (p) => p.status === "Draft" || p.status === "In Progress",
  ).length;
  const completedCount = plans.filter((p) => p.status === "Completed").length;
  const archivedCount = plans.filter((p) => p.status === "Archived").length;

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black font-display text-rhozly-on-surface flex items-center gap-3">
            <Map className="text-rhozly-primary" size={32} /> Landscape Planner
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/50 uppercase tracking-widest mt-1">
            AI-Assisted Project Management
          </p>
        </div>
        <button
          onClick={() => setShowNewPlanModal(true)}
          className="px-6 py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:bg-rhozly-primary/90 transition-transform active:scale-95 flex items-center gap-2 w-full md:w-auto justify-center"
        >
          <Sparkles size={20} /> New Project
        </button>
      </div>

      {/* Tabs with Counts */}
      <div className="flex bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/10 mb-6 max-w-md overflow-x-auto custom-scrollbar shrink-0">
        {[
          { id: "Pending", label: `Pending (${pendingCount})` },
          { id: "Completed", label: `Completed (${completedCount})` },
          { id: "Archived", label: `Archived (${archivedCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-black transition-all ${
              activeTab === tab.id
                ? "bg-white text-rhozly-primary shadow-sm"
                : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-rhozly-primary" size={40} />
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="flex-1 bg-rhozly-surface-lowest border-2 border-dashed border-rhozly-outline/10 rounded-[3rem] p-12 text-center flex flex-col items-center justify-center opacity-70">
          <Map size={48} className="text-rhozly-on-surface/20 mb-4" />
          <p className="text-xl font-black text-rhozly-on-surface">
            No {activeTab} Plans
          </p>
          <p className="text-sm font-bold text-rhozly-on-surface/50 mt-2">
            {activeTab === "Pending"
              ? "Click 'New Project' to let the AI design your next masterpiece."
              : "Nothing to see here yet!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan)} // 🚀 FIXED: Now opens the Staging Engine!
              className="bg-white rounded-[2rem] border border-rhozly-outline/10 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col"
            >
              {/* Cover Image */}
              <div className="h-40 bg-rhozly-surface-low relative overflow-hidden">
                {plan.cover_image_url ? (
                  <img
                    src={plan.cover_image_url}
                    alt={plan.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-rhozly-on-surface/20">
                    <Map size={40} />
                  </div>
                )}

                {/* Status Badge */}
                <div className="absolute top-4 left-4">
                  <span
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm backdrop-blur-md ${
                      plan.status === "Draft"
                        ? "bg-white/90 text-blue-600"
                        : plan.status === "In Progress"
                          ? "bg-blue-500/90 text-white"
                          : plan.status === "Completed"
                            ? "bg-green-500/90 text-white"
                            : "bg-gray-800/90 text-white"
                    }`}
                  >
                    {plan.status}
                  </span>
                </div>

                {/* Context Menu */}
                <div className="absolute top-4 right-4">
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === plan.id ? null : plan.id);
                      }}
                      className="w-8 h-8 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center text-gray-600 shadow-sm hover:bg-white transition-colors"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {/* Dropdown Menu */}
                    {openMenuId === plan.id && (
                      <div
                        className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-rhozly-outline/10 z-20 overflow-hidden animate-in fade-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {plan.status !== "Archived" ? (
                          <button
                            onClick={() => {
                              updatePlanStatus(plan.id, "Archived");
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Archive size={14} /> Archive Plan
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              updatePlanStatus(plan.id, "Draft");
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                          >
                            <ArchiveRestore size={14} /> Unarchive Plan
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setPlanToDelete(plan);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={14} /> Delete Project
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1 flex flex-col">
                <h3 className="text-xl font-black text-rhozly-on-surface mb-2 line-clamp-1">
                  {plan.name}
                </h3>
                <p className="text-sm font-bold text-rhozly-on-surface/60 line-clamp-2 mb-4 flex-1">
                  {plan.description}
                </p>

                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 pt-4 border-t border-rhozly-outline/5">
                  <span>
                    Created {new Date(plan.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-rhozly-primary group-hover:translate-x-1 transition-transform">
                    {plan.status === "Draft"
                      ? "Review Plan →"
                      : plan.status === "Completed"
                        ? "View Summary →"
                        : "Resume Plan →"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The Intake Wizard Modal */}
      {showNewPlanModal && (
        <NewPlanForm
          homeId={homeId}
          onClose={() => setShowNewPlanModal(false)}
          onSuccess={() => {
            setShowNewPlanModal(false);
            fetchPlans();
          }}
        />
      )}

      {/* The Custom Confirm Modal for Deletion */}
      <ConfirmModal
        isOpen={planToDelete !== null}
        isLoading={isDeleting}
        onClose={() => setPlanToDelete(null)}
        onConfirm={executeDeletePlan}
        title="Delete Project"
        description={`Are you sure you want to permanently delete "${planToDelete?.name}"? All associated tasks and blueprints tied to this plan will also be wiped. This action cannot be undone.`}
        confirmText="Delete Project"
        isDestructive={true}
      />

      {/* 🚀 NEW: The Staging Engine Overlay */}
      {selectedPlan && (
        <div className="fixed inset-0 z-[100] bg-white animate-in fade-in">
          <PlanStaging
            plan={selectedPlan}
            homeId={homeId}
            onBack={() => {
              setSelectedPlan(null);
              fetchPlans(); // Refresh in case they updated status
            }}
            onPlanUpdated={fetchPlans}
          />
        </div>
      )}
    </div>
  );
}

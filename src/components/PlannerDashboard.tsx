import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import {
  Loader2,
  Sparkles,
  Map,
  MoreVertical,
  Archive,
  Trash2,
  ArchiveRestore,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { logEvent, EVENT } from "../events/registry";
import { useHomeRealtime } from "../hooks/useHomeRealtime";
import NewPlanForm from "./NewPlanForm";
import PlanStaging from "./PlanStaging";

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
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: "delete" | "archive" | "unarchive";
    plan: any | null;
  }>({ isOpen: false, type: "delete", plan: null });

  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [deleteAssociatedTasks, setDeleteAssociatedTasks] = useState(true);

  // Per-card inline feedback: maps plan.id -> "success" | "error"
  const [cardStatus, setCardStatus] = useState<
    Record<string, "success" | "error">
  >({});

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

  useHomeRealtime("plans", fetchPlans);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Removed selectedPlan from the scroll lock so the staging engine scrolls naturally
  useEffect(() => {
    if (confirmState.isOpen || showNewPlanModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [confirmState.isOpen, showNewPlanModal]);

  const setCardFeedback = (
    planId: string,
    status: "success" | "error",
  ) => {
    setCardStatus((prev) => ({ ...prev, [planId]: status }));
    setTimeout(
      () =>
        setCardStatus((prev) => {
          const next = { ...prev };
          delete next[planId];
          return next;
        }),
      3000,
    );
  };

  const executeConfirmedAction = async () => {
    const { type, plan } = confirmState;
    if (!plan) return;
    setIsProcessingAction(true);

    try {
      if (type === "delete") {
        if (deleteAssociatedTasks) {
          await supabase.from("tasks").delete().eq("plan_id", plan.id);
          await supabase
            .from("task_blueprints")
            .delete()
            .eq("plan_id", plan.id);
        } else {
          await supabase
            .from("tasks")
            .update({ plan_id: null })
            .eq("plan_id", plan.id);
          await supabase
            .from("task_blueprints")
            .update({ plan_id: null })
            .eq("plan_id", plan.id);
        }
        const { error } = await supabase
          .from("plans")
          .delete()
          .eq("id", plan.id);
        if (error) throw error;
        logEvent(EVENT.PLAN_DELETED, { plan_id: plan.id, plan_name: plan.name });
        toast.success("Plan deleted successfully.");
      } else {
        const newStatus = type === "archive" ? "Archived" : "Draft";
        const { error } = await supabase
          .from("plans")
          .update({ status: newStatus })
          .eq("id", plan.id);
        if (error) throw error;
        logEvent(
          type === "archive" ? EVENT.PLAN_ARCHIVED : EVENT.PLAN_CREATED,
          { plan_id: plan.id, plan_name: plan.name },
        );
        setCardFeedback(plan.id, "success");
        toast.success(
          `Plan ${type === "archive" ? "archived" : "restored"}.`,
        );
      }

      fetchPlans();
      setConfirmState({ isOpen: false, type: "delete", plan: null });
      setDeleteAssociatedTasks(true);
    } catch (err: any) {
      const label =
        type === "delete"
          ? "delete this plan"
          : type === "archive"
            ? "archive this plan"
            : "restore this plan";
      setCardFeedback(plan.id, "error");
      toast.error(`Could not ${label}. Please try again.`);
      console.error(err);
    } finally {
      setIsProcessingAction(false);
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

  // Render the staging engine in-place so the app layout/nav is preserved,
  // but wrap it with a breadcrumb strip so the user retains wayfinding context.
  if (selectedPlan) {
    return (
      <div className="max-w-6xl mx-auto h-full flex flex-col animate-in fade-in duration-300">
        <div className="flex items-center gap-2 px-4 md:px-8 pt-4 md:pt-6 pb-2 shrink-0">
          <button
            onClick={() => {
              setSelectedPlan(null);
              fetchPlans();
            }}
            className="flex items-center gap-1.5 text-sm font-black text-rhozly-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary rounded"
          >
            <ChevronLeft size={16} />
            Plans
          </button>
          <span className="text-rhozly-on-surface/30 font-bold text-sm">/</span>
          <span className="text-sm font-bold text-rhozly-on-surface/60 truncate max-w-[200px]">
            {selectedPlan.name}
          </span>
        </div>
        <PlanStaging
          plan={selectedPlan}
          homeId={homeId}
          onBack={() => {
            setSelectedPlan(null);
            fetchPlans();
          }}
          onPlanUpdated={fetchPlans}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black font-display text-rhozly-on-surface flex items-center gap-3">
            <Map className="text-rhozly-primary" size={32} /> Landscape Planner
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/50 uppercase tracking-widest mt-1">
            AI-Assisted Plan Management
          </p>
        </div>
        <button
          onClick={() => setShowNewPlanModal(true)}
          className="px-6 py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:bg-rhozly-primary/90 transition-transform active:scale-95 flex items-center gap-2 w-full md:w-auto justify-center"
        >
          <Sparkles size={20} /> New Plan
        </button>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Plan status"
        className="flex bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/10 mb-6 max-w-md overflow-x-auto custom-scrollbar shrink-0"
      >
        {[
          { id: "Pending", label: `Pending (${pendingCount})` },
          { id: "Completed", label: `Completed (${completedCount})` },
          { id: "Archived", label: `Archived (${archivedCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
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
        <div className="flex-1 bg-rhozly-surface-lowest border-2 border-dashed border-rhozly-outline/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center opacity-70">
          <Map size={48} className="text-rhozly-on-surface/20 mb-4" />
          <p className="text-xl font-black text-rhozly-on-surface">
            No {activeTab} Plans
          </p>
          <p className="text-sm font-bold text-rhozly-on-surface/50 mt-2">
            {activeTab === "Pending"
              ? "Click 'New Plan' to let the AI design your next masterpiece."
              : "Nothing to see here yet!"}
          </p>
        </div>
      ) : (
        <div data-testid="planner-plan-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className="bg-white rounded-[2rem] border border-rhozly-outline/10 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col relative"
            >
              {/* Per-card inline feedback banner */}
              {cardStatus[plan.id] && (
                <div
                  className={`absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 py-2 text-xs font-black uppercase tracking-widest animate-in fade-in ${
                    cardStatus[plan.id] === "success"
                      ? "bg-green-500 text-white"
                      : "bg-red-500 text-white"
                  }`}
                >
                  {cardStatus[plan.id] === "success" ? (
                    <>
                      <CheckCircle2 size={14} /> Saved
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} /> Failed
                    </>
                  )}
                </div>
              )}

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

                <div className="absolute top-2 right-2">
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === plan.id ? null : plan.id);
                      }}
                      className="min-w-[44px] min-h-[44px] bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center text-gray-600 shadow-sm hover:bg-white transition-colors"
                      aria-label="Plan options"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openMenuId === plan.id && (
                      <div
                        className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-rhozly-outline/10 z-20 overflow-hidden animate-in fade-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {plan.status !== "Archived" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmState({
                                isOpen: true,
                                type: "archive",
                                plan,
                              });
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Archive size={14} /> Archive Plan
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmState({
                                isOpen: true,
                                type: "unarchive",
                                plan,
                              });
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                          >
                            <ArchiveRestore size={14} /> Restore Plan
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmState({
                              isOpen: true,
                              type: "delete",
                              plan,
                            });
                            setOpenMenuId(null);
                          }}
                          className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={14} /> Delete Plan
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

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

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {confirmState.isOpen && confirmState.plan && (
              <div
                className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
                onClick={() =>
                  setConfirmState({ ...confirmState, isOpen: false })
                }
              >
                <div
                  className="bg-white p-6 sm:p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shrink-0 ${confirmState.type === "delete" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}
                  >
                    {confirmState.type === "delete" ? (
                      <Trash2 size={32} />
                    ) : confirmState.type === "archive" ? (
                      <Archive size={32} />
                    ) : (
                      <ArchiveRestore size={32} />
                    )}
                  </div>

                  <h3 className="font-black text-2xl text-rhozly-on-surface mb-2 shrink-0">
                    {confirmState.type === "delete"
                      ? "Delete Plan"
                      : confirmState.type === "archive"
                        ? "Archive Plan"
                        : "Restore Plan"}
                  </h3>

                  <p className="text-sm font-bold text-gray-500 mb-6 leading-relaxed shrink-0">
                    {confirmState.type === "delete" ? (
                      <>
                        Are you sure you want to delete{" "}
                        <span className="font-black text-rhozly-on-surface">
                          "{confirmState.plan.name}"
                        </span>
                        ? This action cannot be undone.
                      </>
                    ) : confirmState.type === "archive" ? (
                      <>
                        Are you sure you want to move{" "}
                        <span className="font-black text-rhozly-on-surface">
                          "{confirmState.plan.name}"
                        </span>{" "}
                        to your archives? You can restore it later.
                      </>
                    ) : (
                      <>
                        Are you sure you want to restore{" "}
                        <span className="font-black text-rhozly-on-surface">
                          "{confirmState.plan.name}"
                        </span>{" "}
                        to your active plans?
                      </>
                    )}
                  </p>

                  {confirmState.type === "delete" && (
                    <label className="flex items-start gap-3 p-4 bg-red-50/50 rounded-2xl border border-red-100 cursor-pointer mb-6 text-left w-full hover:bg-red-50 transition-colors shrink-0">
                      <input
                        type="checkbox"
                        checked={deleteAssociatedTasks}
                        onChange={(e) =>
                          setDeleteAssociatedTasks(e.target.checked)
                        }
                        className="accent-red-500 w-5 h-5 shrink-0 mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-black text-red-900">
                          Delete associated tasks?
                        </p>
                        <p className="text-[10px] font-bold text-red-700/70 mt-1 leading-tight">
                          Check this to wipe all active tasks and maintenance
                          blueprints generated by this plan from your calendar.
                          Uncheck to keep the tasks running but delete the plan.
                        </p>
                      </div>
                    </label>
                  )}

                  <div className="flex gap-3 shrink-0 mt-auto pt-2">
                    <button
                      onClick={() =>
                        setConfirmState({ ...confirmState, isOpen: false })
                      }
                      disabled={isProcessingAction}
                      className="flex-1 py-4 rounded-2xl font-black bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeConfirmedAction}
                      disabled={isProcessingAction}
                      className={`flex-1 py-4 rounded-2xl font-black text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${confirmState.type === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}`}
                    >
                      {isProcessingAction ? (
                        <Loader2 className="animate-spin mx-auto" size={20} />
                      ) : confirmState.type === "delete" ? (
                        "Delete"
                      ) : (
                        "Confirm"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>,
          document.body,
        )}
    </div>
  );
}

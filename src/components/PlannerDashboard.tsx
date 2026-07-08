import React, { useState, useEffect, useRef } from "react";
import { readSnapshot, writeSnapshot } from "../lib/snapshotCache";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { usePermissions } from "../context/HomePermissionsContext";
import {
  Loader2,
  MoreVertical,
  Archive,
  Trash2,
  ArchiveRestore,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  HelpCircle,
  Leaf,
  Plus,
  Sun,
  Construction,
  Sprout,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { logEvent, EVENT } from "../events/registry";
import { useHomeRealtime } from "../hooks/useHomeRealtime";
import { useSearchParams, useNavigate } from "react-router-dom";
import { IconAI, IconPlanner } from "../constants/icons";
import NewPlanForm from "./NewPlanForm";
import OverhaulPlanForm from "./planner/OverhaulPlanForm";
import PlantFirstPlanForm from "./planner/PlantFirstPlanForm";
import PlantFirstPlanView from "./planner/PlantFirstPlanView";
import PlanStaging from "./PlanStaging";
import AssistantCard from "./AssistantCard";
import {
  readPlannerPrefill,
  clearPlannerPrefill,
  type PlannerPrefill,
} from "../lib/plannerPrefill";
import { Repeat } from "lucide-react";

interface PlannerDashboardProps {
  homeId: string;
  aiEnabled?: boolean;
}

export default function PlannerDashboard({ homeId, aiEnabled = false }: PlannerDashboardProps) {
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const openHandled = useRef(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [planCounts, setPlanCounts] = useState<Record<string, { tasks: number; blueprints: number }>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "Pending" | "Completed" | "Archived"
  >("Pending");
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  // Pre-fill set when the user arrived here via the chat's plan-suggestion CTA.
  const [newPlanPrefill, setNewPlanPrefill] = useState<PlannerPrefill | null>(null);
  const [showPlanExplainer, setShowPlanExplainer] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  // Garden Overhaul (photo + AI redesign) — Sage+ feature. Now flows
  // through the same PlanStaging engine as designed plans, so we
  // don't need a separate result-view state.
  const [showOverhaulModal, setShowOverhaulModal] = useState(false);
  const [showPlantFirstModal, setShowPlantFirstModal] = useState(false);
  const [userTier, setUserTier] = useState<string | null>(null);
  const hasOverhaulAccess = userTier === "sage" || userTier === "evergreen";

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

  // Read the caller's subscription tier so the Overhaul button can
  // gate behind Sage+. Loaded once on mount; if missing the button
  // shows a locked placeholder pointing at the upgrade flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return;
        const { data } = await supabase
          .from("user_profiles")
          .select("subscription_tier")
          .eq("uid", auth.user.id)
          .maybeSingle();
        if (!cancelled) setUserTier(data?.subscription_tier ?? null);
      } catch {
        if (!cancelled) setUserTier(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (openHandled.current) return;
    if (searchParams.get("open") === "new-plan") {
      openHandled.current = true;
      // Consume a pending chat hand-off payload, if any. Cleared so a
      // subsequent manual "New Plan" press starts blank.
      const prefill = readPlannerPrefill();
      if (prefill) {
        setNewPlanPrefill(prefill);
        clearPlannerPrefill();
      }
      setShowNewPlanModal(true);
      setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("open"); return n; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchPlans = async () => {
    // Offline-first Phase 2: paint cached plans + counts instantly so the
    // Planner opens offline.
    const cached = homeId ? readSnapshot<{ plans: any[]; counts: Record<string, { tasks: number; blueprints: number }> }>("planner", homeId) : null;
    if (cached) {
      setPlans(cached.data.plans);
      setPlanCounts(cached.data.counts);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setFetchError(false);
    const [plansResult, tasksResult, bpResult] = await Promise.all([
      supabase
        .from("plans")
        .select("*")
        .eq("home_id", homeId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("plan_id")
        .eq("home_id", homeId)
        .not("plan_id", "is", null),
      supabase
        .from("task_blueprints")
        .select("plan_id")
        .eq("home_id", homeId)
        .not("plan_id", "is", null),
    ]);

    if (plansResult.error) {
      if (!cached) setFetchError(true); // keep cached plans visible offline
      Logger.error("Failed to load plans", plansResult.error, {}, "Failed to load plans.");
    } else {
      const freshPlans = plansResult.data || [];
      setPlans(freshPlans);
      const counts: Record<string, { tasks: number; blueprints: number }> = {};
      (tasksResult.data || []).forEach((row: any) => {
        if (!row.plan_id) return;
        counts[row.plan_id] = counts[row.plan_id] || { tasks: 0, blueprints: 0 };
        counts[row.plan_id].tasks++;
      });
      (bpResult.data || []).forEach((row: any) => {
        if (!row.plan_id) return;
        counts[row.plan_id] = counts[row.plan_id] || { tasks: 0, blueprints: 0 };
        counts[row.plan_id].blueprints++;
      });
      setPlanCounts(counts);
      if (homeId) writeSnapshot("planner", homeId, { plans: freshPlans, counts });
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
          type === "archive" ? EVENT.PLAN_ARCHIVED : EVENT.PLAN_RESTORED,
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
      Logger.error(`Failed to ${label}`, err, {}, `Could not ${label}. Please try again.`);
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
      <div className="h-full flex flex-col animate-in fade-in duration-300">
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
        {selectedPlan.kind === "plant-first" ? (
          <PlantFirstPlanView
            plan={selectedPlan}
            homeId={homeId}
            onBack={() => {
              setSelectedPlan(null);
              fetchPlans();
            }}
          />
        ) : (
          <PlanStaging
            plan={selectedPlan}
            homeId={homeId}
            onBack={() => {
              setSelectedPlan(null);
              fetchPlans();
            }}
            onPlanUpdated={fetchPlans}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black font-display text-rhozly-on-surface flex items-center gap-3">
            <IconPlanner className="text-rhozly-primary" size={32} /> Planner
            {plans.filter((p) => p.status !== "archived").length > 0 && (
              <span className="text-base font-black bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-xl">
                {plans.filter((p) => p.status !== "archived").length}
              </span>
            )}
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/50 mt-1">
            Plan a garden project from idea to harvest — group plants, tasks, and notes together.
          </p>
        </div>
        <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-2">
          {/* "What's a Plan?" sits on its own row on mobile so the
              two main actions get the full width side-by-side. */}
          <button
            onClick={() => setShowPlanExplainer(true)}
            data-testid="planner-what-is-plan"
            className="self-start md:self-auto flex items-center gap-1.5 text-sm font-bold text-rhozly-on-surface/50 hover:text-rhozly-primary transition-colors px-3 py-2 rounded-xl hover:bg-rhozly-primary/5"
          >
            <HelpCircle size={15} /> What's a Plan?
          </button>
          {can("plans.create") && (
            <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2">
              <button
                onClick={() => setShowOverhaulModal(true)}
                data-testid="planner-overhaul-btn"
                title={
                  hasOverhaulAccess
                    ? "Photo + AI redesign — Sage+ feature"
                    : "Reimagine: Sage+ feature"
                }
                className="px-3 sm:px-4 py-4 bg-white border-2 border-rhozly-primary/30 text-rhozly-primary rounded-2xl font-black shadow-sm hover:bg-rhozly-primary/5 transition-transform active:scale-95 flex items-center gap-1.5 justify-center min-w-0"
              >
                <IconAI size={18} />
                <span className="truncate">Reimagine</span>
                {!hasOverhaulAccess && (
                  <span className="text-[9px] uppercase tracking-widest text-rhozly-on-surface/45 hidden sm:inline">
                    Sage+
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowNewPlanModal(true)}
                data-testid="planner-new-plan-btn"
                className="px-4 sm:px-6 py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:bg-rhozly-primary/90 transition-transform active:scale-95 flex items-center gap-1.5 justify-center min-w-0"
              >
                <Plus size={20} /> <span className="truncate">New Plan</span>
              </button>
              <button
                onClick={() => setShowPlantFirstModal(true)}
                data-testid="planner-plant-first-btn"
                title={hasOverhaulAccess ? "Pick plants, AI arranges them into a plan — Sage+" : "Plan around my plants: Sage+ feature"}
                className="col-span-2 md:col-span-1 px-3 sm:px-4 py-4 bg-white border-2 border-rhozly-primary/30 text-rhozly-primary rounded-2xl font-black shadow-sm hover:bg-rhozly-primary/5 transition-transform active:scale-95 flex items-center gap-1.5 justify-center min-w-0"
              >
                <Sprout size={18} />
                <span className="truncate">My Plants</span>
                {!hasOverhaulAccess && (
                  <span className="text-[9px] uppercase tracking-widest text-rhozly-on-surface/45 hidden sm:inline">Sage+</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      {/* AI Assistant — surfaced here so plan-related insights catch the user
          mid-planning rather than only on the dashboard. */}
      <div className="mb-6">
        <AssistantCard contextLabel="Your plans" />
      </div>

      <div
        role="tablist"
        aria-label="Plan status"
        className="flex overflow-x-auto gap-1 bg-rhozly-surface-low p-1.5 rounded-2xl border border-rhozly-outline/10 mb-6"
      >
        {[
          { id: "Pending", label: `Active (${pendingCount})` },
          { id: "Completed", label: `Completed (${completedCount})` },
          { id: "Archived", label: `Archived (${archivedCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-3 min-h-[44px] rounded-2xl text-xs sm:text-sm font-black transition-all ${
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-[2.5rem] border border-rhozly-outline/10 overflow-hidden animate-pulse">
              <div className="h-40 bg-rhozly-surface-low" />
              <div className="p-6 space-y-3">
                <div className="h-6 w-2/3 bg-rhozly-surface-low rounded-full" />
                <div className="h-3 w-full bg-rhozly-surface-low rounded-full" />
                <div className="h-3 w-4/5 bg-rhozly-surface-low rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : fetchError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-lg font-black text-rhozly-on-surface">Failed to load plans</p>
          <p className="text-sm font-bold text-rhozly-on-surface/50">Check your connection and try again.</p>
          <button
            onClick={fetchPlans}
            className="px-6 py-3 min-h-[44px] bg-rhozly-primary text-white rounded-2xl font-black shadow-sm hover:bg-rhozly-primary/90 transition-colors active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="flex-1 bg-rhozly-surface-lowest border-2 border-dashed border-rhozly-outline/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center opacity-70">
          <IconPlanner size={48} className="text-rhozly-on-surface/20 mb-4" />
          {plans.length === 0 ? (
            <>
              <p className="text-xl font-black text-rhozly-on-surface">
                No plans yet
              </p>
              <p className="text-sm font-bold text-rhozly-on-surface/50 mt-2 max-w-xs">
                A Plan is a garden project — like "Spring Veggie Bed" or "Front Path Makeover". It groups your plant choices, task schedules, and notes in one place.
              </p>
              {can("plans.create") && (
                <button
                  onClick={() => setShowNewPlanModal(true)}
                  className="mt-6 px-6 py-3 min-h-[44px] bg-rhozly-primary text-white rounded-2xl font-black shadow-sm hover:bg-rhozly-primary/90 transition-colors active:scale-95 flex items-center gap-2"
                >
                  <Plus size={16} /> Create your first Plan
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-xl font-black text-rhozly-on-surface">
                No {activeTab === "Pending" ? "active" : activeTab.toLowerCase()} plans
              </p>
              <p className="text-sm font-bold text-rhozly-on-surface/50 mt-2">
                Switch to a different tab to see your other plans.
              </p>
            </>
          )}
        </div>
      ) : (
        <div data-testid="planner-plan-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className="bg-white rounded-[2.5rem] border border-rhozly-outline/10 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col relative"
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
                ) : plan.kind === "overhaul" && plan.status === "Failed" ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-rose-50 text-rose-600">
                    <AlertCircle size={36} />
                    <p className="text-xs font-black uppercase tracking-widest">
                      Generation failed
                    </p>
                  </div>
                ) : plan.kind === "overhaul" && !plan.ai_blueprint ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-amber-50 text-amber-700">
                    <Loader2 size={36} className="animate-spin" />
                    <p className="text-xs font-black uppercase tracking-widest">
                      Generating overhaul…
                    </p>
                  </div>
                ) : plan.kind === "overhaul" ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-amber-50 text-amber-700">
                    <Construction size={36} />
                    <p className="text-xs font-black uppercase tracking-widest">
                      Pick a concept
                    </p>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-rhozly-on-surface/20">
                    <IconPlanner size={40} />
                  </div>
                )}

                {/* Secondary action buttons (Sun + View on Layout) sit
                    at the bottom-left of the cover so they never
                    collide with the kebab menu in the top-right. */}
                <div className="absolute bottom-2 left-2 z-20 flex gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    data-testid={`plan-sun-tracker-${plan.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      sessionStorage.setItem("rhozly:sun-tracker-plan-filter", plan.id);
                      sessionStorage.setItem("rhozly:sun-tracker-plan-filter-name", plan.name || "");
                      navigate("/sun-trajectory?mode=garden");
                    }}
                    className="min-h-[32px] min-w-[32px] flex items-center justify-center gap-1 px-2.5 rounded-xl bg-white/95 backdrop-blur-sm shadow-md border border-rhozly-outline/15 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/70 hover:text-amber-600 transition-colors"
                    title="Open this plan's beds in the Sun Tracker"
                    aria-label={`Open ${plan.name} in Sun Tracker`}
                  >
                    <Sun size={11} />
                    <span className="hidden sm:inline">Sun</span>
                  </button>
                  <button
                    data-testid={`plan-view-on-layout-${plan.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      sessionStorage.setItem("rhozly:plan-filter", plan.id);
                      navigate("/garden-layout");
                    }}
                    className="min-h-[32px] px-3 rounded-xl bg-white/95 backdrop-blur-sm shadow-md border border-rhozly-outline/15 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/70 hover:text-rhozly-on-surface transition-colors"
                    title="Filter the garden layout to shapes in this plan"
                  >
                    View on Layout
                  </button>
                </div>

                <div className="absolute top-4 left-4">
                  <span
                    title={
                      plan.status === "Draft"        ? "Still planning and researching" :
                      plan.status === "In Progress"  ? "Actively working on this project" :
                      plan.status === "Completed"    ? "Done — kept as a reference" :
                                                       "Hidden from your active plans"
                    }
                    className={`px-3 py-1.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm backdrop-blur-md cursor-help ${
                      plan.status === "Draft"
                        ? "bg-white/90 text-rhozly-primary"
                        : plan.status === "In Progress"
                          ? "bg-rhozly-primary/90 text-white"
                          : plan.status === "Completed"
                            ? "bg-emerald-500/90 text-white"
                            : "bg-rhozly-on-surface/80 text-white"
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
                      className="min-w-[44px] min-h-[44px] bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center text-rhozly-on-surface/60 shadow-sm hover:bg-white transition-colors"
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
                            className="w-full px-4 py-3 text-left text-sm font-bold text-rhozly-on-surface/70 hover:bg-rhozly-surface-low flex items-center gap-2"
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
                            className="w-full px-4 py-3 text-left text-sm font-bold text-rhozly-primary hover:bg-rhozly-primary/5 flex items-center gap-2"
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
                <p className="text-sm font-bold text-rhozly-on-surface/60 line-clamp-2 mb-3 flex-1">
                  {plan.description}
                </p>
                {/* Content preview */}
                {(() => {
                  const plantCount = plan.ai_blueprint?.plant_manifest?.length ?? 0;
                  const counts = planCounts[plan.id];
                  const taskCount = counts?.tasks ?? 0;
                  const bpCount = counts?.blueprints ?? 0;
                  const parts: React.ReactNode[] = [];
                  if (plantCount > 0) {
                    parts.push(
                      <span key="plants" className="flex items-center gap-1">
                        <Leaf size={11} className="text-rhozly-primary/60" />
                        {plantCount} plant{plantCount !== 1 ? "s" : ""}
                      </span>,
                    );
                  }
                  if (taskCount > 0) {
                    parts.push(
                      <span key="tasks" className="flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-rhozly-primary/60" />
                        {taskCount} task{taskCount !== 1 ? "s" : ""}
                      </span>,
                    );
                  }
                  if (bpCount > 0) {
                    parts.push(
                      <span key="bp" className="flex items-center gap-1">
                        <Repeat size={11} className="text-rhozly-primary/60" />
                        {bpCount} schedule{bpCount !== 1 ? "s" : ""}
                      </span>,
                    );
                  }
                  if (parts.length === 0) return null;
                  return (
                    <div className="flex items-center gap-3 text-[11px] font-bold text-rhozly-on-surface/45 mb-3 flex-wrap">
                      {parts.map((p, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-rhozly-on-surface/20">·</span>}
                          {p}
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })()}
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

      {/* Garden Overhaul form — Sage+ photo→AI redesign flow. After
          submit, the new plan opens in the same PlanStaging engine
          as designed plans (Phase 1 = concept picker, Phases 2–5 =
          same area/shed/staging/execution/maintenance workflow). */}
      <OverhaulPlanForm
        homeId={homeId}
        isOpen={showOverhaulModal}
        hasAccess={hasOverhaulAccess}
        onClose={() => setShowOverhaulModal(false)}
        onSubmitted={async (planId) => {
          setShowOverhaulModal(false);
          await fetchPlans();
          // fetchPlans is async via setPlans; the plan row will be
          // present in the next render. Fetch the row directly so
          // we can hand a populated plan object to PlanStaging.
          const { data: planRow } = await supabase
            .from("plans")
            .select("*")
            .eq("id", planId)
            .maybeSingle();
          if (planRow) setSelectedPlan(planRow);
        }}
      />

      {showNewPlanModal && (
        <NewPlanForm
          homeId={homeId}
          aiEnabled={aiEnabled}
          initialName={newPlanPrefill?.name}
          initialDescription={newPlanPrefill?.description}
          onClose={() => {
            setShowNewPlanModal(false);
            setNewPlanPrefill(null);
          }}
          onSuccess={() => {
            setShowNewPlanModal(false);
            setNewPlanPrefill(null);
            fetchPlans();
          }}
        />
      )}

      <PlantFirstPlanForm
        homeId={homeId}
        userTier={userTier}
        isOpen={showPlantFirstModal}
        onClose={() => setShowPlantFirstModal(false)}
        onCreated={async (planRow) => {
          setShowPlantFirstModal(false);
          await fetchPlans();
          if (planRow) setSelectedPlan(planRow);
        }}
      />


      {typeof document !== "undefined" &&
        createPortal(
          <>
            {showPlanExplainer && (
              <div
                className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
                onClick={() => setShowPlanExplainer(false)}
              >
                <div
                  className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-5 sm:p-8 flex flex-col gap-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between">
                    <div className="bg-rhozly-primary/10 p-3 rounded-2xl">
                      <IconPlanner size={24} className="text-rhozly-primary" />
                    </div>
                    <button onClick={() => setShowPlanExplainer(false)} className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-rhozly-on-surface mb-2">What's a Plan?</h2>
                    <p className="text-sm font-bold text-rhozly-on-surface/60 leading-relaxed">
                      A Plan is a garden project — like <em>"Spring Veggie Bed 2026"</em> or <em>"Front Path Makeover"</em>. It groups your plant choices, task schedules, and AI notes in one place so you can track everything from idea to completion.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { status: "Draft", colour: "text-rhozly-primary bg-rhozly-primary/10", desc: "Still planning and researching your plant choices." },
                      { status: "In Progress", colour: "text-white bg-rhozly-primary", desc: "Actively planting and working on this project." },
                      { status: "Completed", colour: "text-white bg-emerald-500", desc: "All done — kept as a reference for next time." },
                    ].map((s) => (
                      <div key={s.status} className="flex items-start gap-3">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase tracking-widest shrink-0 ${s.colour}`}>{s.status}</span>
                        <p className="text-xs font-bold text-rhozly-on-surface/60 pt-0.5">{s.desc}</p>
                      </div>
                    ))}
                  </div>
                  {can("plans.create") && (
                    <button
                      onClick={() => { setShowPlanExplainer(false); setShowNewPlanModal(true); }}
                      className="w-full py-3.5 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg hover:bg-rhozly-primary/90 transition-colors flex items-center justify-center gap-2"
                    >
                      <IconAI size={18} /> Create my first Plan
                    </button>
                  )}
                </div>
              </div>
            )}
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
                    className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shrink-0 ${confirmState.type === "delete" ? "bg-red-50 text-red-500" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
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

                  <p className="text-sm font-bold text-rhozly-on-surface/50 mb-6 leading-relaxed shrink-0">
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
                      className="flex-1 py-4 rounded-2xl font-black bg-rhozly-surface-low text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeConfirmedAction}
                      disabled={isProcessingAction}
                      className={`flex-1 py-4 rounded-2xl font-black text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${confirmState.type === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-rhozly-primary hover:bg-rhozly-primary/90"}`}
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

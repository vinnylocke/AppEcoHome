import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  Copy,
  Check,
  LogOut,
  Trash2,
  Plus,
  Loader2,
  UserPlus,
  Key,
  UserX,
  Users,
  Pencil,
  Save,
  X,
  ChevronDown,
  Settings2,
  Mail,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { ConfirmModal } from "./ConfirmModal";
import { COUNTRIES } from "../constants/countries";
import { resolvePermissions, ROLE_DEFAULTS, type Role, type PermissionKey } from "../lib/permissions";
import { fetchUsdaZone } from "../lib/hardinessZone";
import HomeLocationInsights from "./HomeLocationInsights";
import { logEvent, EVENT } from "../events/registry";

const ALL_TIMEZONES: string[] = (() => {
  try { return (Intl as any).supportedValuesOf("timeZone") as string[]; }
  catch { return ["UTC"]; }
})();

interface HomeMember {
  memberId: string;
  userId: string;
  role: Role;
  permissions: Record<string, boolean>;
  displayName: string | null;
  email: string;
  canViewAudit?: boolean;
}

const PERMISSION_GROUPS: Array<{ label: string; keys: Array<{ key: PermissionKey; label: string }> }> = [
  { label: "The Shed", keys: [
    { key: "shed.add", label: "Add plants" },
    { key: "shed.edit", label: "Edit plants" },
    { key: "shed.delete", label: "Delete plants" },
  ]},
  { label: "Areas & Locations", keys: [
    { key: "areas.create", label: "Create areas" },
    { key: "areas.edit", label: "Edit areas" },
    { key: "areas.delete", label: "Delete areas" },
    { key: "locations.create", label: "Create locations" },
    { key: "locations.edit", label: "Edit locations" },
    { key: "locations.delete", label: "Delete locations" },
  ]},
  { label: "Tasks", keys: [
    { key: "tasks.create_home", label: "Create home tasks" },
    { key: "tasks.create_personal", label: "Create personal tasks" },
    { key: "tasks.edit_own", label: "Edit own tasks" },
    { key: "tasks.edit_any", label: "Edit any task" },
    { key: "tasks.delete_own", label: "Delete own tasks" },
    { key: "tasks.delete_any", label: "Delete any task" },
    { key: "tasks.view_home", label: "View home tasks" },
    { key: "tasks.view_members", label: "View members' personal tasks" },
  ]},
  { label: "Ailments", keys: [
    { key: "ailments.add", label: "Add ailments" },
    { key: "ailments.edit", label: "Edit ailments" },
    { key: "ailments.delete", label: "Delete ailments" },
  ]},
  { label: "Plans", keys: [
    { key: "plans.create", label: "Create plans" },
    { key: "plans.edit", label: "Edit plans" },
    { key: "plans.delete", label: "Delete plans" },
  ]},
  { label: "Garden Layout", keys: [
    { key: "layout.edit", label: "Edit layout" },
  ]},
  { label: "Shopping", keys: [
    { key: "shopping.create_list", label: "Create lists" },
    { key: "shopping.add_items", label: "Add items" },
    { key: "shopping.edit_items", label: "Edit items" },
    { key: "shopping.delete_items", label: "Delete items" },
    { key: "shopping.delete_list", label: "Delete lists" },
  ]},
  { label: "Integrations", keys: [
    { key: "integrations.manage", label: "Add, edit & remove integrations" },
    { key: "integrations.control", label: "Control devices (turn on/off)" },
    { key: "integrations.view", label: "View integrations & history" },
  ]},
  { label: "Automations", keys: [
    { key: "automations.manage", label: "Add, edit & delete automations" },
    { key: "automations.view", label: "View automations & run history" },
  ]},
  { label: "Audit & Usage", keys: [
    { key: "audit.view_all", label: "View all members' activity" },
  ]},
];

interface HomeWithRole {
  id: string;
  name: string;
  address: string | null;
  role: "owner" | "member";
  country: string | null;
  timezone: string | null;
  lat: number | null;
  lng: number | null;
  hardiness_zone: number | null;
  climate_zone: string | null;
  members: HomeMember[];
}

interface EditForm {
  name: string;
  address: string;
  country: string;
  timezone: string;
}

interface Props {
  currentHomeId: string;
  userId: string;
  onSwitchHome: (homeId: string) => void;
  onAddNewHome: () => void;
  onHomeChanged: () => void;
}

type ModalState =
  | { open: false }
  | { open: true; type: "leave" | "delete"; homeId: string; homeName: string }
  | { open: true; type: "remove_member"; homeId: string; homeName: string; memberId: string; memberName: string };

export default function HomeManagement({
  currentHomeId,
  userId,
  onSwitchHome,
  onAddNewHome,
  onHomeChanged,
}: Props) {
  const [homes, setHomes] = useState<HomeWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [openConfigMemberId, setOpenConfigMemberId] = useState<string | null>(null);
  const [recalculatingZones, setRecalculatingZones] = useState<Set<string>>(new Set());

  // Per-home tab state
  type HomeTab = "settings" | "insights" | "members";
  const [homeTabs, setHomeTabs] = useState<Record<string, HomeTab>>({});
  const getTab = (homeId: string): HomeTab => homeTabs[homeId] ?? "settings";
  const setTab = (homeId: string, tab: HomeTab) =>
    setHomeTabs((prev) => ({ ...prev, [homeId]: tab }));

  // Per-home editing state: homeId → form or null (not editing)
  const [editingForms, setEditingForms] = useState<Record<string, EditForm | null>>({});
  const [savingHomeId, setSavingHomeId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile Quick Access Wave 3 — rain-advice thresholds from home_climate.
  // Loaded after homes; defaults shown until first save.
  const [rainConfigMap, setRainConfigMap] = useState<
    Record<string, { rain_skip_mm: number; rain_water_mm: number }>
  >({});
  const [editingRain, setEditingRain] = useState<
    Record<string, { rain_skip_mm: string; rain_water_mm: string }>
  >({});
  const [rainSavingHomeId, setRainSavingHomeId] = useState<string | null>(null);
  const [rainErrorByHome, setRainErrorByHome] = useState<Record<string, string | null>>({});

  const fetchHomes = useCallback(async () => {
    setLoading(true);
    try {
      const { data: memberRows, error } = await supabase
        .from("home_members")
        .select("role, homes ( id, name, address, country, timezone, lat, lng, hardiness_zone, climate_zone )")
        .eq("user_id", userId);
      if (error || !memberRows) { setLoading(false); return; }

      const homeList: Omit<HomeWithRole, "members">[] = memberRows
        .filter((r) => r.homes)
        .map((r: any) => ({ ...r.homes, role: r.role }));

      const homeIds = homeList.map((h) => h.id);
      if (!homeIds.length) { setHomes([]); setLoading(false); return; }

      const { data: allMemberRows } = await supabase
        .from("home_members")
        .select("id, home_id, user_id, role, permissions")
        .in("home_id", homeIds);

      const userIds = [...new Set((allMemberRows ?? []).map((m) => m.user_id))];
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("uid, display_name, email, can_view_audit")
        .in("uid", userIds);

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.uid, p]),
      );

      const membersByHome: Record<string, HomeMember[]> = {};
      for (const m of allMemberRows ?? []) {
        const p = profileMap[m.user_id];
        (membersByHome[m.home_id] ??= []).push({
          memberId: m.id,
          userId: m.user_id,
          role: m.role as Role,
          permissions: m.permissions ?? {},
          displayName: p?.display_name ?? null,
          email: p?.email ?? m.user_id,
          canViewAudit: p?.can_view_audit ?? false,
        });
      }

      setHomes(homeList.map((h) => ({ ...h, members: membersByHome[h.id] ?? [] })));

      // Wave 3 — load rain-advice thresholds. Missing rows fall back to
      // hard-coded defaults (5/1) in the UI.
      const { data: climateRows } = await supabase
        .from("home_climate")
        .select("home_id, rain_skip_mm, rain_water_mm")
        .in("home_id", homeIds);
      const rainMap: Record<string, { rain_skip_mm: number; rain_water_mm: number }> = {};
      for (const row of climateRows ?? []) {
        rainMap[row.home_id] = {
          rain_skip_mm: Number(row.rain_skip_mm ?? 5),
          rain_water_mm: Number(row.rain_water_mm ?? 1),
        };
      }
      setRainConfigMap(rainMap);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const rainConfigFor = useCallback(
    (homeId: string): { rain_skip_mm: number; rain_water_mm: number } =>
      rainConfigMap[homeId] ?? { rain_skip_mm: 5, rain_water_mm: 1 },
    [rainConfigMap],
  );

  const startEditingRain = useCallback(
    (homeId: string) => {
      const current = rainConfigFor(homeId);
      setEditingRain((prev) => ({
        ...prev,
        [homeId]: {
          rain_skip_mm: String(current.rain_skip_mm),
          rain_water_mm: String(current.rain_water_mm),
        },
      }));
      setRainErrorByHome((prev) => ({ ...prev, [homeId]: null }));
    },
    [rainConfigFor],
  );

  const cancelEditingRain = useCallback((homeId: string) => {
    setEditingRain((prev) => {
      const { [homeId]: _omit, ...rest } = prev;
      return rest;
    });
    setRainErrorByHome((prev) => ({ ...prev, [homeId]: null }));
  }, []);

  const saveRainConfig = useCallback(
    async (homeId: string) => {
      const draft = editingRain[homeId];
      if (!draft) return;

      const skip = Number(draft.rain_skip_mm);
      const water = Number(draft.rain_water_mm);

      if (!Number.isFinite(skip) || skip < 0) {
        setRainErrorByHome((prev) => ({ ...prev, [homeId]: "Skip threshold must be 0 or higher." }));
        return;
      }
      if (!Number.isFinite(water) || water < 0) {
        setRainErrorByHome((prev) => ({ ...prev, [homeId]: "Water threshold must be 0 or higher." }));
        return;
      }
      if (water > skip) {
        setRainErrorByHome((prev) => ({ ...prev, [homeId]: "Water threshold must be at or below the skip threshold." }));
        return;
      }

      setRainSavingHomeId(homeId);
      try {
        const { error } = await supabase
          .from("home_climate")
          .upsert(
            { home_id: homeId, rain_skip_mm: skip, rain_water_mm: water },
            { onConflict: "home_id" },
          );
        if (error) throw error;
        setRainConfigMap((prev) => ({
          ...prev,
          [homeId]: { rain_skip_mm: skip, rain_water_mm: water },
        }));
        setEditingRain((prev) => {
          const { [homeId]: _omit, ...rest } = prev;
          return rest;
        });
        setRainErrorByHome((prev) => ({ ...prev, [homeId]: null }));
      } catch (err: any) {
        setRainErrorByHome((prev) => ({ ...prev, [homeId]: err?.message ?? "Couldn't save." }));
      } finally {
        setRainSavingHomeId(null);
      }
    },
    [editingRain],
  );

  useEffect(() => { fetchHomes(); }, [fetchHomes]);

  const recalculateZone = useCallback(async (home: HomeWithRole) => {
    if (!home.lat || !home.lng) return;
    setRecalculatingZones((prev) => new Set([...prev, home.id]));
    try {
      const zone = await fetchUsdaZone(home.lat, home.lng);
      await supabase.from("homes").update({ hardiness_zone: zone }).eq("id", home.id);
      setHomes((prev) =>
        prev.map((h) => (h.id === home.id ? { ...h, hardiness_zone: zone } : h)),
      );
    } catch {
      // silently fail — zone stays null and user can retry via button
    } finally {
      setRecalculatingZones((prev) => {
        const s = new Set(prev);
        s.delete(home.id);
        return s;
      });
    }
  }, []);

  // Auto-calculate zone for any home that has lat/lng but no zone yet
  useEffect(() => {
    if (homes.length === 0) return;
    homes.forEach((home) => {
      if (home.hardiness_zone == null && home.lat && home.lng) {
        recalculateZone(home);
      }
    });
  }, [homes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    Logger.success("Home ID copied to clipboard!");
  };

  const startEdit = (home: HomeWithRole) => {
    setEditingForms((prev) => ({
      ...prev,
      [home.id]: {
        name: home.name,
        address: home.address ?? "",
        country: home.country ?? "",
        timezone: home.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
      },
    }));
  };

  const cancelEdit = (homeId: string) => {
    setEditingForms((prev) => ({ ...prev, [homeId]: null }));
  };

  const saveEdit = async (homeId: string) => {
    const form = editingForms[homeId];
    if (!form) return;
    setSavingHomeId(homeId);
    try {
      const { error } = await supabase
        .from("homes")
        .update({
          name: form.name.trim() || undefined,
          address: form.address.trim() || null,
          country: form.country || null,
          timezone: form.timezone || null,
        })
        .eq("id", homeId);
      if (error) throw error;
      Logger.success("Home details updated!");
      setEditingForms((prev) => ({ ...prev, [homeId]: null }));
      await fetchHomes();
      onHomeChanged();
    } catch (err: any) {
      Logger.error("Failed to update home", err, {}, err.message);
    } finally {
      setSavingHomeId(null);
    }
  };

  const updateField = (homeId: string, field: keyof EditForm, value: string) => {
    setEditingForms((prev) => {
      const existing = prev[homeId];
      if (!existing) return prev;
      return { ...prev, [homeId]: { ...existing, [field]: value } };
    });
  };

  const handleConfirm = async () => {
    if (!modal.open) return;
    setIsProcessing(true);
    try {
      if (modal.type === "remove_member") {
        const { error } = await supabase
          .from("home_members")
          .delete()
          .eq("home_id", modal.homeId)
          .eq("user_id", modal.memberId);
        if (error) throw error;
        Logger.success(`Removed ${modal.memberName} from ${modal.homeName}`);
      } else {
        const rpc = modal.type === "delete" ? "delete_home_entirely" : "leave_home";
        const { error } = await supabase.rpc(rpc, { home_id_param: modal.homeId });
        if (error) throw error;
        if (currentHomeId === modal.homeId) {
          await supabase.from("user_profiles").update({ home_id: null }).eq("uid", userId);
        }
        Logger.success(
          `Successfully ${modal.type === "delete" ? "deleted" : "left"} ${modal.homeName}`,
        );
      }
      setModal({ open: false });
      await fetchHomes();
      onHomeChanged();
    } catch (err: any) {
      Logger.error("Home action failed", err, {}, err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: Role) => {
    const { error } = await supabase
      .from("home_members")
      .update({ role: newRole, permissions: {} })
      .eq("id", memberId);
    if (error) { Logger.error("Failed to update role", error); return; }
    await fetchHomes();
  };

  const updateMemberPermission = (
    memberId: string,
    currentPerms: Record<string, boolean>,
    key: PermissionKey,
    value: boolean,
    role: Role,
  ) => {
    const roleDefaults = ROLE_DEFAULTS[role];
    const newPerms = { ...currentPerms, [key]: value };
    // If the value matches the role default, remove the override to keep JSONB clean
    if (roleDefaults[key] === value) delete newPerms[key];

    // Optimistic update in local state
    setHomes((prev) => prev.map((home) => ({
      ...home,
      members: home.members.map((m) =>
        m.memberId === memberId ? { ...m, permissions: newPerms } : m
      ),
    })));

    // Debounced save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from("home_members")
        .update({ permissions: newPerms })
        .eq("id", memberId);
      if (error) Logger.error("Failed to save permission", error);
    }, 500);
  };

  const updateMemberAuditAccess = async (userId: string, access: boolean) => {
    setHomes((prev) => prev.map((home) => ({
      ...home,
      members: home.members.map((m) =>
        m.userId === userId ? { ...m, canViewAudit: access } : m
      ),
    })));
    await supabase.rpc("set_member_audit_access", { target_user_id: userId, access });
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinId.trim();
    if (!trimmed) return;
    setJoinError(null);
    setIsJoining(true);
    try {
      const { error: joinErr } = await supabase
        .from("home_members")
        .insert([{ home_id: trimmed, user_id: userId, role: "member" }]);
      if (joinErr) throw new Error("Invalid Home ID or you are already a member.");
      await supabase.from("user_profiles").update({ home_id: trimmed }).eq("uid", userId);
      setJoinId("");
      Logger.success("Successfully joined the home!");
      await fetchHomes();
      onSwitchHome(trimmed);
      onHomeChanged();
    } catch (err: any) {
      setJoinError(err.message || "Could not join this home.");
    } finally {
      setIsJoining(false);
    }
  };

  const initials = (member: HomeMember) => {
    const name = member.displayName || member.email || "?";
    return name.slice(0, 1).toUpperCase();
  };

  const isManagerOfHome = (home: HomeWithRole) =>
    home.role === "owner" || home.role === "admin";

  const modalTitle = () => {
    if (!modal.open) return "";
    if (modal.type === "delete") return "Delete Home";
    if (modal.type === "leave") return "Leave Home";
    return "Remove Member";
  };

  const modalDesc = () => {
    if (!modal.open) return "";
    if (modal.type === "delete")
      return `Are you absolutely sure you want to permanently delete "${modal.homeName}"? This will erase all locations, areas, and plant data. This cannot be undone.`;
    if (modal.type === "leave")
      return `Are you sure you want to leave "${modal.homeName}"? You'll lose access until an owner invites you back.`;
    return `Remove ${(modal as any).memberName} from "${modal.homeName}"? They will lose access to this home.`;
  };

  const fieldClass = "w-full px-3 py-2 bg-rhozly-surface border border-rhozly-outline/20 rounded-xl text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors";
  const readonlyClass = "w-full px-3 py-2 bg-rhozly-surface/50 border border-rhozly-outline/10 rounded-xl text-sm font-bold text-rhozly-on-surface/60 cursor-default";
  const labelClass = "block text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1";

  const countryName = (code: string | null) =>
    COUNTRIES.find((c) => c.code === code)?.name ?? code ?? "—";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-rhozly-on-surface tracking-tight">
            Home Management
          </h1>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-0.5">
            Manage and switch between your homes
          </p>
        </div>
        <button
          data-testid="home-mgmt-add-btn"
          onClick={onAddNewHome}
          className="flex items-center gap-2 px-4 py-2.5 bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-rhozly-primary/90 transition-colors shadow-sm"
        >
          <Plus size={14} />
          New Home
        </button>
      </div>

      {/* Homes list */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-rhozly-on-surface/30">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : homes.length === 0 ? (
          <div className="text-center py-12 bg-rhozly-surface border border-rhozly-outline/20 rounded-3xl">
            <Building2 size={28} className="mx-auto mb-3 text-rhozly-on-surface/20" />
            <p className="text-sm font-bold text-rhozly-on-surface/40">
              No homes yet. Create or join one.
            </p>
          </div>
        ) : (
          homes.map((home) => {
            const isEditing = !!editingForms[home.id];
            const form = editingForms[home.id];

            return (
              <div
                key={home.id}
                data-testid={`home-mgmt-card-${home.id}`}
                className={`bg-white border rounded-3xl p-5 space-y-4 transition-shadow hover:shadow-md ${
                  home.id === currentHomeId
                    ? "border-rhozly-primary/30 shadow-sm"
                    : "border-rhozly-outline/20"
                }`}
              >
                {/* Home header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${home.id === currentHomeId ? "bg-rhozly-primary" : "bg-rhozly-on-surface/20"}`} />
                    <div className="min-w-0">
                      <p className="font-black text-rhozly-on-surface truncate">{home.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${home.role === "owner" ? "bg-rhozly-primary/10 text-rhozly-primary" : "bg-rhozly-surface text-rhozly-on-surface/50"}`}>
                      {home.role}
                    </span>
                    {home.id !== currentHomeId ? (
                      <button
                        data-testid={`home-mgmt-switch-${home.id}`}
                        onClick={() => onSwitchHome(home.id)}
                        className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-rhozly-surface text-rhozly-on-surface/60 hover:bg-rhozly-primary/10 hover:text-rhozly-primary transition-colors"
                      >
                        Switch
                      </button>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600">
                        Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Tab bar */}
                <div className="flex bg-rhozly-surface-low p-1 rounded-2xl gap-1">
                  {(["settings", "insights", "members"] as const).map((t) => (
                    <button
                      key={t}
                      data-testid={`home-mgmt-tab-${t}-${home.id}`}
                      onClick={() => setTab(home.id, t)}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors ${
                        getTab(home.id) === t
                          ? "bg-white text-rhozly-primary shadow-sm"
                          : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
                      }`}
                    >
                      {t === "settings" ? "Settings" : t === "insights" ? "Location" : "Members"}
                    </button>
                  ))}
                </div>

                {/* Settings tab */}
                {getTab(home.id) === "settings" && (<>

                {/* Home details — editable for owners, read-only for members */}
                <div className="bg-rhozly-surface/40 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
                      Home Details
                    </p>
                    {home.role === "owner" && !isEditing && (
                      <button
                        data-testid={`home-mgmt-edit-${home.id}`}
                        onClick={() => startEdit(home)}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:text-rhozly-primary/70 transition-colors"
                      >
                        <Pencil size={11} />
                        Edit
                      </button>
                    )}
                    {isEditing && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => cancelEdit(home.id)}
                          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-on-surface transition-colors"
                        >
                          <X size={11} />
                          Cancel
                        </button>
                        <button
                          data-testid={`home-mgmt-save-${home.id}`}
                          onClick={() => saveEdit(home.id)}
                          disabled={savingHomeId === home.id}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {savingHomeId === home.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Save size={11} />}
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Home Name */}
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Home Name</label>
                      {isEditing && form ? (
                        <input
                          data-testid={`home-mgmt-field-name-${home.id}`}
                          type="text"
                          value={form.name}
                          onChange={(e) => updateField(home.id, "name", e.target.value)}
                          className={fieldClass}
                        />
                      ) : (
                        <div className={readonlyClass}>{home.name}</div>
                      )}
                    </div>

                    {/* Postcode */}
                    <div>
                      <label className={labelClass}>Postcode / Zip</label>
                      {isEditing && form ? (
                        <input
                          data-testid={`home-mgmt-field-address-${home.id}`}
                          type="text"
                          value={form.address}
                          onChange={(e) => updateField(home.id, "address", e.target.value.toUpperCase())}
                          className={fieldClass + " uppercase"}
                          placeholder="e.g. CR3 5ED"
                        />
                      ) : (
                        <div className={readonlyClass}>{home.address || "—"}</div>
                      )}
                    </div>

                    {/* Country */}
                    <div>
                      <label className={labelClass}>Country</label>
                      {isEditing && form ? (
                        <select
                          data-testid={`home-mgmt-field-country-${home.id}`}
                          value={form.country}
                          onChange={(e) => updateField(home.id, "country", e.target.value)}
                          className={fieldClass}
                        >
                          <option value="">— Select —</option>
                          {COUNTRIES.map((c) => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <div className={readonlyClass}>{countryName(home.country)}</div>
                      )}
                    </div>

                    {/* Timezone */}
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Timezone</label>
                      {isEditing && form ? (
                        <select
                          data-testid={`home-mgmt-field-timezone-${home.id}`}
                          value={form.timezone}
                          onChange={(e) => updateField(home.id, "timezone", e.target.value)}
                          className={fieldClass}
                        >
                          {ALL_TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      ) : (
                        <div className={readonlyClass}>
                          {home.timezone?.replace(/_/g, " ") || "—"}
                        </div>
                      )}
                    </div>

                    {/* USDA Hardiness Zone — always read-only, derived from lat/lng */}
                    <div className="sm:col-span-2">
                      <label className={labelClass}>USDA Hardiness Zone</label>
                      <div className="flex items-center gap-2">
                        {recalculatingZones.has(home.id) ? (
                          <div className={readonlyClass + " flex items-center gap-2"}>
                            <Loader2 size={13} className="animate-spin text-rhozly-primary/60 shrink-0" />
                            <span className="text-rhozly-on-surface/40">Calculating…</span>
                          </div>
                        ) : home.hardiness_zone != null ? (
                          <div
                            data-testid={`home-mgmt-hardiness-zone-${home.id}`}
                            className="flex items-center gap-3 w-full px-3 py-2 bg-rhozly-primary/5 border border-rhozly-primary/20 rounded-xl"
                          >
                            <span className="text-xl font-black text-rhozly-primary leading-none">
                              {home.hardiness_zone}
                            </span>
                            <div>
                              <p className="text-xs font-black text-rhozly-on-surface">
                                Zone {home.hardiness_zone}
                              </p>
                              <p className="text-[10px] font-bold text-rhozly-on-surface/50">
                                Based on 10-year average annual minimum temperature
                              </p>
                            </div>
                            <button
                              data-testid={`home-mgmt-recalc-zone-${home.id}`}
                              onClick={() => recalculateZone(home)}
                              title="Recalculate zone"
                              className="ml-auto p-1.5 rounded-lg hover:bg-rhozly-primary/10 text-rhozly-on-surface/30 hover:text-rhozly-primary transition-colors"
                            >
                              <Loader2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className={readonlyClass + " flex items-center justify-between"}>
                            <span className="text-rhozly-on-surface/40">
                              {home.lat && home.lng ? "Calculating…" : "Location not geocoded yet"}
                            </span>
                            {home.lat && home.lng && (
                              <button
                                data-testid={`home-mgmt-recalc-zone-${home.id}`}
                                onClick={() => recalculateZone(home)}
                                className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:text-rhozly-primary/70 transition-colors ml-2"
                              >
                                Calculate
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rain advice thresholds (Mobile Quick Access Wave 3) */}
                    <div className="sm:col-span-2 pt-2 border-t border-rhozly-outline/10">
                      <label className={labelClass}>Rain advice thresholds</label>
                      <p className="text-[11px] text-rhozly-on-surface/45 mb-3 leading-snug">
                        Used by the Quick Access calendar to decide whether to suggest skipping today's watering.
                      </p>

                      {editingRain[home.id] ? (
                        <div
                          data-testid={`home-mgmt-rain-edit-${home.id}`}
                          className="space-y-3"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1 block">
                                Skip-watering ≥ (mm)
                              </label>
                              <input
                                data-testid={`home-mgmt-rain-skip-${home.id}`}
                                type="number"
                                inputMode="decimal"
                                step="0.5"
                                min="0"
                                value={editingRain[home.id].rain_skip_mm}
                                onChange={(e) =>
                                  setEditingRain((prev) => ({
                                    ...prev,
                                    [home.id]: { ...prev[home.id], rain_skip_mm: e.target.value },
                                  }))
                                }
                                className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1 block">
                                Water-today &lt; (mm)
                              </label>
                              <input
                                data-testid={`home-mgmt-rain-water-${home.id}`}
                                type="number"
                                inputMode="decimal"
                                step="0.5"
                                min="0"
                                value={editingRain[home.id].rain_water_mm}
                                onChange={(e) =>
                                  setEditingRain((prev) => ({
                                    ...prev,
                                    [home.id]: { ...prev[home.id], rain_water_mm: e.target.value },
                                  }))
                                }
                                className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary"
                              />
                            </div>
                          </div>
                          {rainErrorByHome[home.id] && (
                            <p
                              data-testid={`home-mgmt-rain-error-${home.id}`}
                              className="text-xs font-bold text-red-600"
                            >
                              {rainErrorByHome[home.id]}
                            </p>
                          )}
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              data-testid={`home-mgmt-rain-cancel-${home.id}`}
                              onClick={() => cancelEditingRain(home.id)}
                              className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 hover:text-rhozly-on-surface px-3 py-2 min-h-[36px] transition"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              data-testid={`home-mgmt-rain-save-${home.id}`}
                              onClick={() => saveRainConfig(home.id)}
                              disabled={rainSavingHomeId === home.id}
                              className="px-4 py-2 min-h-[36px] rounded-xl bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition"
                            >
                              {rainSavingHomeId === home.id ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-100">
                              <div className="text-[10px] font-black uppercase tracking-widest text-sky-700 mb-0.5">
                                Skip ≥
                              </div>
                              <p
                                data-testid={`home-mgmt-rain-skip-display-${home.id}`}
                                className="text-sm font-black text-rhozly-on-surface"
                              >
                                {rainConfigFor(home.id).rain_skip_mm} mm
                              </p>
                            </div>
                            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
                              <div className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-0.5">
                                Water &lt;
                              </div>
                              <p
                                data-testid={`home-mgmt-rain-water-display-${home.id}`}
                                className="text-sm font-black text-rhozly-on-surface"
                              >
                                {rainConfigFor(home.id).rain_water_mm} mm
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={`home-mgmt-rain-edit-btn-${home.id}`}
                            onClick={() => startEditingRain(home.id)}
                            className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:opacity-80 px-2 py-1 transition"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Invite ID — owners only */}
                {home.role === "owner" && (
                  <div className="flex items-center gap-2 bg-rhozly-surface rounded-2xl px-4 py-2.5">
                    <UserPlus size={13} className="text-rhozly-on-surface/30 shrink-0" />
                    <p className="flex-1 text-xs font-mono text-rhozly-on-surface/50 truncate">{home.id}</p>
                    <button
                      data-testid={`home-mgmt-copy-${home.id}`}
                      onClick={() => copyId(home.id)}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:text-rhozly-primary/70 transition-colors shrink-0"
                    >
                      {copiedId === home.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {copiedId === home.id ? "Copied!" : "Copy ID"}
                    </button>
                  </div>
                )}

                </>)}

                {/* Location Insights tab */}
                {getTab(home.id) === "insights" && (
                  <HomeLocationInsights home={home} />
                )}

                {/* Members tab */}
                {getTab(home.id) === "members" && home.members.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                      <Users size={11} />
                      Members ({home.members.length})
                    </p>
                    {home.members.map((member) => {
                      const isMe = member.userId === userId;
                      const canManage = isManagerOfHome(home) && !isMe && member.role !== "owner";
                      const isConfigOpen = openConfigMemberId === member.memberId;
                      const resolved = resolvePermissions(member.role, member.permissions as any);

                      return (
                        <div key={member.userId} data-testid={`home-mgmt-member-${member.userId}`}>
                          {/* Member row */}
                          <div className="flex items-start gap-3 px-3 py-2 rounded-2xl hover:bg-rhozly-surface transition-colors">
                            <div className="w-8 h-8 rounded-full bg-rhozly-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs font-black text-rhozly-primary">{initials(member)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              {/* Name */}
                              <p className="text-xs font-black text-rhozly-on-surface break-words">
                                {member.displayName || member.email}
                                {isMe && <span className="ml-1.5 text-[9px] font-black text-rhozly-on-surface/30">(you)</span>}
                              </p>
                              {/* Email (only when display name is set) */}
                              {member.displayName && (
                                <p className="text-[10px] font-bold text-rhozly-on-surface/40 break-all">{member.email}</p>
                              )}
                              {/* Role + actions row */}
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {canManage ? (
                                  <select
                                    data-testid={`home-mgmt-role-${member.userId}`}
                                    value={member.role}
                                    onChange={(e) => updateMemberRole(member.memberId, e.target.value as Role)}
                                    className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-rhozly-surface border border-rhozly-outline/20 text-rhozly-on-surface/60 outline-none cursor-pointer"
                                  >
                                    <option value="admin">Admin</option>
                                    <option value="member">Member</option>
                                    <option value="viewer">Viewer</option>
                                  </select>
                                ) : (
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${member.role === "owner" ? "bg-rhozly-primary/10 text-rhozly-primary" : member.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-rhozly-surface text-rhozly-on-surface/40"}`}>
                                    {member.role}
                                  </span>
                                )}
                                {canManage && (
                                  <button
                                    data-testid={`home-mgmt-configure-${member.userId}`}
                                    onClick={() => setOpenConfigMemberId(isConfigOpen ? null : member.memberId)}
                                    className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-xl transition-colors ${isConfigOpen ? "bg-rhozly-primary/10 text-rhozly-primary" : "text-rhozly-on-surface/40 hover:bg-rhozly-surface"}`}
                                  >
                                    <Settings2 size={11} />
                                    <ChevronDown size={10} className={`transition-transform ${isConfigOpen ? "rotate-180" : ""}`} />
                                  </button>
                                )}
                                {canManage && (
                                  <button
                                    data-testid={`home-mgmt-remove-member-${member.userId}`}
                                    onClick={() => setModal({
                                      open: true, type: "remove_member",
                                      homeId: home.id, homeName: home.name,
                                      memberId: member.userId,
                                      memberName: member.displayName || member.email,
                                    })}
                                    className="flex items-center justify-center w-7 h-7 rounded-xl text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 transition-all"
                                    title="Remove member"
                                  >
                                    <UserX size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Permission accordion */}
                          {isConfigOpen && canManage && (
                            <div className="ml-11 mt-1 mb-2 bg-rhozly-surface/60 border border-rhozly-outline/15 rounded-2xl p-3 space-y-3">
                              {/* Role-template description + reset-to-defaults */}
                              <div className="flex items-start justify-between gap-3 px-2.5 py-2 bg-rhozly-primary/5 rounded-xl border border-rhozly-primary/15">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest">
                                    {member.role === "admin"
                                      ? "Admin — full access (recommended for a co-owner)"
                                      : member.role === "member"
                                        ? "Member — can add/edit, no destructive deletes (good for family / housemates)"
                                        : member.role === "viewer"
                                          ? "Viewer — read-only + personal tasks (good for a one-time helper)"
                                          : "Owner — full access (this is the home creator)"}
                                  </p>
                                  <p className="text-[9px] font-medium text-rhozly-on-surface/50 mt-0.5 leading-snug">
                                    Toggles below override the role's defaults. Reset wipes overrides.
                                  </p>
                                </div>
                                {Object.keys(member.permissions).length > 0 && (
                                  <button
                                    data-testid={`perm-reset-defaults-${member.userId}`}
                                    onClick={async () => {
                                      // Optimistic + persist
                                      setHomes((prev) => prev.map((h) => ({
                                        ...h,
                                        members: h.members.map((m) =>
                                          m.memberId === member.memberId ? { ...m, permissions: {} } : m
                                        ),
                                      })));
                                      await supabase
                                        .from("home_members")
                                        .update({ permissions: {} })
                                        .eq("id", member.memberId);
                                    }}
                                    className="shrink-0 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:bg-rhozly-primary/10 px-2 py-1.5 rounded-lg transition-colors"
                                    title="Discard all custom overrides and use the role's defaults"
                                  >
                                    Reset to {member.role}
                                  </button>
                                )}
                              </div>
                              {/* Audit page access toggle */}
                              <div className="flex items-center justify-between px-2.5 py-2 bg-rhozly-surface rounded-xl border border-rhozly-outline/10">
                                <div>
                                  <p className="text-[10px] font-black text-rhozly-on-surface">Audit Page Access</p>
                                  <p className="text-[9px] font-medium text-rhozly-on-surface/40">Can navigate to /audit</p>
                                </div>
                                <button
                                  data-testid={`perm-toggle-${member.userId}-audit-access`}
                                  onClick={() => updateMemberAuditAccess(member.userId, !member.canViewAudit)}
                                  className={`relative w-8 h-4.5 rounded-full transition-colors flex items-center px-0.5 ${member.canViewAudit ? "bg-emerald-500" : "bg-rhozly-outline/30"}`}
                                >
                                  <span className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${member.canViewAudit ? "translate-x-3.5" : "translate-x-0"}`} />
                                </button>
                              </div>
                              {PERMISSION_GROUPS.map((group) => (
                                <div key={group.label}>
                                  <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/30 mb-1.5">{group.label}</p>
                                  <div className="flex flex-wrap gap-2">
                                    {group.keys.map(({ key, label }) => {
                                      const checked = resolved[key];
                                      return (
                                        <button
                                          key={key}
                                          data-testid={`perm-toggle-${member.userId}-${key}`}
                                          onClick={() => updateMemberPermission(member.memberId, member.permissions, key, !checked, member.role)}
                                          className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${checked ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-rhozly-outline/20 text-rhozly-on-surface/40"}`}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${checked ? "bg-emerald-500" : "bg-rhozly-on-surface/20"}`} />
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* UX review 2026-06-15 item 5.1 — Invite by email
                    (owners only, inside the Members tab). Replaces the
                    old copy-paste-the-UUID flow. The Join Home card
                    below the home list is still available as a fallback
                    for legacy invites. */}
                {getTab(home.id) === "members" && home.role === "owner" && (
                  <InviteByEmailForm homeId={home.id} homeName={home.name} />
                )}

                {/* Danger zone */}
                <div className="flex items-center gap-2 pt-1 border-t border-rhozly-outline/10">
                  <button
                    data-testid={`home-mgmt-leave-${home.id}`}
                    onClick={() => setModal({ open: true, type: "leave", homeId: home.id, homeName: home.name })}
                    className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/40 hover:text-red-500 transition-colors px-3 py-2 rounded-xl hover:bg-red-50"
                  >
                    <LogOut size={13} />
                    Leave
                  </button>
                  {home.role === "owner" && (
                    <button
                      data-testid={`home-mgmt-delete-${home.id}`}
                      onClick={() => setModal({ open: true, type: "delete", homeId: home.id, homeName: home.name })}
                      className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/40 hover:text-red-500 transition-colors px-3 py-2 rounded-xl hover:bg-red-50"
                    >
                      <Trash2 size={13} />
                      Delete Home
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Join a home */}
      <div className="bg-white border border-rhozly-outline/20 rounded-3xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-rhozly-primary/10 rounded-xl flex items-center justify-center">
            <Key size={15} className="text-rhozly-primary" />
          </div>
          <div>
            <p className="font-black text-rhozly-on-surface text-sm">Join a Home</p>
            <p className="text-xs font-bold text-rhozly-on-surface/40">
              Enter a Home ID shared by the owner
            </p>
          </div>
        </div>
        <form onSubmit={handleJoin} className="space-y-3">
          {joinError && (
            <p className="text-xs font-bold text-red-600 bg-red-50 px-3 py-2 rounded-xl">
              {joinError}
            </p>
          )}
          <input
            data-testid="home-mgmt-join-input"
            type="text"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Paste Home ID here…"
            className="w-full px-4 py-3 bg-rhozly-surface border border-rhozly-outline/20 rounded-2xl text-sm font-mono font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary transition-colors"
          />
          <button
            data-testid="home-mgmt-join-btn"
            type="submit"
            disabled={!joinId.trim() || isJoining}
            className="w-full flex items-center justify-center gap-2 py-3 bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-rhozly-primary/90 transition-colors disabled:opacity-40"
          >
            {isJoining ? <Loader2 size={14} className="animate-spin" /> : "Join Home"}
          </button>
        </form>
      </div>

      <ConfirmModal
        isOpen={modal.open}
        isLoading={isProcessing}
        onClose={() => setModal({ open: false })}
        onConfirm={handleConfirm}
        title={modalTitle()}
        description={modalDesc()}
        confirmText={modal.open && modal.type === "remove_member" ? "Remove Member" : modal.open && modal.type === "delete" ? "Delete Home" : "Leave Home"}
        isDestructive
      />
    </div>
  );
}

// UX review 2026-06-15 item 5.1 — Owner-only invite-by-email form.
// Lives at the bottom of the Members tab. Calls create-home-invite
// edge function; the function inserts a row in home_invite_tokens and
// sends the email via Resend.
type InviteState =
  | { kind: "idle" }
  | { kind: "sending" }
  | {
      kind: "sent";
      invitee: string;
      inviteUrl: string;
      expiresAt: string;
      resentExisting: boolean;
    }
  | { kind: "error"; message: string };

const INVITE_ERROR_COPY: Record<string, string> = {
  invalid_email: "That doesn't look like a valid email.",
  invalid_role: "We can't send an invite with that role.",
  not_owner: "Only the home owner can send invites.",
  already_member: "That person is already a member of this garden.",
  rate_limited: "Too many invites today — try again tomorrow.",
};

function InviteByEmailForm({ homeId, homeName }: { homeId: string; homeName: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [state, setState] = useState<InviteState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const send = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setState({ kind: "sending" });
    try {
      const appOrigin = typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.host}`
        : null;
      const { data, error } = await supabase.functions.invoke("create-home-invite", {
        body: { homeId, email: trimmed, role, appOrigin },
      });
      if (error) {
        // supabase-js wraps non-2xx in `error`; the JSON body is in
        // error.context.json() but harder to read consistently. Fall
        // back to a generic copy.
        setState({ kind: "error", message: error.message ?? "Something went wrong sending the invite." });
        return;
      }
      if (data?.error) {
        const friendly = INVITE_ERROR_COPY[data.error] ?? data.message ?? data.error;
        setState({ kind: "error", message: friendly });
        return;
      }
      setState({
        kind: "sent",
        invitee: data.invitee,
        inviteUrl: data.inviteUrl,
        expiresAt: data.expiresAt,
        resentExisting: !!data.resentExisting,
      });
      logEvent(EVENT.INVITE_SENT, { home_id: homeId, role, resentExisting: !!data.resentExisting });
      setEmail("");
    } catch (err: any) {
      Logger.error("create-home-invite failed", err, { homeId, email: trimmed });
      setState({ kind: "error", message: err?.message ?? "Network error — try again." });
    }
  };

  const copyInviteUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy automatically — long-press the link to copy.");
    }
  };

  return (
    <div
      data-testid={`invite-by-email-${homeId}`}
      className="bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-4 mt-3"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Mail size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-rhozly-on-surface">Invite by email</p>
          <p className="text-[11px] font-bold text-rhozly-on-surface/55 leading-snug">
            Send a one-tap join link to a co-gardener. Expires after 7 days.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          data-testid={`invite-email-input-${homeId}`}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state.kind === "error" || state.kind === "sent") setState({ kind: "idle" });
          }}
          placeholder="cogardener@example.com"
          autoComplete="email"
          disabled={state.kind === "sending"}
          className="flex-1 px-4 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
        />
        <select
          data-testid={`invite-role-select-${homeId}`}
          value={role}
          onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
          disabled={state.kind === "sending"}
          className="px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-xs font-black uppercase tracking-widest text-rhozly-on-surface outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          data-testid={`invite-send-${homeId}`}
          type="button"
          onClick={send}
          disabled={state.kind === "sending" || !email.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 transition-colors"
        >
          {state.kind === "sending" ? (
            <><Loader2 size={13} className="animate-spin" /> Sending</>
          ) : (
            <>Send</>
          )}
        </button>
      </div>

      {state.kind === "sent" && (
        <div
          data-testid={`invite-sent-${homeId}`}
          className="mt-3 bg-white border border-emerald-200 rounded-xl p-3 flex flex-col gap-2"
        >
          <p className="text-xs font-bold text-emerald-900 leading-snug">
            <Check size={12} className="inline mr-1" />
            {state.resentExisting
              ? `Resent the existing pending invite to ${state.invitee}.`
              : `Invite sent to ${state.invitee} — they'll receive an email shortly.`}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[10px] font-mono font-bold text-rhozly-on-surface/65 bg-rhozly-surface-low rounded-lg px-2 py-1 truncate">
              {state.inviteUrl}
            </code>
            <button
              data-testid={`invite-copy-${homeId}`}
              onClick={() => copyInviteUrl(state.inviteUrl)}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-lg bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div
          data-testid={`invite-error-${homeId}`}
          className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs font-bold text-red-700"
        >
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <p className="leading-snug">{state.message}</p>
        </div>
      )}

      <p className="text-[10px] font-bold text-rhozly-on-surface/35 mt-2 leading-snug">
        Editors can add and change plants, tasks, and notes; viewers can read but not edit.
        Garden: <span className="text-rhozly-on-surface/55">{homeName}</span>.
      </p>
    </div>
  );
}

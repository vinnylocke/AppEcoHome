import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { ConfirmModal } from "./ConfirmModal";

interface HomeWithRole {
  id: string;
  name: string;
  role: "owner" | "member";
  country: string | null;
  timezone: string | null;
}

interface Props {
  currentHomeId: string;
  userId: string;
  onSwitchHome: (homeId: string) => void;
  onAddNewHome: () => void;
  onHomeChanged: () => void;
}

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

  const [modal, setModal] = useState<{
    open: boolean;
    type: "leave" | "delete" | null;
    homeId: string | null;
    homeName: string;
  }>({ open: false, type: null, homeId: null, homeName: "" });
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchHomes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("home_members")
      .select("role, homes ( id, name, country, timezone )")
      .eq("user_id", userId);
    if (!error && data) {
      setHomes(
        data
          .filter((r) => r.homes)
          .map((r: any) => ({ ...r.homes, role: r.role })),
      );
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchHomes(); }, [fetchHomes]);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    Logger.success("Home ID copied to clipboard!");
  };

  const handleConfirm = async () => {
    if (!modal.homeId || !modal.type) return;
    setIsProcessing(true);
    try {
      const rpc = modal.type === "delete" ? "delete_home_entirely" : "leave_home";
      const { error } = await supabase.rpc(rpc, { home_id_param: modal.homeId });
      if (error) throw error;

      if (currentHomeId === modal.homeId) {
        await supabase
          .from("user_profiles")
          .update({ home_id: null })
          .eq("uid", userId);
      }

      Logger.success(
        `Successfully ${modal.type === "delete" ? "deleted" : "left"} ${modal.homeName}`,
      );
      setModal({ open: false, type: null, homeId: null, homeName: "" });
      await fetchHomes();
      onHomeChanged();
    } catch (err: any) {
      Logger.error(`Failed to ${modal.type} home`, err, {}, err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinId.trim();
    if (!trimmed) return;
    setJoinError(null);
    setIsJoining(true);
    try {
      const { error: joinErr } = await supabase.from("home_members").insert([
        { home_id: trimmed, user_id: userId, role: "member" },
      ]);
      if (joinErr) throw new Error("Invalid Home ID or you are already a member.");

      await supabase
        .from("user_profiles")
        .update({ home_id: trimmed })
        .eq("uid", userId);

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

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
      <div className="space-y-3">
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
          homes.map((home) => (
            <div
              key={home.id}
              data-testid={`home-mgmt-card-${home.id}`}
              className={`bg-white border rounded-3xl p-5 space-y-4 transition-shadow hover:shadow-md ${
                home.id === currentHomeId
                  ? "border-rhozly-primary/30 shadow-sm"
                  : "border-rhozly-outline/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      home.id === currentHomeId
                        ? "bg-rhozly-primary"
                        : "bg-rhozly-on-surface/20"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="font-black text-rhozly-on-surface truncate">
                      {home.name}
                    </p>
                    {(home.country || home.timezone) && (
                      <p className="text-xs font-bold text-rhozly-on-surface/40 truncate">
                        {[home.country, home.timezone?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                      home.role === "owner"
                        ? "bg-rhozly-primary/10 text-rhozly-primary"
                        : "bg-rhozly-surface text-rhozly-on-surface/50"
                    }`}
                  >
                    {home.role}
                  </span>
                  {home.id !== currentHomeId && (
                    <button
                      data-testid={`home-mgmt-switch-${home.id}`}
                      onClick={() => onSwitchHome(home.id)}
                      className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-rhozly-surface text-rhozly-on-surface/60 hover:bg-rhozly-primary/10 hover:text-rhozly-primary transition-colors"
                    >
                      Switch
                    </button>
                  )}
                  {home.id === currentHomeId && (
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600">
                      Active
                    </span>
                  )}
                </div>
              </div>

              {/* Invite ID row — owners only */}
              {home.role === "owner" && (
                <div className="flex items-center gap-2 bg-rhozly-surface rounded-2xl px-4 py-2.5">
                  <UserPlus size={13} className="text-rhozly-on-surface/30 shrink-0" />
                  <p className="flex-1 text-xs font-mono text-rhozly-on-surface/50 truncate">
                    {home.id}
                  </p>
                  <button
                    data-testid={`home-mgmt-copy-${home.id}`}
                    onClick={() => copyId(home.id)}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-primary hover:text-rhozly-primary/70 transition-colors shrink-0"
                  >
                    {copiedId === home.id ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <Copy size={12} />
                    )}
                    {copiedId === home.id ? "Copied!" : "Copy ID"}
                  </button>
                </div>
              )}

              {/* Danger zone */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  data-testid={`home-mgmt-leave-${home.id}`}
                  onClick={() =>
                    setModal({ open: true, type: "leave", homeId: home.id, homeName: home.name })
                  }
                  className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/40 hover:text-red-500 transition-colors px-3 py-2 rounded-xl hover:bg-red-50"
                >
                  <LogOut size={13} />
                  Leave
                </button>
                {home.role === "owner" && (
                  <button
                    data-testid={`home-mgmt-delete-${home.id}`}
                    onClick={() =>
                      setModal({ open: true, type: "delete", homeId: home.id, homeName: home.name })
                    }
                    className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/40 hover:text-red-500 transition-colors px-3 py-2 rounded-xl hover:bg-red-50"
                  >
                    <Trash2 size={13} />
                    Delete Home
                  </button>
                )}
              </div>
            </div>
          ))
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
        onClose={() => setModal({ ...modal, open: false })}
        onConfirm={handleConfirm}
        title={modal.type === "delete" ? "Delete Home" : "Leave Home"}
        description={
          modal.type === "delete"
            ? `Are you absolutely sure you want to permanently delete "${modal.homeName}"? This will erase all locations, areas, and plant data. This cannot be undone.`
            : `Are you sure you want to leave "${modal.homeName}"? You'll lose access until an owner invites you back.`
        }
        confirmText={modal.type === "delete" ? "Delete Home" : "Leave Home"}
        isDestructive
      />
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { Sprout, Leaf, Check, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { notifyPersonaChanged } from "../hooks/usePersona";
import type { UserProfile } from "../types";

type Persona = UserProfile["persona"];

interface Props {
  userId: string;
}

/**
 * "Detail level" — lets the user change how much guidance Rhozly shows.
 * Stored as the `persona` column ("new" | "experienced") on user_profiles,
 * captured originally in the WelcomeModal's persona slide; this surface is the
 * escape hatch to change it later.
 *
 * The value is read live via usePersona to bias presentation only: inline-tip /
 * tooltip density (InfoTooltip dims for "experienced"), AI copy tone,
 * isNewGardener framing, and the default home posture (porch vs workbench). It
 * does NOT gate, filter, or unlock any feature. Reads + writes `persona` directly.
 */
export default function PersonaSetting({ userId }: Props) {
  const [persona, setPersona] = useState<Persona>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("persona")
          .eq("uid", userId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setPersona((data?.persona as Persona) ?? null);
      } catch (err) {
        if (!cancelled) Logger.error("PersonaSetting load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const save = useCallback(async (next: Persona) => {
    if (next === persona) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ persona: next })
        .eq("uid", userId);
      if (error) throw error;
      setPersona(next);
      // Propagate to every usePersona consumer live (home posture, quick-pin
      // defaults, copy density) — without this, flips only applied on reload.
      notifyPersonaChanged(next);
      toast.success(
        next === "new"
          ? "More guidance on — extra tips + plainer copy."
          : next === "experienced"
            ? "Less clutter on — terser copy + fewer tooltips."
            : "Cleared your detail level.",
      );
    } catch (err) {
      Logger.error("PersonaSetting save failed", err);
      toast.error("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }, [persona, userId]);

  return (
    <section
      data-testid="persona-setting"
      className="bg-white rounded-3xl border border-rhozly-outline/10 p-5 sm:p-6"
    >
      <h3 className="font-black text-base text-rhozly-on-surface mb-1">
        Detail level
      </h3>
      <p className="text-xs text-rhozly-on-surface/55 leading-snug mb-4">
        How much guidance you want. This changes how many inline tips and
        tooltips you see, the tone of AI replies, and your default home layout —
        it doesn't lock or unlock any features.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-rhozly-on-surface/55 py-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <PersonaOption
            value="new"
            active={persona === "new"}
            disabled={saving}
            onSelect={() => save("new")}
            icon={<Sprout size={18} />}
            title="More guidance"
            subtitle="Extra tips, plainer language, friendly nudges — best if you're newer to gardening"
          />
          <PersonaOption
            value="experienced"
            active={persona === "experienced"}
            disabled={saving}
            onSelect={() => save("experienced")}
            icon={<Leaf size={18} />}
            title="Less clutter"
            subtitle="Terser copy, fewer tooltips, advanced shortcuts — best if you're experienced"
          />
        </div>
      )}
    </section>
  );
}

function PersonaOption({
  value,
  active,
  disabled,
  onSelect,
  icon,
  title,
  subtitle,
}: {
  value: "new" | "experienced";
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      data-testid={`persona-setting-${value}`}
      className={`relative p-4 rounded-2xl border-2 text-left transition-all min-h-[100px] ${
        active
          ? "bg-rhozly-primary/10 border-rhozly-primary shadow-sm"
          : "bg-white border-rhozly-outline/15 hover:border-rhozly-primary/30"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {active && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-rhozly-primary text-white flex items-center justify-center">
          <Check size={12} />
        </div>
      )}
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-2 ${
        active ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-primary"
      }`}>
        {icon}
      </div>
      <p className="font-black text-sm text-rhozly-on-surface leading-tight">{title}</p>
      <p className="text-[11px] text-rhozly-on-surface/55 leading-snug mt-1">{subtitle}</p>
    </button>
  );
}

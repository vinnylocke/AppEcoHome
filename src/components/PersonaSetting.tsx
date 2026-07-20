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
 * Lets the user change their self-declared gardening experience after
 * the initial welcome flow. Captured originally in the WelcomeModal's
 * persona slide; this surface gives them an escape hatch.
 *
 * Wire-up is intentionally minimal — reads + writes the `persona`
 * column on user_profiles directly. Future waves will read the value
 * to bias copy (more tooltips for "new", terser for "experienced").
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
          ? "Switched to friendly-tips mode."
          : next === "experienced"
            ? "Switched to expert mode."
            : "Cleared your experience level.",
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
        Gardening experience
      </h3>
      <p className="text-xs text-rhozly-on-surface/55 leading-snug mb-4">
        Tells Rhozly how much detail you want. We use this to decide when to
        explain things vs when to stay out of your way.
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
            title="New to gardening"
            subtitle="More tips, less jargon, friendly nudges"
          />
          <PersonaOption
            value="experienced"
            active={persona === "experienced"}
            disabled={saving}
            onSelect={() => save("experienced")}
            icon={<Leaf size={18} />}
            title="Experienced"
            subtitle="Terser copy, advanced shortcuts, fewer tooltips"
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

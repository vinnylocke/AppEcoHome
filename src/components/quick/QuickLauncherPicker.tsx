import React, { useState } from "react";
import toast from "react-hot-toast";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  RotateCcw,
  X as XIcon,
} from "lucide-react";
import { useQuickLauncherPins } from "../../hooks/useQuickLauncherPins";
import {
  partitionForPicker,
  QUICK_LAUNCHER_MAX,
  QUICK_LAUNCHER_MIN,
  type QuickLauncherAvailabilityCtx,
  type QuickLauncherDestination,
  type SubscriptionTier,
} from "../../lib/quickLauncherCatalogue";

interface Props {
  userId: string | null;
  homeId: string | null;
  subscriptionTier: SubscriptionTier | null;
  aiEnabled: boolean;
  isBeta: boolean;
}

/**
 * Settings UI for customising the Quick Launcher (the 2×2 / 2×3 tile
 * grid on `/quick`). Mounted inside the Account Settings tab of
 * `GardenerProfile`. Auto-saves on every change — no Save button.
 *
 * Layout:
 *   [Pinned (n of MAX)]
 *     ↑↓ [icon] Label    description    [✕]
 *   [Available]
 *     ➕ [icon] Label    description
 *   [Reset to defaults]
 */
export default function QuickLauncherPicker({
  userId,
  homeId,
  subscriptionTier,
  aiEnabled,
  isBeta,
}: Props) {
  const { pins, save, resetToDefaults } = useQuickLauncherPins(userId);
  const [savedFlash, setSavedFlash] = useState(false);

  const ctx: QuickLauncherAvailabilityCtx = {
    subscriptionTier,
    aiEnabled,
    isBeta,
    homeId,
  };
  const { pinned, available } = partitionForPicker(pins, ctx);
  const atMin = pinned.length <= QUICK_LAUNCHER_MIN;
  const atMax = pinned.length >= QUICK_LAUNCHER_MAX;

  const flashSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  };

  const persist = async (next: string[]) => {
    const { error } = await save(next);
    if (error) {
      toast.error("Couldn't sync your shortcuts — saved on this device only.");
    } else {
      flashSaved();
    }
  };

  const handleAdd = (id: string) => {
    if (atMax) return;
    const ids = pinned.map((d) => d.id);
    if (ids.includes(id)) return;
    persist([...ids, id]);
  };

  const handleRemove = (id: string) => {
    if (atMin) return;
    persist(pinned.map((d) => d.id).filter((x) => x !== id));
  };

  const handleMove = (id: string, direction: -1 | 1) => {
    const ids = pinned.map((d) => d.id);
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    const next = [...ids];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    persist(next);
  };

  const handleReset = async () => {
    const { error } = await resetToDefaults();
    if (error) {
      toast.error("Couldn't sync the reset — saved on this device only.");
    } else {
      flashSaved();
    }
  };

  return (
    <section
      data-testid="quick-launcher-picker"
      id="quick-launcher"
      className="bg-white rounded-3xl border border-rhozly-outline/15 p-5 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)]"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display font-black text-base text-rhozly-on-surface tracking-tight">
            Quick Launcher
          </h3>
          <p className="text-xs text-rhozly-on-surface/60 leading-snug mt-1">
            Pin up to {QUICK_LAUNCHER_MAX} shortcuts to your phone's Quick
            Access menu. Tap to add or remove, use the arrows to reorder.
          </p>
        </div>
        {savedFlash && (
          <span
            data-testid="quick-launcher-picker-saved"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-rhozly-primary"
          >
            <Check size={12} />
            Saved
          </span>
        )}
      </div>

      {/* Pinned list */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
            Pinned ({pinned.length} of {QUICK_LAUNCHER_MAX})
          </span>
        </div>
        <ul
          data-testid="quick-launcher-picker-pinned"
          className="flex flex-col gap-1.5"
        >
          {pinned.map((dest, idx) => (
            <PinnedRow
              key={dest.id}
              dest={dest}
              isFirst={idx === 0}
              isLast={idx === pinned.length - 1}
              canRemove={!atMin}
              onMoveUp={() => handleMove(dest.id, -1)}
              onMoveDown={() => handleMove(dest.id, 1)}
              onRemove={() => handleRemove(dest.id)}
            />
          ))}
        </ul>
      </div>

      {/* Available list */}
      {available.length > 0 && (
        <div className="mb-4">
          <span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
            Available
          </span>
          <ul
            data-testid="quick-launcher-picker-available"
            className="flex flex-col gap-1.5"
          >
            {available.map((dest) => (
              <AvailableRow
                key={dest.id}
                dest={dest}
                canAdd={!atMax}
                onAdd={() => handleAdd(dest.id)}
              />
            ))}
          </ul>
          {atMax && (
            <p className="mt-2 text-[11px] text-rhozly-on-surface/55">
              You've pinned the maximum of {QUICK_LAUNCHER_MAX}. Remove one to
              add another.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="quick-launcher-picker-reset"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rhozly-on-surface/55 hover:text-rhozly-primary transition-colors px-2 py-1 rounded-full"
        >
          <RotateCcw size={12} />
          Reset to defaults
        </button>
      </div>
    </section>
  );
}

interface PinnedRowProps {
  dest: QuickLauncherDestination;
  isFirst: boolean;
  isLast: boolean;
  canRemove: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function PinnedRow({
  dest,
  isFirst,
  isLast,
  canRemove,
  onMoveUp,
  onMoveDown,
  onRemove,
}: PinnedRowProps) {
  const Icon = dest.icon;
  return (
    <li
      data-testid={`quick-launcher-pinned-${dest.id}`}
      className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-rhozly-outline/15 bg-rhozly-surface-low/40"
    >
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          data-testid={`quick-launcher-pinned-${dest.id}-up`}
          aria-label={`Move ${dest.label} up`}
          className="p-1 rounded-md text-rhozly-on-surface/50 hover:text-rhozly-primary hover:bg-rhozly-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-rhozly-on-surface/50 transition-colors"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          data-testid={`quick-launcher-pinned-${dest.id}-down`}
          aria-label={`Move ${dest.label} down`}
          className="p-1 rounded-md text-rhozly-on-surface/50 hover:text-rhozly-primary hover:bg-rhozly-primary/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-rhozly-on-surface/50 transition-colors"
        >
          <ArrowDown size={12} />
        </button>
      </div>
      <div className="shrink-0 w-8 h-8 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
        <Icon size={16} strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-black text-sm text-rhozly-on-surface leading-tight truncate">
          {dest.label}
        </p>
        <p className="text-[11px] text-rhozly-on-surface/55 leading-snug truncate">
          {dest.description}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        data-testid={`quick-launcher-pinned-${dest.id}-remove`}
        aria-label={`Remove ${dest.label}`}
        className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/50 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-rhozly-on-surface/50 transition-colors"
      >
        <XIcon size={14} />
      </button>
    </li>
  );
}

interface AvailableRowProps {
  dest: QuickLauncherDestination;
  canAdd: boolean;
  onAdd: () => void;
}

function AvailableRow({ dest, canAdd, onAdd }: AvailableRowProps) {
  const Icon = dest.icon;
  return (
    <li
      data-testid={`quick-launcher-available-${dest.id}`}
      className="flex items-center gap-3 px-3 py-2 rounded-2xl border border-rhozly-outline/10 bg-white"
    >
      <div className="shrink-0 w-8 h-8 rounded-xl bg-rhozly-on-surface/5 text-rhozly-on-surface/70 flex items-center justify-center">
        <Icon size={16} strokeWidth={2.25} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-black text-sm text-rhozly-on-surface leading-tight truncate">
          {dest.label}
        </p>
        <p className="text-[11px] text-rhozly-on-surface/55 leading-snug truncate">
          {dest.description}
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        data-testid={`quick-launcher-available-${dest.id}-add`}
        aria-label={`Pin ${dest.label}`}
        className="shrink-0 p-2 rounded-xl text-rhozly-primary bg-rhozly-primary/10 hover:bg-rhozly-primary/20 disabled:opacity-30 disabled:hover:bg-rhozly-primary/10 transition-colors"
      >
        <Plus size={14} />
      </button>
    </li>
  );
}

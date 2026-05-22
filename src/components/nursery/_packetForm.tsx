import React from "react";

/**
 * Shared form primitives used by `AddSeedPacketModal` and
 * `EditSeedPacketModal`. Both modals show the same packet-detail
 * fields (variety, vendor, dates, qty, notes) and benefit from a
 * single source of truth for label / hint / disabled-state styling.
 */

export const PACKET_FORM_INPUT_CX =
  "w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15";

export function PacketFieldRow({
  label,
  testId,
  optional,
  hint,
  children,
}: {
  label: string;
  testId: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
        {label}
        {optional && (
          <span className="text-rhozly-on-surface/30 normal-case font-bold ml-1">
            (optional)
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] text-rhozly-on-surface/50 mt-1 leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}

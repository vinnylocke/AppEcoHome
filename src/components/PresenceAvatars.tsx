import React from "react";
import { usePresence } from "../hooks/usePresence";

interface Props {
  /** Channel key — usually `plan:<id>`, `area:<id>`, etc. */
  channelKey: string;
  /** Current user's id. Pass null while auth is loading; the hook self-skips. */
  userId: string | null;
  /** Optional max number of avatars to render before showing a `+N` overflow chip. */
  maxAvatars?: number;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Compact stack of avatars for everyone else currently present on the same
 * channel. Hides itself when nobody else is viewing — keeps single-user homes
 * quiet.
 */
export default function PresenceAvatars({ channelKey, userId, maxAvatars = 4 }: Props) {
  const others = usePresence(channelKey, userId);

  if (others.length === 0) return null;

  const visible = others.slice(0, maxAvatars);
  const overflow = others.length - visible.length;

  return (
    <div
      className="flex items-center gap-1.5"
      data-testid="presence-avatars"
      aria-label={`${others.length} other ${others.length === 1 ? "person" : "people"} viewing`}
    >
      <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 hidden sm:inline">
        Viewing now
      </span>
      <div className="flex -space-x-2">
        {visible.map((m) => (
          <span
            key={m.user_id}
            title={m.display_name ?? "Anonymous"}
            className="w-7 h-7 rounded-full border-2 border-white shadow-sm overflow-hidden bg-rhozly-primary-container flex items-center justify-center text-[10px] font-black text-rhozly-primary"
          >
            {m.avatar_url ? (
              <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{initials(m.display_name)}</span>
            )}
          </span>
        ))}
        {overflow > 0 && (
          <span className="w-7 h-7 rounded-full border-2 border-white shadow-sm bg-rhozly-on-surface text-white text-[10px] font-black flex items-center justify-center">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}

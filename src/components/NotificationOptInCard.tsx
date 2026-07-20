import React, { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const LS_DISMISSED = "rhozly_notif_optin_dismissed";

/**
 * One-time dashboard card that explicitly asks the user to enable browser
 * notifications. Hides itself when:
 *  - browser doesn't support notifications
 *  - permission already granted or denied
 *  - user dismissed the card (persisted in localStorage)
 *
 * On accept, triggers `Notification.requestPermission()` and links into
 * Account Settings → Notification preferences for fine-grained control.
 */
export default function NotificationOptInCard({
  onSettled,
}: {
  /** Called when the card hides itself (enabled OR dismissed) — the
   *  dashboard's single-slot renderer re-evaluates so the next promo card
   *  (PWA install) can claim the freed slot without waiting for an
   *  unrelated re-render. */
  onSettled?: () => void;
} = {}) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(LS_DISMISSED) === "true") return;
    setHidden(false);
  }, []);

  if (hidden) return null;

  const handleEnable = async () => {
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        // Show a sample notification so the user sees what to expect
        new Notification("Rhozly notifications enabled 🌿", {
          body: "We'll let you know about watering, harvests, and weather alerts.",
          icon: "/images/logo_small_rhozly.png",
        });
      }
    } catch {
      /* ignore — user can still get in-app toasts */
    } finally {
      localStorage.setItem(LS_DISMISSED, "true");
      setHidden(true);
      onSettled?.();
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(LS_DISMISSED, "true");
    setHidden(true);
    onSettled?.();
  };

  return (
    // Phase 6e — calm, green-first (was a full-bleed sky-blue block that fought
    // the brand and shouted at new users). A quiet surface card with a green
    // accent icon and one green primary action; "green leads, colour follows".
    <div
      data-testid="notification-optin-card"
      className="bg-rhozly-surface-low border border-rhozly-outline/10 rounded-3xl p-5 relative"
    >
      <button
        data-testid="notification-optin-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notifications prompt"
        className="absolute top-3 right-3 text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors"
      >
        <X size={14} />
      </button>
      <div className="flex items-start gap-4">
        <div className="bg-rhozly-primary/10 p-3 rounded-2xl flex-shrink-0">
          <Bell size={22} className="text-rhozly-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm text-rhozly-on-surface leading-tight mb-1">
            Want a daily watering reminder?
          </p>
          <p className="text-xs text-rhozly-on-surface/60 leading-snug mb-3">
            Get notified about tasks due today, weather alerts (frost · heat · wind), and golden-hour reminders. Fine-tune categories any time.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="notification-optin-enable"
              onClick={handleEnable}
              className="bg-rhozly-primary text-white text-xs font-black px-4 py-2 min-h-[36px] rounded-full hover:opacity-95 transition"
            >
              Enable notifications
            </button>
            <button
              onClick={() => navigate("/gardener?tab=notifications")}
              className="text-rhozly-on-surface/55 hover:text-rhozly-primary text-xs font-bold px-4 py-2 min-h-[36px] rounded-full transition"
            >
              Customise first
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

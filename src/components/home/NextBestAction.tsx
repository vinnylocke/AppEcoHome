import { useNavigate } from "react-router-dom";
import { AlertCircle, ListChecks, Sprout, ArrowRight, type LucideIcon } from "lucide-react";
import type { AttentionItem } from "../../hooks/useHomeOverview";
import { motionTier } from "../../lib/motionTier";

/**
 * Next Best Action — the Porch's single guided suggestion (home redesign
 * Stage 4, docs/plans/home-redesign-two-postures.md §3). ONE calm card,
 * exactly one action, deliberately NO counts anywhere — the point of the
 * Porch is that a new gardener is told the one thing to do next, not shown
 * a metrics wall.
 *
 * Priority ladder (first rung that has content wins):
 *   1. the first attention item (already excludeKinds-filtered by HomeMain —
 *      overdue_tasks / weather_alert never reach here; the hero + global
 *      banner own those facts)
 *   2. the first pending task today (`firstTaskTitle` — optional; HomeMain
 *      only wires it when a title is cheaply available)
 *   3. the seasonal fallback: browse what to plant right now (scrolls to the
 *      on-page learn section, or deep-links to the Shed's add-plant flow
 *      when the section isn't mounted)
 *
 * One tap navigates. Porch-only by preset — HOME_PRESETS.workbench omits
 * `nextBestAction` from its sectionOrder.
 */

interface Props {
  /** Attention items AFTER HomeMain's route-scoped excludeKinds filter. */
  attentionItems: AttentionItem[];
  /** Title of the first pending task today, when the caller has one handy. */
  firstTaskTitle?: string | null;
}

interface Resolved {
  icon: LucideIcon;
  headline: string;
  body: string;
  go: () => void;
}

export default function NextBestAction({ attentionItems, firstTaskTitle }: Props) {
  const navigate = useNavigate();

  const attention = attentionItems[0] ?? null;
  const resolved: Resolved = attention
    ? {
        icon: AlertCircle,
        headline: attention.title,
        body: attention.body,
        go: () => navigate(attention.route),
      }
    : firstTaskTitle
      ? {
          icon: ListChecks,
          headline: firstTaskTitle,
          body: "It's first on today's list — tick it off and you're winning.",
          go: () => navigate("/dashboard?view=calendar"),
        }
      : {
          icon: Sprout,
          headline: "Browse what to plant right now",
          body: "A calm way to get ahead of the season.",
          go: () => {
            // The learn wrapper is always present in the Porch DOM, but it's
            // `empty:hidden` (display:none, no children) when SeasonalPicksCard
            // self-hides on an empty / off-season pick list. Gate on child
            // count, not mere presence: scroll only when it has content,
            // otherwise take the gardener straight to the add-plant flow so the
            // Porch's single guided action is never a dead tap (review finding).
            const learn = document.querySelector('[data-section="learn"]');
            if (learn && learn.children.length > 0) {
              learn.scrollIntoView({
                behavior: motionTier() === "off" ? "auto" : "smooth",
                block: "start",
              });
            } else {
              navigate("/shed?open=add-plant");
            }
          },
        };

  const Icon = resolved.icon;

  return (
    <section data-testid="next-best-action">
      <button
        data-testid="next-best-action-cta"
        onClick={resolved.go}
        className="w-full flex items-start gap-3.5 text-left bg-white rounded-3xl shadow-sm border border-rhozly-primary/10 px-4 py-4 sm:px-5 hover:border-rhozly-primary/25 hover:shadow transition group"
      >
        <span className="shrink-0 mt-0.5 w-9 h-9 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
          <Icon size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-3xs font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">
            Next best thing to do
          </span>
          <span className="block text-sm font-black text-rhozly-on-surface leading-snug">
            {resolved.headline}
          </span>
          <span className="block text-xs text-rhozly-on-surface/60 leading-snug mt-0.5">
            {resolved.body}
          </span>
        </span>
        <ArrowRight
          size={16}
          className="shrink-0 mt-1 text-rhozly-on-surface/30 group-hover:text-rhozly-primary group-hover:translate-x-0.5 transition"
        />
      </button>
    </section>
  );
}

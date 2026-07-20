// Redesign Stage 3 — "The Brief": the home's four separate AI cards (Garden
// Brain daily brief, adaptive-care proposals, Head Gardener estate headline,
// AI insight) merged into ONE card so Rhozly speaks with a single voice.
//
// Composition contract (docs/plans/home-redesign-two-postures.md §3):
//  - Every child keeps its own data mechanics, tier gates, and self-hides —
//    they render `embedded` (no card chrome) and stay MOUNTED even while the
//    shell is hidden, reporting visibility upward via `onVisibilityChange`
//    (the GettingStartedChecklist house pattern). Unmounting them would
//    deadlock the card at hidden, since they own the fetches that decide it.
//  - Upgrade dedup: `head_gardener` and `ai_insights` are both
//    Evergreen-gated, so a locked account gets exactly ONE compact
//    UpgradeNudge — the estate row's gate fallback. AssistantCard's own nudge
//    is suppressed (`showUpgradeWhenLocked={false}`) so it can never double.

import { useState } from "react";
import GardenBrainBriefCard from "./GardenBrainBriefCard";
import AdaptiveCareCard from "./AdaptiveCareCard";
import HeadGardenerCard from "../manager/HeadGardenerCard";
import AssistantCard from "../AssistantCard";

// Row separation. Tailwind v4's `divide-y` puts border-bottom on every
// :not(:last-child), which paints a stray rule (and the rows' py padding
// leaves dead space) whenever a trailing row self-hides. This sibling scheme
// is v3's divide recipe — spacing + border-top on each non-empty row that
// follows a non-empty row — visually identical with all rows present, and
// robust to any combination of self-hidden rows. Rows carry `empty:hidden` so
// a child rendering null removes its row entirely without being unmounted.
const DIVIDED_ROWS = [
  "[&>div:not(:empty)~div:not(:empty)]:mt-3",
  "[&>div:not(:empty)~div:not(:empty)]:pt-3",
  "[&>div:not(:empty)~div:not(:empty)]:border-t",
  "[&>div:not(:empty)~div:not(:empty)]:border-rhozly-outline/10",
].join(" ");

interface Props {
  homeId: string;
  userId: string;
  density: "simple" | "detailed";
}

export default function TheBrief({ homeId, userId, density }: Props) {
  // Visibility ledger — defaults TRUE before the first report so a populated
  // card paints immediately instead of flashing in.
  const [briefVisible, setBriefVisible] = useState(true);
  const [adaptiveVisible, setAdaptiveVisible] = useState(true);
  // The estate + insight inners only mount once the Evergreen gate passes, so
  // a locked account never reports and these defaults hold — correct, because
  // the estate row's compact UpgradeNudge fallback IS visible content there.
  // COUPLING (keep intact): this "never a fully empty card" guarantee assumes
  // head_gardener and ai_insights share a tier (both EVERGREEN in
  // constants/tierFeatures.ts) — so locked ⟺ the estate nudge always paints.
  // If those gates are ever split, default estate/insightVisible to false and
  // drive the ledger from the nudge, or the shell can show empty "From Rhozly"
  // chrome for an account with no brief/adaptive/headline/insight data.
  const [estateVisible, setEstateVisible] = useState(true);
  const [insightVisible, setInsightVisible] = useState(true);

  const showCard = briefVisible || adaptiveVisible || estateVisible || insightVisible;

  return (
    <section
      data-testid="the-brief"
      hidden={!showCard}
      className="bg-white rounded-3xl border border-rhozly-outline/10 shadow-sm p-4 sm:p-5"
    >
      <p className="text-3xs font-black uppercase tracking-widest text-rhozly-on-surface/40 select-none mb-3">
        From Rhozly
      </p>
      <div className={DIVIDED_ROWS}>
        <div className="empty:hidden">
          <GardenBrainBriefCard
            embedded
            homeId={homeId}
            userId={userId}
            density={density}
            onVisibilityChange={setBriefVisible}
          />
        </div>
        <div className="empty:hidden">
          <AdaptiveCareCard
            embedded
            homeId={homeId}
            currentUserId={userId}
            onVisibilityChange={setAdaptiveVisible}
          />
        </div>
        {/* Estate row — HeadGardenerCard carries its own FeatureGate
            (feature="head_gardener", compact-nudge fallback): the page's one
            upgrade teaser when locked. */}
        <div data-testid="dashboard-head-gardener-card" className="empty:hidden">
          <HeadGardenerCard embedded onVisibilityChange={setEstateVisible} />
        </div>
        {/* Insight row — nudge suppressed here (dedup): the estate row owns it. */}
        <div data-testid="dashboard-assistant-card" className="empty:hidden">
          <AssistantCard
            userId={userId}
            showUpgradeWhenLocked={false}
            onVisibilityChange={setInsightVisible}
          />
        </div>
      </div>
    </section>
  );
}

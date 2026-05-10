import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { useAutoTrigger } from "./useAutoTrigger";
import { useOnboardingFlow } from "./useOnboardingFlow";
import HelpCenterDrawer from "./HelpCenterDrawer";
import type { OnboardingState } from "./types";

interface Props {
  userId: string | undefined;
  onboardingState: OnboardingState;
  onStateChange: (state: OnboardingState) => void;
}

export default function HelpCenter({ userId, onboardingState, onStateChange }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);

  // Build a stable flow launcher that works for any flowId
  const launchFlow = useCallback(
    (flowId: string) => setActiveFlowId(flowId),
    [],
  );

  // Auto-trigger hook — fires automatic flows on route change
  useAutoTrigger(onboardingState, launchFlow, !!userId);

  return (
    <>
      {/* Active flow runner — mounts/unmounts per flow */}
      {activeFlowId && (
        <ActiveFlowRunner
          key={activeFlowId}
          flowId={activeFlowId}
          userId={userId}
          onboardingState={onboardingState}
          onStateChange={onStateChange}
          onDone={() => setActiveFlowId(null)}
        />
      )}

      {createPortal(
        <>
          {/* FAB */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open help center"
            className="fixed bottom-20 right-6 md:bottom-6 md:right-24 z-40 w-12 h-12 rounded-full bg-rhozly-primary text-white shadow-lg flex items-center justify-center hover:bg-rhozly-primary/90 transition-all hover:scale-105 active:scale-95"
          >
            <HelpCircle size={22} />
          </button>

          {/* Backdrop */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-50 bg-rhozly-on-surface/30 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
          )}

          {/* Drawer */}
          <div
            className={`fixed top-0 right-0 bottom-0 z-50 w-80 max-w-full shadow-2xl transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}
          >
            <HelpCenterDrawer
              onboardingState={onboardingState}
              onClose={() => setDrawerOpen(false)}
              onStartFlow={launchFlow}
            />
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function ActiveFlowRunner({
  flowId,
  userId,
  onboardingState,
  onStateChange,
  onDone,
}: {
  flowId: string;
  userId: string | undefined;
  onboardingState: OnboardingState;
  onStateChange: (state: OnboardingState) => void;
  onDone: () => void;
}) {
  const wrappedOnStateChange = useCallback(
    (state: OnboardingState) => {
      onStateChange(state);
      onDone();
    },
    [onStateChange, onDone],
  );

  const { start } = useOnboardingFlow(flowId, userId, onboardingState, wrappedOnStateChange);

  React.useEffect(() => {
    start();
  }, [start]);

  return null;
}

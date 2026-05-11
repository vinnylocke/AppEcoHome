import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useAutoTrigger } from "./useAutoTrigger";
import { useOnboardingFlow } from "./useOnboardingFlow";
import HelpCenterDrawer from "./HelpCenterDrawer";
import type { OnboardingState } from "./types";

interface Props {
  userId: string | undefined;
  onboardingState: OnboardingState;
  onStateChange: (state: OnboardingState) => void;
  open: boolean;
  onClose: () => void;
}

export default function HelpCenter({ userId, onboardingState, onStateChange, open, onClose }: Props) {
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);

  const launchFlow = useCallback(
    (flowId: string) => setActiveFlowId(flowId),
    [],
  );

  useAutoTrigger(onboardingState, launchFlow, !!userId);

  return (
    <>
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
          {open && (
            <div
              className="fixed inset-0 z-50 bg-rhozly-on-surface/30 backdrop-blur-sm"
              onClick={onClose}
            />
          )}

          <div
            className={`fixed top-0 right-0 bottom-0 z-50 w-80 max-w-full shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
          >
            <HelpCenterDrawer
              onboardingState={onboardingState}
              onClose={onClose}
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

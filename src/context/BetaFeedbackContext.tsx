import React, { createContext, useContext } from "react";
import { useBetaFeedback, type PendingFeedback } from "../hooks/useBetaFeedback";
import type { FeedbackContext } from "../constants/betaFeedbackContexts";

interface BetaFeedbackContextValue {
  isBeta: boolean;
  userId: string | undefined;
  requestFeedback: (context: FeedbackContext, metadata?: Record<string, unknown>) => void;
  pendingFeedback: PendingFeedback | null;
  submitFeedback: (ratings: Record<string, number>, description: string) => Promise<void>;
  dismissFeedback: () => void;
  submitGeneralFeedback: (actionContext: string, description: string) => Promise<void>;
}

const BetaFeedbackContext = createContext<BetaFeedbackContextValue>({
  isBeta: false,
  userId: undefined,
  requestFeedback: () => {},
  pendingFeedback: null,
  submitFeedback: async () => {},
  dismissFeedback: () => {},
  submitGeneralFeedback: async () => {},
});

export function BetaFeedbackProvider({
  children,
  isBeta,
  userId,
}: {
  children: React.ReactNode;
  isBeta: boolean;
  userId: string | undefined;
}) {
  const value = useBetaFeedback(isBeta, userId);
  return (
    <BetaFeedbackContext.Provider value={value}>
      {children}
    </BetaFeedbackContext.Provider>
  );
}

export function useBetaFeedbackContext() {
  return useContext(BetaFeedbackContext);
}

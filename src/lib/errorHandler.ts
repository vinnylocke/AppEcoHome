import * as Sentry from "@sentry/react";
import toast from "react-hot-toast";

export const Logger = {
  log: (message: string, data?: any) => {
    if (import.meta.env.DEV) console.log(`📘 [INFO]: ${message}`, data || "");
  },

  warn: (message: string, data?: any) => {
    if (import.meta.env.DEV) console.warn(`📙 [WARN]: ${message}`, data || "");
  },

  // ✨ UPGRADED: Now accepts a userFriendlyMessage to show in a toast!
  error: (
    devMessage: string,
    error?: any,
    context?: Record<string, any>,
    userFriendlyMessage?: string, // 👈 Add this optional parameter
  ) => {
    // 1. Log to console for the developer
    if (import.meta.env.DEV) {
      console.error(`🚨 [ERROR]: ${devMessage}`, error || "");
    }

    // 2. Send the exact technical details to Sentry silently
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);

      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(
          `${devMessage} - ${JSON.stringify(error)}`,
          "error",
        );
      }
    });

    // 3. Show a clean, polite Toast to the user (if a message was provided)
    if (userFriendlyMessage) {
      toast.error(userFriendlyMessage, {
        duration: 5000,
        position: "bottom-center",
        style: {
          borderRadius: "16px",
          background: "#333",
          color: "#fff",
          fontWeight: "bold",
        },
      });
    }
  },

  // ✨ NEW: A quick wrapper just for success toasts
  success: (message: string) => {
    toast.success(message, {
      duration: 3000,
      position: "bottom-center",
      style: { borderRadius: "16px", fontWeight: "bold" },
    });
  },
};

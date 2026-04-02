import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import * as Sentry from "@sentry/react";

// Initialize Sentry before the app renders
Sentry.init({
  // You will get this DSN from your Sentry.io dashboard
  dsn: import.meta.env.VITE_SENTRY_DSN,

  // Only send errors to Sentry if we are in production,
  // so we don't spam our quota with local 'localhost' testing errors!
  enabled: import.meta.env.PROD,
  //enabled: true,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],

  // Performance Monitoring
  tracesSampleRate: 1.0,

  // Session Replay (Records a video of the user's screen when it crashes!)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

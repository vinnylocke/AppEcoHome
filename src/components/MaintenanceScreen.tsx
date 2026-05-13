import React from "react";
import { Wrench } from "lucide-react";

export default function MaintenanceScreen({ message }: { message: string | null }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-rhozly-bg px-6 text-center gap-8">
      <div className="bg-rhozly-primary p-5 rounded-3xl shadow-xl shadow-rhozly-primary/20">
        <img src="/images/logo_small_rhozly.png" alt="Rhozly" className="h-12 w-auto" />
      </div>

      <div className="space-y-3 max-w-xs">
        <h1 className="font-black text-2xl text-rhozly-on-surface">We'll be right back</h1>
        <p className="text-sm text-rhozly-on-surface/55 leading-relaxed">
          {message ?? "Rhozly is undergoing a quick update. Please check back shortly."}
        </p>
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 bg-rhozly-primary/10 rounded-full border border-rhozly-primary/20">
        <Wrench size={14} className="text-rhozly-primary" style={{ animation: "bounce 1.5s infinite" }} />
        <span className="text-xs font-black text-rhozly-primary uppercase tracking-widest">
          Maintenance in progress
        </span>
      </div>

      <p className="text-[11px] text-rhozly-on-surface/30 font-medium">
        Your data is safe. The app will reload automatically when we're done.
      </p>
    </div>
  );
}

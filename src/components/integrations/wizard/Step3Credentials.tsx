import React, { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Loader2, Eye, EyeOff } from "lucide-react";
import type { WizardState, DiscoveredDevice } from "../ConnectDeviceWizard";

interface Props {
  homeId: string;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}

export default function Step3Credentials({ homeId, state, update, onNext }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>(state.credentials ?? {});

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!state.brand) throw new Error("No brand selected");

      if (state.brand === "ecowitt") {
        if (!fields.applicationKey || !fields.apiKey || !fields.gatewayMac) {
          throw new Error("Please fill in all fields");
        }
        const res = await supabase.functions.invoke("integrations-ecowitt-connect", {
          body: { homeId, ...fields },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error) throw new Error(res.error.message);
        const { integrationId, devices } = res.data as { integrationId: string; devices: DiscoveredDevice[] };
        update({ credentials: fields, integrationId, discoveredDevices: devices });
        onNext();
      } else if (state.brand === "ewelink") {
        if (!fields.email || !fields.password) {
          throw new Error("Please enter your eWeLink email and password");
        }
        const res = await supabase.functions.invoke("integrations-ewelink-connect", {
          body: { homeId, ...fields },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error) throw new Error(res.error.message);
        const { integrationId, devices } = res.data as { integrationId: string; devices: DiscoveredDevice[] };
        update({ credentials: fields, integrationId, discoveredDevices: devices });
        onNext();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-black text-rhozly-on-surface mb-1">Enter credentials</h2>
      <p className="text-sm text-rhozly-on-surface-variant mb-6">
        {state.brand === "ecowitt"
          ? "Find these in your Ecowitt developer account at pro.ecowitt.net."
          : "Enter your eWeLink account credentials. These are encrypted and never stored in plain text."}
      </p>

      {state.brand === "ecowitt" && (
        <div className="space-y-4">
          <Field label="Application Key" value={fields.applicationKey ?? ""} onChange={(v) => set("applicationKey", v)} placeholder="Your Ecowitt app key" testId="cred-applicationKey" />
          <Field label="API Key" value={fields.apiKey ?? ""} onChange={(v) => set("apiKey", v)} placeholder="Your device API key" testId="cred-apiKey" />
          <Field label="Gateway MAC Address" value={fields.gatewayMac ?? ""} onChange={(v) => set("gatewayMac", v)} placeholder="AA:BB:CC:DD:EE:FF" testId="cred-gatewayMac" />
        </div>
      )}

      {state.brand === "ewelink" && (
        <div className="space-y-4">
          <Field label="eWeLink Email" type="email" value={fields.email ?? ""} onChange={(v) => set("email", v)} placeholder="you@example.com" testId="cred-email" />
          <div>
            <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={fields.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
                placeholder="••••••••"
                data-testid="cred-password"
                className="w-full px-4 py-3 pr-11 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface-variant hover:text-rhozly-on-surface"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>
      )}

      <button
        onClick={submit}
        disabled={loading}
        data-testid="cred-submit"
        className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-60 transition-colors"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
        {loading ? "Connecting…" : "Connect & Discover Devices"}
      </button>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, testId, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; testId: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
      />
    </div>
  );
}

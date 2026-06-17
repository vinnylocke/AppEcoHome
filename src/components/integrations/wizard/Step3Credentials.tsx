import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { Loader2, ExternalLink } from "lucide-react";
import type { WizardState, DiscoveredDevice } from "../ConnectDeviceWizard";
import {
  buildControlPreview,
  DEFAULT_CONTROL_METHOD,
  DEFAULT_CONTROL_HEADERS,
  DEFAULT_CONTROL_BODY,
} from "../../../lib/payloadTemplate";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";

interface Props {
  homeId: string;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}

export default function Step3Credentials({ homeId, state, update, onNext }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(state.credentials ?? {}).filter(([k]) => !k.startsWith("__")),
    ),
  );
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { listenerCleanupRef.current?.(); }, []);

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const exchangeCode = useCallback(
    async (code: string, region?: string) => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke("integrations-ewelink-connect", {
          body: { action: "exchange_code", homeId, code, region },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error) throw new Error(res.error.message);
        if (res.data?.error) throw new Error(res.data.error);
        const { integrationId, devices } = res.data as { integrationId: string; devices: DiscoveredDevice[] };
        update({ credentials: {}, integrationId, discoveredDevices: devices });
        onNext();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setLoading(false);
      }
    },
    [homeId, update, onNext],
  );

  // Auto-exchange when code is passed via wizard initialState (same-tab OAuth callback)
  useEffect(() => {
    if (state.brand === "ewelink" && state.credentials["__oauthCode"]) {
      exchangeCode(
        state.credentials["__oauthCode"],
        state.credentials["__oauthRegion"] || undefined,
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startOAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("integrations-ewelink-connect", {
        body: { action: "get_oauth_url" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      const { oauthUrl, state: oauthToken } = res.data as { oauthUrl: string; state: string };

      // Capacitor native app — use @capacitor/browser + App Links deep link callback
      if (Capacitor.isNativePlatform()) {
        let resolved = false;
        let urlListenerHandle: PluginListenerHandle | null = null;
        let timerId: ReturnType<typeof setTimeout>;

        const cleanup = () => {
          resolved = true;
          urlListenerHandle?.remove();
          urlListenerHandle = null;
          clearTimeout(timerId);
          listenerCleanupRef.current = null;
        };

        urlListenerHandle = await CapApp.addListener("appUrlOpen", async (event) => {
          if (resolved) return;
          const url = new URL(event.url);
          const code = url.searchParams.get("code");
          const region = url.searchParams.get("region") ?? undefined;
          cleanup();
          await Browser.close().catch(() => {});
          if (!code) {
            setError("No authorisation code received — please try again.");
            setLoading(false);
            return;
          }
          await exchangeCode(code, region);
        });

        timerId = setTimeout(() => {
          if (resolved) return;
          cleanup();
          Browser.close().catch(() => {});
          setLoading(false);
          setError("Connection timed out — please try again.");
        }, 10 * 60 * 1000);

        listenerCleanupRef.current = cleanup;
        await Browser.open({ url: oauthUrl });
        return; // stay in loading state until appUrlOpen fires
      }

      // iOS standalone PWA has isolated storage — popup cross-tab handshake won't work
      const isIOSPWA = window.matchMedia("(display-mode: standalone)").matches &&
                       /iPhone|iPad|iPod/.test(navigator.userAgent);

      if (!isIOSPWA) {
        const popup = window.open(oauthUrl, "_blank");
        if (popup && !popup.closed) {
          // Popup opened — store handshake data and wait for callback tab to post result
          localStorage.setItem("ewelink_oauth_mode", "popup");
          localStorage.setItem("ewelink_oauth_state", oauthToken);
          localStorage.setItem("ewelink_oauth_home_id", homeId);

          let timerId: ReturnType<typeof setTimeout>;

          const cleanup = () => {
            window.removeEventListener("storage", handler);
            clearTimeout(timerId);
            listenerCleanupRef.current = null;
          };

          const handler = (e: StorageEvent) => {
            if (e.key !== "ewelink_oauth_result" || !e.newValue) return;
            cleanup();
            localStorage.removeItem("ewelink_oauth_result");
            try {
              const result = JSON.parse(e.newValue) as { integrationId?: string; devices?: DiscoveredDevice[]; error?: string };
              if (result.error) { setError(result.error); setLoading(false); return; }
              update({ credentials: {}, integrationId: result.integrationId ?? null, discoveredDevices: result.devices ?? [] });
              onNext();
            } catch {
              setError("Failed to complete connection");
              setLoading(false);
            }
          };

          timerId = setTimeout(() => {
            cleanup();
            setLoading(false);
            setError("Connection timed out — please try again.");
          }, 10 * 60 * 1000);

          listenerCleanupRef.current = cleanup;
          window.addEventListener("storage", handler);
          return; // stay in loading state until storage event arrives
        }
        // Popup was blocked — fall through to redirect
      }

      // Redirect fallback: iOS PWA or popup blocked
      localStorage.setItem("ewelink_oauth_mode", "redirect");
      sessionStorage.setItem("ewelink_oauth_state", oauthToken);
      sessionStorage.setItem("ewelink_oauth_deviceType", state.deviceType ?? "water_valve");
      window.location.href = oauthUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start authorisation");
      setLoading(false);
    }
  };

  const submitEcowitt = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!fields.applicationKey || !fields.apiKey || !fields.gatewayMac) {
        throw new Error("Please fill in all fields");
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("integrations-ecowitt-connect", {
        body: { homeId, ...fields },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      // 2026-06-16 — capture discovery diagnostics so Step4 can surface
      // the actual API response shape when nothing is found. Helps the
      // user (and us) confirm whether the gateway returned any
      // soil-shaped data at all.
      const { integrationId, devices, diagnostics } = res.data as {
        integrationId: string;
        devices: DiscoveredDevice[];
        diagnostics?: WizardState["discoveryDiagnostics"];
      };
      update({
        credentials: fields,
        integrationId,
        discoveredDevices: devices,
        discoveryDiagnostics: diagnostics ?? null,
      });
      onNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  const submitCustomHttp = async () => {
    setError(null);
    setLoading(true);
    try {
      const friendlyName = (fields.friendly_name ?? "").trim();
      if (!friendlyName) throw new Error("Give your device a name.");
      const family = state.deviceType ?? "soil_sensor";
      const connectFields: Record<string, string> = { friendly_name: friendlyName, family };
      // Outbound control config — only for valves where the user set a URL.
      if (family === "water_valve" && (fields.control_url ?? "").trim()) {
        connectFields.control_url = fields.control_url.trim();
        connectFields.control_method = (fields.control_method ?? DEFAULT_CONTROL_METHOD).trim() || DEFAULT_CONTROL_METHOD;
        connectFields.control_headers = fields.control_headers ?? DEFAULT_CONTROL_HEADERS;
        connectFields.control_body = fields.control_body ?? DEFAULT_CONTROL_BODY;
      }
      const appOrigin = typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.host}`
        : null;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("integrations-adapter-connect", {
        body: {
          provider: "custom_http",
          homeId,
          fields: connectFields,
          appOrigin,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if ((res.data as { error?: string })?.error) {
        throw new Error((res.data as { message?: string; error: string }).message ?? (res.data as { error: string }).error);
      }
      const { integrationId, devices, postConnect } = res.data as {
        integrationId: string;
        devices: Array<{ externalDeviceId: string; name: string; family: string; metadata: Record<string, unknown> }>;
        postConnect: WizardState["postConnect"];
      };
      update({
        credentials: fields,
        integrationId,
        // The custom_http adapter returns the auto-created device(s)
        // already with their final external ids. The discovery step
        // renders them, but we also keep the postConnect block so the
        // wizard can show the webhook URL + payload contract first.
        discoveredDevices: (devices ?? []).map((d) => ({
          externalDeviceId: d.externalDeviceId,
          name: d.name,
          model: "Custom HTTP",
        })),
        postConnect: postConnect ?? null,
      });
      onNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-black text-rhozly-on-surface mb-1">
        {state.brand === "ewelink"
          ? "Connect eWeLink"
          : state.brand === "custom_http"
            ? "Custom device details"
            : "Enter credentials"}
      </h2>
      <p className="text-sm text-rhozly-on-surface-variant mb-6">
        {state.brand === "ecowitt"
          ? "Find these in your Ecowitt developer account at pro.ecowitt.net."
          : state.brand === "custom_http"
            ? "Name your device — we'll generate a unique webhook URL you can point it at."
            : "You'll be taken to eWeLink to securely authorise access. No passwords are stored."}
      </p>

      {state.brand === "custom_http" && (
        <>
          <div className="space-y-4">
            <Field
              label="Device name"
              value={fields.friendly_name ?? ""}
              onChange={(v) => set("friendly_name", v)}
              placeholder="Greenhouse soil probe"
              testId="cred-friendlyName"
            />
            <div className="rounded-2xl bg-rhozly-surface px-4 py-3 text-xs text-rhozly-on-surface-variant leading-relaxed">
              Family is set from your earlier choice ({state.deviceType === "water_valve" ? "water valve" : "soil sensor"}).
              After connect we'll show you the webhook URL + the JSON shape your device should POST.
            </div>
            {state.deviceType === "water_valve" && (
              <ValveControlConfig fields={fields} set={set} />
            )}
          </div>
          {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}
          <button
            onClick={submitCustomHttp}
            disabled={loading}
            data-testid="cred-submit-customhttp"
            className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? "Setting up…" : "Generate webhook URL"}
          </button>
        </>
      )}

      {state.brand === "ecowitt" && (
        <>
          <div className="space-y-4">
            <Field label="Application Key" value={fields.applicationKey ?? ""} onChange={(v) => set("applicationKey", v)} placeholder="Your Ecowitt app key" testId="cred-applicationKey" />
            <Field label="API Key" value={fields.apiKey ?? ""} onChange={(v) => set("apiKey", v)} placeholder="Your device API key" testId="cred-apiKey" />
            <Field label="Gateway MAC Address" value={fields.gatewayMac ?? ""} onChange={(v) => set("gatewayMac", v)} placeholder="AA:BB:CC:DD:EE:FF" testId="cred-gatewayMac" />
          </div>
          {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}
          <button
            onClick={submitEcowitt}
            disabled={loading}
            data-testid="cred-submit"
            className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? "Connecting…" : "Connect & Discover Devices"}
          </button>
        </>
      )}

      {state.brand === "ewelink" && (
        <>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
              <Loader2 size={32} className="animate-spin text-rhozly-primary" />
              <p className="text-sm font-semibold text-rhozly-on-surface">
                {state.credentials["__oauthCode"] ? "Completing connection…" : "Waiting for eWeLink authorisation…"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5 py-4">
              <button
                onClick={startOAuth}
                data-testid="ewelink-oauth-button"
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 transition-colors"
              >
                <ExternalLink size={18} />
                Connect with eWeLink
              </button>
              <p className="text-xs text-rhozly-on-surface-variant text-center max-w-xs">
                You'll be taken to eWeLink's login page. After authorising, you'll be returned here automatically.
              </p>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}
        </>
      )}
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

function Textarea({
  label, value, onChange, testId, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void; testId: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        data-testid={testId}
        spellCheck={false}
        className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-xs font-mono resize-y"
      />
    </div>
  );
}

const CONTROL_VARS_HINT =
  "Variables: {{command}}, {{state}}, {{duration_seconds}}, {{duration_minutes}}, {{device_external_id}}, {{device_name}}";

/** Optional outbound-control config for a custom water valve. UI-only flag
 *  `__control_enabled` is not sent to the server (submitCustomHttp builds the
 *  control_* fields explicitly). */
function ValveControlConfig({
  fields, set,
}: {
  fields: Record<string, string>; set: (k: string, v: string) => void;
}) {
  const enabled = (fields.control_url ?? "") !== "" || fields.__control_enabled === "1";

  const toggle = () => {
    if (enabled) {
      set("control_url", "");
      set("__control_enabled", "");
    } else {
      set("__control_enabled", "1");
      if (!fields.control_method) set("control_method", DEFAULT_CONTROL_METHOD);
      if (!fields.control_headers) set("control_headers", DEFAULT_CONTROL_HEADERS);
      if (!fields.control_body) set("control_body", DEFAULT_CONTROL_BODY);
    }
  };

  const preview = enabled
    ? buildControlPreview({
        url: fields.control_url ?? "",
        method: fields.control_method,
        headers: fields.control_headers,
        body: fields.control_body,
      })
    : null;

  return (
    <div className="rounded-2xl border border-rhozly-outline/20 p-4 space-y-3">
      <button
        type="button"
        onClick={toggle}
        data-testid="valve-control-toggle"
        className="text-sm font-bold text-rhozly-primary"
      >
        {enabled ? "✕ Remove valve control" : "+ Allow Rhozly to turn this valve on/off"}
      </button>

      {enabled && (
        <>
          <Field
            label="Control URL (public HTTPS)"
            value={fields.control_url ?? ""}
            onChange={(v) => set("control_url", v)}
            placeholder="https://your-device.example.com/valve"
            testId="cred-control-url"
          />
          <p className="text-[11px] text-rhozly-on-surface-variant leading-relaxed">
            Rhozly runs in the cloud, so this must be reachable over the internet — your device's public URL,
            a vendor/relay cloud API, or a tunnel. A LAN address (e.g. 192.168.x) won't be reachable.
          </p>
          <Field
            label="HTTP method"
            value={fields.control_method ?? DEFAULT_CONTROL_METHOD}
            onChange={(v) => set("control_method", v)}
            testId="cred-control-method"
          />
          <Textarea
            label="Headers (one Key: Value per line)"
            value={fields.control_headers ?? DEFAULT_CONTROL_HEADERS}
            onChange={(v) => set("control_headers", v)}
            testId="cred-control-headers"
            rows={2}
          />
          <Textarea
            label="Body template"
            value={fields.control_body ?? DEFAULT_CONTROL_BODY}
            onChange={(v) => set("control_body", v)}
            testId="cred-control-body"
            rows={3}
          />
          <p className="text-[11px] text-rhozly-on-surface-variant font-mono break-all">{CONTROL_VARS_HINT}</p>
          {preview && (
            <div data-testid="control-preview" className="rounded-xl bg-rhozly-surface-low p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface-variant mb-1.5">
                Request preview
              </p>
              {preview.ok ? (
                <pre className="text-[11px] whitespace-pre-wrap break-all text-rhozly-on-surface">{preview.text}</pre>
              ) : (
                <p className="text-[11px] text-red-600">Template problem: {preview.error}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

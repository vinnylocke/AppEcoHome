import React, { useState } from "react";
import { CheckSquare, Square, Copy, Check } from "lucide-react";
import toast from "react-hot-toast";
import { IconTemperature, IconWatering } from "../../../constants/icons";
import type { WizardState } from "../ConnectDeviceWizard";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}

export default function Step4Discovery({ state, update, onNext }: Props) {
  const { discoveredDevices, selectedDeviceIds } = state;

  const toggle = (id: string) => {
    const has = selectedDeviceIds.includes(id);
    update({ selectedDeviceIds: has ? selectedDeviceIds.filter((x) => x !== id) : [...selectedDeviceIds, id] });
  };

  const toggleAll = () => {
    if (selectedDeviceIds.length === discoveredDevices.length) {
      update({ selectedDeviceIds: [] });
    } else {
      update({ selectedDeviceIds: discoveredDevices.map((d) => d.externalDeviceId) });
    }
  };

  const isSoil = state.deviceType === "soil_sensor";

  return (
    <div>
      {/* 2026-06-16 Custom integrations Phase 3 — adapter-supplied
          post-connect block. Rendered above the device list because
          for custom_http the user needs to point their device at the
          webhook URL BEFORE devices will actually start reporting. */}
      {state.postConnect && (
        <PostConnectBlock postConnect={state.postConnect} />
      )}

      <h2 className="text-xl font-black text-rhozly-on-surface mb-1">Discovered devices</h2>
      <p className="text-sm text-rhozly-on-surface-variant mb-6">
        {discoveredDevices.length === 0
          ? "No devices were found on this account. Check your credentials and that the gateway is online."
          : "Select the devices you want to add to Rhozly."}
      </p>

      {discoveredDevices.length > 1 && (
        <button
          onClick={toggleAll}
          className="flex items-center gap-2 text-sm font-semibold text-rhozly-primary mb-4"
        >
          {selectedDeviceIds.length === discoveredDevices.length ? <CheckSquare size={16} /> : <Square size={16} />}
          {selectedDeviceIds.length === discoveredDevices.length ? "Deselect all" : "Select all"}
        </button>
      )}

      {discoveredDevices.length === 0 ? (
        <div className="py-6 text-rhozly-on-surface-variant text-sm">
          <p className="text-center mb-4">No devices found on this account.</p>
          {/* 2026-06-16 — Diagnostic expander. Surfaces the raw shape of
              the Ecowitt response so the user can quickly tell whether:
              (a) the gateway was found at all on the account, and
              (b) what categories of data it's reporting. Helps us
              correct the parser if a firmware variant uses different
              field names. */}
          {state.discoveryDiagnostics && (
            <details className="mx-auto max-w-md bg-rhozly-surface rounded-2xl border border-rhozly-outline/20 p-4 text-xs">
              <summary className="cursor-pointer font-semibold text-rhozly-on-surface">
                Why nothing showed up?
              </summary>
              <div className="mt-3 space-y-2 text-rhozly-on-surface-variant">
                <p>
                  Ecowitt API code:{" "}
                  <span className="font-mono">
                    {state.discoveryDiagnostics.api_code ?? "—"}
                  </span>
                  {state.discoveryDiagnostics.api_msg && (
                    <> ({state.discoveryDiagnostics.api_msg})</>
                  )}
                </p>
                <p>
                  Gateway found on account:{" "}
                  <span className="font-mono">
                    {state.discoveryDiagnostics.gateway_listed === null
                      ? "unknown"
                      : state.discoveryDiagnostics.gateway_listed
                        ? "yes"
                        : "no"}
                  </span>
                </p>
                {state.discoveryDiagnostics.data_keys && state.discoveryDiagnostics.data_keys.length > 0 ? (
                  <>
                    <p className="font-semibold text-rhozly-on-surface mt-2">
                      Data categories returned:
                    </p>
                    <ul className="font-mono text-[11px] bg-white rounded-xl border border-rhozly-outline/15 p-2 max-h-40 overflow-auto">
                      {state.discoveryDiagnostics.data_keys.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] leading-relaxed">
                      Rhozly is looking for any of: <span className="font-mono">soil_chN</span>,{" "}
                      <span className="font-mono">ch_soilN</span>, or{" "}
                      <span className="font-mono">soilwetnessN</span>. If a soil category is
                      listed above with a different name, share this list and we'll add it.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] mt-1">
                    The Ecowitt API returned no data categories. Check that the gateway
                    MAC matches the one shown in the Ecowitt app and that the API key is
                    enabled for this gateway.
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {discoveredDevices.map((d) => {
            const selected = selectedDeviceIds.includes(d.externalDeviceId);
            return (
              <button
                key={d.externalDeviceId}
                onClick={() => toggle(d.externalDeviceId)}
                data-testid={`discover-${d.externalDeviceId}`}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                  selected
                    ? "border-rhozly-primary bg-rhozly-primary/5"
                    : "border-rhozly-outline/20 hover:border-rhozly-primary/30"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSoil ? "bg-amber-100" : "bg-blue-100"}`}>
                  {isSoil ? <IconTemperature className="text-amber-600" size={18} /> : <IconWatering className="text-blue-600" size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-rhozly-on-surface text-sm">{d.name}</p>
                  <p className="text-xs text-rhozly-on-surface-variant">{d.model}{d.channel ? ` · Channel ${d.channel}` : ""}</p>
                </div>
                {selected ? (
                  <CheckSquare className="text-rhozly-primary shrink-0" size={20} />
                ) : (
                  <Square className="text-rhozly-on-surface-variant/40 shrink-0" size={20} />
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={selectedDeviceIds.length === 0 && discoveredDevices.length > 0}
        data-testid="discovery-next"
        className="w-full py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-40 transition-colors"
      >
        {discoveredDevices.length === 0 ? "Skip" : `Add ${selectedDeviceIds.length} device${selectedDeviceIds.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

/**
 * 2026-06-16 Custom integrations Phase 3 — renders the adapter's
 * post-connect block. For the custom_http adapter this is the webhook
 * URL + the documented JSON payload shape, with copy-to-clipboard for
 * each. Generic enough to handle other adapters that want to surface
 * setup instructions in the future.
 */
function PostConnectBlock({
  postConnect,
}: {
  postConnect: NonNullable<WizardState["postConnect"]>;
}) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const copy = async (text: string, which: "url" | "payload") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "url") setCopiedUrl(true);
      else setCopiedPayload(true);
      toast.success("Copied");
      setTimeout(() => {
        if (which === "url") setCopiedUrl(false);
        else setCopiedPayload(false);
      }, 1500);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually.");
    }
  };

  return (
    <div
      data-testid="wizard-post-connect"
      className="mb-6 bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1">
        Setup
      </p>
      <p className="font-black text-rhozly-on-surface text-sm mb-1">{postConnect.title}</p>
      <p className="text-xs text-rhozly-on-surface-variant mb-3 leading-snug">
        {postConnect.instructions}
      </p>

      {postConnect.webhookUrl && (
        <div className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1">
            Webhook URL
          </p>
          <div className="flex items-center gap-2">
            <code
              data-testid="post-connect-url"
              className="flex-1 text-[10px] font-mono font-bold text-rhozly-on-surface/75 bg-white rounded-lg px-2 py-1.5 border border-rhozly-outline/15 truncate"
            >
              {postConnect.webhookUrl}
            </code>
            <button
              type="button"
              data-testid="post-connect-copy-url"
              onClick={() => copy(postConnect.webhookUrl!, "url")}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 min-h-[32px] rounded-lg bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition"
            >
              {copiedUrl ? <Check size={11} /> : <Copy size={11} />}
              {copiedUrl ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[10px] text-rhozly-on-surface/45 mt-1">
            Or pass the token via the <code className="font-mono">X-Rhozly-Token</code> header.
          </p>
        </div>
      )}

      {postConnect.samplePayload && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-1">
            Sample payload (JSON)
          </p>
          <pre
            data-testid="post-connect-payload"
            className="text-[10px] font-mono text-rhozly-on-surface/75 bg-white rounded-lg p-2 border border-rhozly-outline/15 overflow-x-auto whitespace-pre"
          >
            {postConnect.samplePayload}
          </pre>
          <button
            type="button"
            data-testid="post-connect-copy-payload"
            onClick={() => copy(postConnect.samplePayload!, "payload")}
            className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rhozly-surface text-rhozly-on-surface/65 text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-surface-low transition"
          >
            {copiedPayload ? <Check size={11} /> : <Copy size={11} />}
            {copiedPayload ? "Copied" : "Copy payload"}
          </button>
        </div>
      )}
    </div>
  );
}

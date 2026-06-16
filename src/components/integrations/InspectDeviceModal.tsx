import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { X, Copy, CheckCheck, Loader2, AlertCircle } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface Props {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

interface InspectPayload {
  provider: string;
  endpoint: string;
  raw: unknown;
  hint: string;
}

/**
 * Diagnostic modal that calls the same provider API as the sync path
 * and shows the raw JSON it returned. Lets the user copy the payload
 * and share it back so we can adjust parsers to the exact shape their
 * hardware sends.
 */
export default function InspectDeviceModal({ deviceId, deviceName, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [data, setData] = useState<InspectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke("integrations-inspect-device", {
          body: { deviceId },
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message ?? "Failed to inspect device");
        } else {
          const payload = res.data as InspectPayload | { error?: string; message?: string };
          if ("error" in payload && payload.error) {
            setError(payload.message ?? payload.error);
          } else {
            setData(payload as InspectPayload);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to inspect device");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data.raw, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Inspect raw provider response"
        className="relative w-[calc(100vw-2rem)] max-w-2xl bg-white rounded-3xl shadow-xl max-h-[90vh] overflow-y-auto"
        data-testid="inspect-device-modal"
      >
        <div className="sticky top-0 bg-white border-b border-rhozly-outline/10 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="min-w-0">
            <h2 className="font-black text-rhozly-on-surface text-lg truncate">Raw provider response</h2>
            <p className="text-xs text-rhozly-on-surface-variant mt-0.5 truncate">{deviceName}</p>
          </div>
          <button onClick={onClose} data-testid="inspect-close" aria-label="Close" className="p-2 text-rhozly-on-surface-variant hover:text-rhozly-on-surface">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-rhozly-primary" size={22} />
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {data && (
            <>
              <p className="text-xs text-rhozly-on-surface-variant">
                <span className="font-semibold text-rhozly-on-surface">Endpoint:</span> {data.endpoint}
              </p>

              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                <p className="font-semibold mb-1">What to look for</p>
                <p>{data.hint}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-rhozly-on-surface">JSON response</p>
                  <button
                    type="button"
                    onClick={copy}
                    data-testid="inspect-copy"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-rhozly-outline/20 text-xs font-semibold text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
                  >
                    {copied ? <><CheckCheck size={12} className="text-green-600" /> Copied</> : <><Copy size={12} /> Copy JSON</>}
                  </button>
                </div>
                <pre className="bg-rhozly-on-surface/95 text-green-200 text-[11px] font-mono rounded-xl p-3 overflow-x-auto max-h-[50vh]" data-testid="inspect-json">
                  {JSON.stringify(data.raw, null, 2)}
                </pre>
              </div>

              <p className="text-[11px] text-rhozly-on-surface-variant/70">
                Paste this JSON back to support so we can confirm the exact field name your hardware reports.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

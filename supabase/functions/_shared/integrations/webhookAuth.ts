/**
 * Webhook auth extractor — pure helper for the
 * integrations-webhook-router edge function. Extracted so tests can
 * import it without pulling the router's supabase-js dependency.
 *
 * 2026-06-16 Custom integrations Phase 3.
 *
 * URL shapes accepted:
 *   POST /integrations-webhook-router/<provider>?token=<secret>
 *   POST /integrations-webhook-router/<provider>/<secret>
 *
 * The secret can also be passed via the `X-Rhozly-Token` header.
 * Header wins when both are present.
 */

export function extractAuth(req: Request): { provider: string; token: string } | null {
  const url = new URL(req.url);
  const idx = url.pathname.indexOf("/integrations-webhook-router");
  if (idx < 0) return null;
  const tail = url.pathname.slice(idx + "/integrations-webhook-router".length);
  const segments = tail.split("/").filter((s) => s.length > 0);
  const provider = segments[0];
  if (!provider) return null;

  const headerToken = req.headers.get("X-Rhozly-Token")?.trim();
  if (headerToken) return { provider, token: headerToken };

  if (segments[1]) return { provider, token: segments[1] };

  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken) return { provider, token: queryToken };

  return null;
}

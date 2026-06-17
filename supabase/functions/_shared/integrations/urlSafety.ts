/**
 * Outbound URL safety for user-supplied control endpoints.
 *
 * The control dispatcher runs in Supabase's cloud edge runtime, so a
 * user's `control_url` must be a publicly-routable HTTPS endpoint. As
 * basic SSRF defence we (a) require https and (b) block loopback /
 * private / link-local / metadata hosts.
 *
 * NOTE: this is literal-host based. Full DNS-rebinding protection
 * (resolve + pin the address actually connected to) is a deeper
 * follow-up — tracked in the plan.
 */

export interface UrlCheckResult {
  ok: boolean;
  error?: string;
}

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a > 255 || b > 255 || Number(m[3]) > 255 || Number(m[4]) > 255) return true; // malformed → reject
  if (a === 0) return true;                      // 0.0.0.0/8
  if (a === 10) return true;                     // 10/8
  if (a === 127) return true;                    // loopback
  if (a === 169 && b === 254) return true;       // link-local + 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true;       // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

function isPrivateHost(rawHost: string): boolean {
  // Strip IPv6 brackets, lowercase.
  const h = rawHost.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 loopback / unique-local (fc00::/7) / link-local (fe80::/10).
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe80") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
  return isPrivateIpv4(h);
}

/**
 * https-only + publicly-routable host. Returns `{ ok: true }` or
 * `{ ok: false, error }` with a stable error code.
 */
export function checkControlUrl(raw: string): UrlCheckResult {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (u.protocol !== "https:") return { ok: false, error: "url_must_be_https" };
  if (!u.hostname) return { ok: false, error: "invalid_url" };
  if (isPrivateHost(u.hostname)) return { ok: false, error: "url_host_not_allowed" };
  return { ok: true };
}

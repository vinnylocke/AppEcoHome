export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function ewelinkHeaders(
  appId: string,
  appSecret: string,
  body: string,
): Promise<Record<string, string>> {
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const ts    = Math.floor(Date.now() / 1000);
  const sign  = await hmacSign(appSecret, body);
  return {
    "Content-Type":  "application/json",
    "X-CK-Appid":    appId,
    "X-CK-Nonce":    nonce,
    "X-CK-Ts":       String(ts),
    "Authorization": `Sign ${sign}`,
  };
}

export async function buildOAuthUrl(
  appId: string,
  appSecret: string,
  redirectUrl: string,
): Promise<{ oauthUrl: string; state: string }> {
  const seq   = Date.now();
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const state = crypto.randomUUID();
  const sign  = await hmacSign(appSecret, `${appId}_${seq}`);

  const oauthUrl =
    `https://c2ccdn.coolkit.cc/oauth/index.html` +
    `?clientId=${encodeURIComponent(appId)}` +
    `&seq=${seq}` +
    `&authorization=${encodeURIComponent(sign)}` +
    `&redirectUrl=${encodeURIComponent(redirectUrl)}` +
    `&grantType=authorization_code` +
    `&state=${state}` +
    `&nonce=${nonce}`;

  return { oauthUrl, state };
}

const REGION_BASES: Record<string, string> = {
  eu: "https://eu-apia.coolkit.cc",
  us: "https://us-apia.coolkit.cc",
  as: "https://as-apia.coolkit.cc",
  cn: "https://cn-apia.coolkit.cn",
};

export function regionToApiBase(region?: string): string {
  return REGION_BASES[region ?? ""] ?? "https://eu-apia.coolkit.cc";
}

// ── Token refresh ──────────────────────────────────────────────────────────
//
// eWeLink access tokens expire after ~30 days; refresh tokens last ~60.
// Without this helper the valve-control + valve-state edge functions would
// surface "access token expired" until the user re-OAuthed by hand.

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Calls eWeLink's `/v2/user/refresh` with the stored refresh token and
 * returns the fresh access + refresh token pair. The caller is responsible
 * for persisting them back to the `integrations` row.
 *
 * Throws an Error with a user-actionable message when the refresh itself
 * fails (e.g. the refresh token has also expired — the user must re-OAuth).
 */
export async function refreshAccessToken(
  appId: string,
  appSecret: string,
  refreshToken: string,
  apiBase: string,
): Promise<RefreshedTokens> {
  const body = JSON.stringify({ rt: refreshToken });
  const res = await fetch(`${apiBase}/v2/user/refresh`, {
    method: "POST",
    headers: await ewelinkHeaders(appId, appSecret, body),
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const json = await res.json().catch(() => ({}));
  if (json?.error !== 0 || !json?.data?.at) {
    throw new Error("eWeLink session expired — please reconnect this integration.");
  }
  return {
    accessToken: String(json.data.at),
    refreshToken: String(json.data.rt ?? refreshToken),
  };
}

/** Token-expiry hints we see in the wild. eWeLink uses code `401` plus
 *  msg variants like "access token expired" / "token expired" / "401: ..." */
export function isTokenExpiredResponse(json: { error?: number; msg?: string }): boolean {
  if (json?.error === 401 || json?.error === 402) return true;
  const msg = (json?.msg ?? "").toLowerCase();
  return msg.includes("token") && msg.includes("expir");
}

/**
 * Run an eWeLink API call with automatic access-token refresh on expiry.
 *
 * - First attempt uses the access token currently in the encrypted blob.
 * - If the response looks like a token-expiry error, the refresh token is
 *   used to mint a new access token, the new pair is re-encrypted +
 *   persisted, and the original call is retried ONCE.
 * - If the refresh itself fails (refresh token also expired), throws a
 *   user-actionable Error — the caller should map this to a "please
 *   reconnect" response so the user knows to re-OAuth.
 *
 * Generic over the parsed response shape; the caller's `fn` is responsible
 * for parsing the raw fetch into JSON.
 */
// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export async function withTokenRefresh<T extends { error?: number; msg?: string }>(
  ctx: {
    db: SupabaseLike;
    integrationId: string;
    appId: string;
    appSecret: string;
    apiBase: string;
    decryptCredentials: (blob: string) => Promise<{ accessToken: string; refreshToken: string }>;
    encryptCredentials: (payload: { accessToken: string; refreshToken: string }) => Promise<string>;
    currentEncrypted: string;
  },
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const creds = await ctx.decryptCredentials(ctx.currentEncrypted);
  const first = await fn(creds.accessToken);
  if (!isTokenExpiredResponse(first)) return first;

  // Expired — refresh, persist, retry once.
  const fresh = await refreshAccessToken(ctx.appId, ctx.appSecret, creds.refreshToken, ctx.apiBase);
  const reEncrypted = await ctx.encryptCredentials({
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken,
  });
  await ctx.db
    .from("integrations")
    .update({ credentials_encrypted: reEncrypted })
    .eq("id", ctx.integrationId);

  return fn(fresh.accessToken);
}

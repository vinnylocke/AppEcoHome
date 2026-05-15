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

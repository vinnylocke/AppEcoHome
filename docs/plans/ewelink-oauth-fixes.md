# Plan — eWeLink OAuth Bug Fixes (from official docs)

## Source
https://coolkit-technologies.github.io/eWeLink-API/en/OAuth2.0.md

## Bugs found

### Bug 1 — Missing required `grantType` parameter in OAuth URL
The docs list `grantType=authorization_code` as a **required** parameter for the
OAuth URL. We are not sending it. Without it, eWeLink's OAuth page likely falls back
to a different internal flow that routes through the China server (`apia.coolkit.cn`),
causing the CORS error the user is seeing.

### Bug 2 — Wrong callback parameter name
The docs state the redirect comes back with `?code=<code>&region=<region>&state=<state>`.
Our `IntegrationsPage` looks for `params.get("ewelink_code")` — this would never match,
so the wizard would never open after a successful OAuth redirect.

### Bug 3 — Hardcoded EU API for token exchange
The callback includes a `region` parameter (`eu`, `us`, `as`, `cn`) telling us which
regional server the user's account is on. The regional endpoints are:
- Europe:  `https://eu-apia.coolkit.cc`
- Americas: `https://us-apia.coolkit.cc`
- Asia:    `https://as-apia.coolkit.cc`
- China:   `https://cn-apia.coolkit.cn`

We currently hardcode EU for the token exchange call. Any non-EU user would get a
failed exchange even if OAuth completed successfully.

---

## Files changing

### `supabase/functions/_shared/integrations/ewelinkAuth.ts`
- Add `grantType=authorization_code` to the URL built by `buildOAuthUrl`
- Add and export `regionToApiBase(region?: string): string` — maps region string
  to the correct API base URL, defaulting to EU

### `supabase/functions/integrations-ewelink-connect/index.ts`
- Import `regionToApiBase` from ewelinkAuth
- Accept `region` in the `exchange_code` request body
- Use `regionToApiBase(region)` instead of the hardcoded `EWELINK_BASE` for the
  token exchange POST

### `src/components/integrations/IntegrationsPage.tsx`
- Change `params.get("ewelink_code")` → `params.get("code")`
- Add `params.get("region")` capture
- Pass region through `credentials: { __oauthCode: code, __oauthRegion: region ?? "" }`

### `src/components/integrations/wizard/Step3Credentials.tsx`
- Pass region alongside code when calling `exchangeCode`
- Include `region` in the edge function body: `{ action: "exchange_code", homeId, code, region }`

### `supabase/tests/integrations/ewelink.test.ts`
- Update `buildOAuthUrl` tests to assert `grantType=authorization_code` is present
- Add tests for `regionToApiBase` covering all four regions + unknown/missing fallback

---

## No schema changes
No DB migrations needed.

---

## Expected outcome
With `grantType=authorization_code` present, eWeLink's OAuth page should route to the
correct regional backend instead of falling back to China, resolving the CORS error.
The callback `code` param will then be detected correctly, the region-aware token
exchange will call the right API, and the full OAuth flow will complete.

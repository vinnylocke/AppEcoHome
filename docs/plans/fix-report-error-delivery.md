# Plan — Fix report-error edge function delivery

## Problem

The "Send error report" button in `ErrorPage.tsx` always shows "Try again" because:

1. `ErrorPage.tsx` sends only `apikey: VITE_SUPABASE_PUBLISHABLE_KEY` (no `Authorization` header)
2. The Supabase Edge Functions gateway requires `Authorization: Bearer <JWT>` to route the request
3. The `sb_publishable_*` key format is not a JWT — the gateway rejects it with `UNAUTHORIZED_INVALID_JWT_FORMAT`
4. The function code is never reached, so the Resend API key (which is valid) is never called

Confirmed: Resend API key `re_GyTUzuZD_*` is valid — direct POST to Resend returned 200.

## Fix

### 1. `supabase/functions/report-error/config.toml` (new file)
Set `verify_jwt = false` to make this function publicly callable without auth. Correct for an error reporter:
- Users may hit errors before they have an active session
- The function is already IP-rate-limited (20 req/IP)
- No sensitive data is returned

```toml
[functions.report-error]
verify_jwt = false
```

### 2. `src/components/ErrorPage.tsx`
Remove the `apikey` header — it's no longer needed since JWT verification is disabled. The function will accept unauthenticated POST requests.

No other changes needed.

## Deployment
- Deploy via `npm run deploy` with `--bump 1` (1 file changed: the new config.toml)
- The existing RESEND_API_KEY secret in production is valid — no secret update needed

## Files changed
| File | Change |
|------|--------|
| `supabase/functions/report-error/config.toml` | New — `verify_jwt = false` |
| `src/components/ErrorPage.tsx` | Remove `apikey` header from fetch call |

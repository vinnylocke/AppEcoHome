# Rhozly Pre-Release Security Checklist

Run through this checklist on staging before every major release. All automated
gates must pass before the manual checks are run.

---

## Automated Gates (must all be green)

```bash
npm run test:unit          # 0 failures
npm run test:functions     # 0 failures (includes RLS + edge auth tests)
npm run test:e2e           # 0 failures (includes auth boundary, XSS, storage tests)
npm audit --audit-level=high   # 0 high/critical issues
```

---

## M1 — Client Bundle Secrets Audit

After `npm run build`, grep the output bundle for secrets:

```bash
grep -r "sk-" dist/
grep -r "AIzaSy" dist/
grep -r "service_role" dist/
grep -r "private_key" dist/
```

**Expected:** Zero matches. Any match → move the key to an edge function env var before release.

---

## M2 — HTTP Security Headers (Production)

```bash
curl -I https://your-production-domain.com | grep -Ei "content-security|x-frame|x-content-type|strict-transport|referrer"
```

**Expected:** All five headers present with correct values:

| Header | Required value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; img-src * data: blob:; connect-src *` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |

---

## M3 — Supabase Anon Key Scope Audit

Using the anon key (browser-accessible), verify unauthenticated query results:

```bash
ANON_KEY="your-anon-key"
SB_URL="https://your-project.supabase.co"

# Private tables — must return 0 rows unauthenticated
curl -s "$SB_URL/rest/v1/tasks?select=id" -H "apikey: $ANON_KEY" | jq '. | length'
curl -s "$SB_URL/rest/v1/home_members?select=id" -H "apikey: $ANON_KEY" | jq '. | length'

# Community guides — public read is intentional (published guides only)
curl -s "$SB_URL/rest/v1/community_guides?select=id&is_draft=eq.false" -H "apikey: $ANON_KEY" | jq '. | length'
```

**Expected:** `tasks` and `home_members` return `0`; `community_guides` may return a positive count.

---

## M4 — Network Tab Review

Open Chrome DevTools → Network → reload the app while authenticated:

- [ ] No requests to external APIs carry secrets in query strings
- [ ] No `service_role` or `SUPABASE_SECRET_KEY` visible in any request
- [ ] All Supabase REST calls use the anon key (not service role key)
- [ ] Gemini / Open-Meteo calls go through edge functions (no direct browser calls)

---

## M5 — Rate Limit Smoke Test

After ensuring the edge functions are deployed, run against staging:

```bash
VALID_JWT="get-this-from-supabase-dashboard-or-curl-auth"
FN_URL="https://your-project.supabase.co/functions/v1/plant-doctor"

for i in {1..12}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$FN_URL" \
    -H "Authorization: Bearer $VALID_JWT" \
    -H "Content-Type: application/json" \
    -d '{"action":"search_plants_text","plantSearch":"rose"}')
  echo "Request $i: $STATUS"
done
```

**Expected:** Requests 1–10 return `200`; requests 11–12 return `429` with a `Retry-After` header.

---

## M6 — PWA / Service Worker Cache Audit

Open DevTools → Application → Cache Storage:

- [ ] No tasks, plant info, or personal data cached by the service worker
- [ ] Workbox `NetworkFirst` strategy is in effect for API calls (live data always fetched fresh)

---

## M7 — Capacitor / Mobile Native Security

- [ ] `ios/App/App/Info.plist` — no API keys hardcoded
- [ ] `android/app/src/main/res/values/strings.xml` — no API keys
- [ ] `capacitor.config.ts` — no secrets
- [ ] Deep link scheme `rhozly://` is registered and validates the path before acting

---

## M8 — Dependency Vulnerability Scan

```bash
npm audit --audit-level=high
```

Resolve all `high` or `critical` issues before release. Known low-risk items:
- Tiptap peer-dep install warnings (cosmetic only — not exploitable in this context)

---

## Release Gate

The app is ready for release when ALL of the following pass:

- [ ] `npm run test:unit` — 0 failures
- [ ] `npm run test:functions` — 0 failures
- [ ] `npm run test:e2e` — 0 failures
- [ ] M1: Bundle secrets audit — 0 matches
- [ ] M2: Security headers — all 5 headers present
- [ ] M3: Anon key scope — unauthenticated queries return 0 rows for private tables
- [ ] M4: Network tab — no secrets in browser requests
- [ ] M5: Rate limit smoke test — 429 on request 11+
- [ ] M6: Service worker — no sensitive data cached
- [ ] M8: `npm audit` — 0 high/critical issues

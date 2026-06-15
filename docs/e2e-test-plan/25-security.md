# 25. Security — Auth + XSS + Storage

**Spec files:** `tests/e2e/specs/security-auth.spec.ts` · `tests/e2e/specs/security-xss.spec.ts` · `tests/e2e/specs/security-storage.spec.ts`
**Seed dependencies:** depends on test
**App-reference:** [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md), [99-cross-cutting/20-error-handling.md](../app-reference/99-cross-cutting/20-error-handling.md)

Cross-cutting security regression net. Covers auth-guard behaviour, XSS resistance on user-controlled text fields, and storage-bucket isolation. The XSS spec uses a `window.__xss` sentinel — any successful escape would have set the global, so `undefined` is the pass condition.

## Auth (security-auth.spec.ts)

8 tests verifying unauthenticated routes redirect to `/auth`, sign-out invalidates the session, and post-logout DB queries return 0 rows.

## XSS (security-xss.spec.ts)

7 tests injecting payloads into task title, guide title, guide comment, guide body, location name, and plan name — confirming `window.__xss` stays `undefined` in every case.

## Storage (security-storage.spec.ts)

6 tests verifying:
- Cross-home `area-scan` reads are blocked
- Alien `community-guides` uploads / deletes are blocked
- SVG MIME type rejected on upload
- Oversized uploads rejected
- `area-scans` bucket is private (no anonymous read)

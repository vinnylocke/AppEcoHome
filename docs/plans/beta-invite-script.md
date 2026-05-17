# Plan — Beta invite-only access script

## What this does
- Turns off public self-registration (manual step in Supabase dashboard — one toggle)
- Adds `scripts/invite-beta-users.mjs` to batch-send magic-link invites using the service role key
- Emails are read from `beta-invites.txt` (one per line; `#` lines are comments)
- `beta-invites.txt` is gitignored so the email list never ships to version control

## Files

| File | Change |
|------|--------|
| `scripts/invite-beta-users.mjs` | New — batch invite script |
| `beta-invites.txt` | New — email list (gitignored) |
| `.gitignore` | Add `beta-invites.txt` |
| `package.json` | Add `"invite:beta": "node scripts/invite-beta-users.mjs"` |

## Script behaviour
- Reads `beta-invites.txt` from the project root
- Skips blank lines and `#` comment lines
- Calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: "https://rhozly.com/" })` for each
- Logs ✓ / ✗ per email with the error message if one occurs
- 300 ms delay between calls to respect Supabase rate limits
- Supports `--dry-run` flag to preview the list without sending

## Manual step (outside code)
Supabase Dashboard → Authentication → Settings → uncheck **"Enable Signups"** → Save.
New users can no longer self-register; only invited users can create accounts.

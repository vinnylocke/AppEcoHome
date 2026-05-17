# Beta Access — How to Invite Users

Rhozly's beta is invite-only. Public self-registration is disabled in Supabase, so only people you personally invite can create an account.

---

## Prerequisites (one-time setup)

1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/yiuuzlfhtsxbspdyibam/auth/providers)
2. Go to **Authentication → Settings**
3. Uncheck **"Enable Signups"** and click **Save**

This prevents anyone from registering themselves. Existing accounts are unaffected.

---

## Inviting someone

### 1. Add their email to the list

Open `beta-invites.txt` in the project root. Add one email per line:

```
# Lines starting with # are ignored

alice@example.com
bob@example.com
```

> `beta-invites.txt` is gitignored — it never gets committed to GitHub. Keep it on your local machine.

### 2. Preview the list (optional)

```bash
npm run invite:beta -- --dry-run
```

This prints who would be invited without sending anything.

### 3. Send the invites

```bash
npm run invite:beta
```

Each person receives an email from Supabase with a **one-time magic link** (expires after 24 hours).

---

## What the invitee experiences

1. They receive an invite email
2. They click the link → land on `rhozly.com`
3. They set a password → account created
4. From then on they log in normally at `rhozly.com` with their email and password

---

## If someone misses the invite link (expired after 24h)

Just re-add their email to `beta-invites.txt` and run the script again. Supabase sends a fresh link. The script automatically skips people who are already fully registered.

---

## Removing beta access

To deactivate a user, go to [Supabase Dashboard → Authentication → Users](https://supabase.com/dashboard/project/yiuuzlfhtsxbspdyibam/auth/users), find them, and click **Ban user** or **Delete user**.

---

## Re-opening public signups

When you're ready to leave beta, re-enable signups in Supabase:

**Authentication → Settings → check "Enable Signups" → Save**

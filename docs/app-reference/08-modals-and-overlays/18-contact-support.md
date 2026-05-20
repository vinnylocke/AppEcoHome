# Contact Support Modal

> A simple "send us a message" form with name + email + message. Submits via the `contact-support` edge function which routes the email to the support inbox.

**Source file:** `src/components/ContactSupportModal.tsx`

---

## Quick Summary

Opens from the User Profile Dropdown. Name + email default-populated from the user's account. Message is required. Submits to `contact-support` edge function. Shows a success state with a tick after sending.

---

## Role 1 — Technical Reference

### Component graph

```
ContactSupportModal (focus-trapped)
├── Header (close, title, "We reply within one business day")
├── Form
│   ├── Name
│   ├── Email
│   └── Message (textarea)
├── Submit button
└── Success state (CheckCircle2 + thank you)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `defaultName` | `string \| null` | parent | Pre-fill |
| `defaultEmail` | `string \| null` | parent | Pre-fill |
| `onClose` | `() => void` | parent | Hide |

### Data flow — write paths

```ts
supabase.functions.invoke("contact-support", {
  body: { name, email, message },
});
```

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `contact-support` | Forwards email to support inbox |

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

None — anyone signed in can submit.

### Error states

| State | Result |
|-------|--------|
| Empty field | Submit disabled |
| Edge fn fails | Inline error "try again or email support@rhozly.com directly" |

### Performance

- Single edge function call.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this modal

For bug reports, feature requests, billing questions, account issues, or anything else that needs human attention.

### Every flow on this modal

#### 1. Fill the form

- Name + email default to your account values. Edit if you want.
- Message — be specific. Screenshots / steps to reproduce help.

#### 2. Submit

- Edge fn forwards to support. You'll get a reply by email.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Vague descriptions.** "It's broken" doesn't help. Say what you did + what you expected + what happened.
- **Using the wrong email.** If you're emailing about account access, use the account's actual email — not a different one.

### Recommended workflows

- **Bug:** include version (from User Profile Dropdown footer) + screenshots.

### What to do if something looks wrong

- **Submit fails:** copy the message to clipboard + email support@rhozly.com directly.

---

## Related reference files

- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md)

## Code references for ongoing maintenance

- `src/components/ContactSupportModal.tsx`
- `supabase/functions/contact-support/index.ts`

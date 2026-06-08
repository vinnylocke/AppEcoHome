# Plan — Push notification delivery priority

## Problem

User reports Weekly Overview push arrived "a lot later" than Golden Hour, even though both rows were inserted into `notifications` within 3 minutes of each other and the same `push-webhook` chain fires for both.

Root cause likely: default FCM message priority is "normal". Android can delay normal-priority messages indefinitely to save battery (the OS batches them with the next wake-up). Apps that need immediate delivery must set `android.priority: "HIGH"` and (for iOS) `apns-priority: "10"`.

The current `push-webhook/index.ts` sends a minimal FCM v1 message with no platform-specific overrides — so every push goes out as normal priority.

## Fix

In `push-webhook/index.ts`, add platform-specific blocks to the FCM payload:

```ts
android: {
  priority: "HIGH",
  notification: { sound: "default" },
},
apns: {
  headers: { "apns-priority": "10" },
  payload: { aps: { sound: "default" } },
},
```

Also coerce every value in the `data` object to a string. FCM requires `data` values to be strings — non-strings are silently dropped or rejected by the API on some clients.

## Files

| File | Change |
|------|--------|
| `supabase/functions/push-webhook/index.ts` | Add `android` + `apns` priority overrides; stringify data |

## Tests

No existing unit test for push-webhook (it touches external FCM API). We'll smoke-test by inserting a fresh `notifications` row and confirming the push arrives quickly on the user's Android device.

## Deploy

Single edge function deploy:
`supabase functions deploy push-webhook --use-api --yes`

This function is configured with `verify_jwt = true` in `supabase/config.toml`, so don't pass `--no-verify-jwt`.

## Risks

- High-priority pushes drain battery more than normal-priority. Acceptable for the kinds of notifications Rhozly sends (weather alerts, watering reminders, golden hour timing — all genuinely time-sensitive).
- iOS isn't currently in scope (the test user is Android) but it costs nothing to set the APNs header too.

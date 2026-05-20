# Sync Indicator

> A small spinner / status indicator surfaced when data is actively syncing — e.g. flushing the offline queue, fetching realtime updates, refreshing a stale screen.

**Source file:** Not a standalone component — woven into header (via QueuedActionsBadge during flush) and some per-screen indicators.

---

## Quick Summary

Rhozly doesn't ship a unified standalone "Sync" badge component today. Sync activity surfaces in three places:

1. **QueuedActionsBadge** — spinner appears during offline queue flush.
2. **Pull-to-refresh** — per-screen `PullToRefresh` component shows spinner during refetch.
3. **Per-modal save state** — modals show their own "Saving…" indicators.

This reference exists to document where sync state is observable in the UI even though there isn't a single "Sync" component.

---

## Role 1 — Technical Reference

### Observable surfaces

| Surface | Indicator |
|---------|-----------|
| Offline queue flush | QueuedActionsBadge `isFlushing` |
| Pull-to-refresh | PullToRefresh spinner |
| Garden Layout Editor | "Saving…" pill |
| Plan Staging | per-action loader |
| AddTaskModal | save button spinner |

### Data flow

Each component owns its own sync state.

### Edge functions invoked

None at this layer.

### Cron / scheduled jobs

None.

### Realtime channels

Realtime subscriptions are silent — no UI indicator unless a component opts in.

### Tier gating

None.

### Beta gating

None.

### Permissions

None.

### Error states

Per-surface; no global "sync failed" indicator today.

### Performance

- Each indicator is local; no global polling.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why care about sync

Most syncs are invisible. You see indicators only when:

- The offline queue is flushing.
- You pull-to-refresh.
- A modal is mid-save.

If you want to confirm everything is up to date: pull-to-refresh on the current screen.

### Common mistakes / pitfalls

- **Assuming all writes are instant.** With realtime sync, other devices may take a beat. Pull-to-refresh on the other device if impatient.
- **No global indicator means I can't tell if it's working.** Check the offline badge + queue badge — silence usually means "synced".

### Recommended workflows

- Trust silence as "synced".

### What to do if something looks wrong

- **Suspect stale data:** pull-to-refresh the screen.
- **Suspect missing writes:** check queue badge — if non-zero, tap to flush.

---

## Related reference files

- [Offline Badge](./03-offline-badge.md)
- [Queued Actions Badge](./04-queued-actions-badge.md)
- [Pull To Refresh](./07-pull-to-refresh.md)
- [Realtime (cross-cutting)](../99-cross-cutting/15-realtime.md)
- [Offline Queue (cross-cutting)](../99-cross-cutting/16-offline-queue.md)

## Code references for ongoing maintenance

- `src/components/QueuedActionsBadge.tsx`
- `src/components/PullToRefresh.tsx`
- Per-modal save indicators (in respective components)

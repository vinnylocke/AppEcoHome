-- Add the `quantity` column to `inventory_items` referenced by the
-- Nursery Plant Out flow. The original `20260624000500_nursery.sql`
-- migration comment promised this column ("using the existing `quantity`
-- column for batch counts") but the column never existed — silently
-- breaking the entire `plantOutSowing` service in `nurseryService.ts`
-- with a PGRST204 "Could not find the 'quantity' column" error.
--
-- Discovered by PR 8 E2E tests (NURSERY-020..022).

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1
  CHECK (quantity >= 1);

COMMENT ON COLUMN public.inventory_items.quantity IS
  'How many plant units this row represents. Defaults to 1 for backward compatibility — every pre-Nursery row is a single plant. Populated by the Nursery Plant Out flow with the seedling batch size.';

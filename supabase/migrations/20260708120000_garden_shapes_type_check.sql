-- Garden shapes: constrain shape_type to the renderer's canonical set.
--
-- The 2D/3D editors silently DROP shapes whose shape_type they don't know —
-- scripts/seed-test-account.mjs wrote 'rectangle' (instead of 'rect') and
-- every seeded layout rendered as an empty canvas (docs/plans/
-- garden-layout-fixes-and-mobile-readonly.md). The bad rows were repaired
-- ('rectangle' → 'rect') before this constraint lands; this stops the class
-- of bug at the source.
-- Repair first (idempotent — prod was hand-repaired 2026-07-08, local/test
-- DBs still carry the seeded value), then constrain.
UPDATE public.garden_shapes SET shape_type = 'rect' WHERE shape_type = 'rectangle';

ALTER TABLE public.garden_shapes
  ADD CONSTRAINT garden_shapes_shape_type_check
  CHECK (shape_type IN ('rect', 'path', 'circle', 'ellipse', 'polygon'));

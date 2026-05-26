-- Garden Overhaul — store the user's annotated photo alongside the
-- original, so the result view can show what they highlighted and
-- the AI can use the marked image as its reference.
--
-- annotated_photo_url is null when the user skipped the "highlight"
-- step (full-garden redesign — original behaviour).

ALTER TABLE plan_overhaul_inputs
  ADD COLUMN annotated_photo_url text;

COMMENT ON COLUMN plan_overhaul_inputs.annotated_photo_url IS
  'Signed URL of the photo with user-drawn highlight strokes baked in. Null when the user did not annotate. When set, this is the image fed to gemini-2.5-flash-image instead of original_photo_url.';

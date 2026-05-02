-- The plants_source_check constraint only allowed 'manual' and 'api',
-- but the AI tab in BulkSearchModal inserts plants with source='ai'.
-- Drop the old constraint and replace it with one that includes 'ai'.
alter table "public"."plants" drop constraint if exists "plants_source_check";

alter table "public"."plants" add constraint "plants_source_check"
  check ((source = any (array['manual'::text, 'api'::text, 'ai'::text])));

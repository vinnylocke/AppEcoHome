alter table "public"."guides" drop constraint "guides_category_check";

alter table "public"."guides" drop column "category";

alter table "public"."guides" drop column "content";

alter table "public"."guides" drop column "description";

alter table "public"."guides" drop column "image_url";

alter table "public"."guides" drop column "tags";

alter table "public"."guides" drop column "title";

alter table "public"."guides" drop column "video_url";

alter table "public"."guides" add column "data" jsonb not null default '{}'::jsonb;

alter table "public"."guides" add column "labels" text[] default '{}'::text[];

alter table "public"."guides" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."guides" alter column "created_at" set not null;

alter table "public"."guides" alter column "id" set default gen_random_uuid();

alter table "public"."guides" disable row level security;

alter table "public"."user_profiles" add column "is_admin" boolean not null default false;

CREATE INDEX idx_guides_data ON public.guides USING gin (data);

CREATE INDEX idx_guides_labels ON public.guides USING gin (labels);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$
;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.guides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();



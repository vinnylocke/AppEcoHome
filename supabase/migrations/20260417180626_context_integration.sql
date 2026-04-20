alter table "public"."homes" add column "country" text;

alter table "public"."homes" add column "timezone" text;

alter table "public"."task_blueprints" add column if not exists "is_auto_generated" boolean not null default false;



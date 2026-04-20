
  create table "public"."user_devices" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "token" text not null,
    "platform" text,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "last_used_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."user_devices" enable row level security;

alter table "public"."notifications" add column "data" jsonb default '{}'::jsonb;

alter table "public"."notifications" add column "user_id" uuid;

CREATE UNIQUE INDEX user_devices_pkey ON public.user_devices USING btree (id);

CREATE UNIQUE INDEX user_devices_user_id_token_key ON public.user_devices USING btree (user_id, token);

alter table "public"."user_devices" add constraint "user_devices_pkey" PRIMARY KEY using index "user_devices_pkey";

alter table "public"."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_user_id_fkey";

alter table "public"."user_devices" add constraint "user_devices_platform_check" CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text]))) not valid;

alter table "public"."user_devices" validate constraint "user_devices_platform_check";

alter table "public"."user_devices" add constraint "user_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_devices" validate constraint "user_devices_user_id_fkey";

alter table "public"."user_devices" add constraint "user_devices_user_id_token_key" UNIQUE using index "user_devices_user_id_token_key";

grant delete on table "public"."user_devices" to "anon";

grant insert on table "public"."user_devices" to "anon";

grant references on table "public"."user_devices" to "anon";

grant select on table "public"."user_devices" to "anon";

grant trigger on table "public"."user_devices" to "anon";

grant truncate on table "public"."user_devices" to "anon";

grant update on table "public"."user_devices" to "anon";

grant delete on table "public"."user_devices" to "authenticated";

grant insert on table "public"."user_devices" to "authenticated";

grant references on table "public"."user_devices" to "authenticated";

grant select on table "public"."user_devices" to "authenticated";

grant trigger on table "public"."user_devices" to "authenticated";

grant truncate on table "public"."user_devices" to "authenticated";

grant update on table "public"."user_devices" to "authenticated";

grant delete on table "public"."user_devices" to "service_role";

grant insert on table "public"."user_devices" to "service_role";

grant references on table "public"."user_devices" to "service_role";

grant select on table "public"."user_devices" to "service_role";

grant trigger on table "public"."user_devices" to "service_role";

grant truncate on table "public"."user_devices" to "service_role";

grant update on table "public"."user_devices" to "service_role";


  create policy "Users can update their own notifications (e.g. mark as read)"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can delete their own devices"
  on "public"."user_devices"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own devices"
  on "public"."user_devices"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own devices"
  on "public"."user_devices"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own devices"
  on "public"."user_devices"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));




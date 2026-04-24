
  create table "public"."plans" (
    "id" uuid not null default gen_random_uuid(),
    "home_id" uuid not null,
    "name" text not null,
    "description" text not null,
    "status" text not null default 'Draft'::text,
    "cover_image_url" text,
    "ai_blueprint" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "staging_state" jsonb not null default '{}'::jsonb
      );


alter table "public"."plans" enable row level security;

alter table "public"."guides" enable row level security;

alter table "public"."task_blueprints" add column "plan_id" uuid;

alter table "public"."tasks" add column "plan_id" uuid;

CREATE INDEX idx_plans_home_id ON public.plans USING btree (home_id);

CREATE INDEX idx_task_blueprints_plan_id ON public.task_blueprints USING btree (plan_id);

CREATE INDEX idx_tasks_plan_id ON public.tasks USING btree (plan_id);

CREATE UNIQUE INDEX plans_pkey ON public.plans USING btree (id);

alter table "public"."plans" add constraint "plans_pkey" PRIMARY KEY using index "plans_pkey";

alter table "public"."plans" add constraint "plans_home_id_fkey" FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE not valid;

alter table "public"."plans" validate constraint "plans_home_id_fkey";

alter table "public"."plans" add constraint "plans_status_check" CHECK ((status = ANY (ARRAY['Draft'::text, 'In Progress'::text, 'Completed'::text, 'Archived'::text]))) not valid;

alter table "public"."plans" validate constraint "plans_status_check";

alter table "public"."task_blueprints" add constraint "task_blueprints_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE not valid;

alter table "public"."task_blueprints" validate constraint "task_blueprints_plan_id_fkey";

alter table "public"."tasks" add constraint "tasks_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE not valid;

alter table "public"."tasks" validate constraint "tasks_plan_id_fkey";

grant delete on table "public"."plans" to "anon";

grant insert on table "public"."plans" to "anon";

grant references on table "public"."plans" to "anon";

grant select on table "public"."plans" to "anon";

grant trigger on table "public"."plans" to "anon";

grant truncate on table "public"."plans" to "anon";

grant update on table "public"."plans" to "anon";

grant delete on table "public"."plans" to "authenticated";

grant insert on table "public"."plans" to "authenticated";

grant references on table "public"."plans" to "authenticated";

grant select on table "public"."plans" to "authenticated";

grant trigger on table "public"."plans" to "authenticated";

grant truncate on table "public"."plans" to "authenticated";

grant update on table "public"."plans" to "authenticated";

grant delete on table "public"."plans" to "service_role";

grant insert on table "public"."plans" to "service_role";

grant references on table "public"."plans" to "service_role";

grant select on table "public"."plans" to "service_role";

grant trigger on table "public"."plans" to "service_role";

grant truncate on table "public"."plans" to "service_role";

grant update on table "public"."plans" to "service_role";


DROP POLICY IF EXISTS "Anyone can view master guides" ON "public"."guides";

create policy "Anyone can view master guides"
  on "public"."guides"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Users can manage plans for their homes"
  on "public"."plans"
  as permissive
  for all
  to public
using ((home_id IN ( SELECT home_members.home_id
   FROM public.home_members
  WHERE (home_members.user_id = auth.uid()))));


CREATE TRIGGER set_updated_at_plans BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


  create policy "Public Read Access"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'guide-images'::text));




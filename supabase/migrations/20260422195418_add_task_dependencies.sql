
  create table "public"."task_dependencies" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "task_id" uuid not null,
    "depends_on_task_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."task_dependencies" enable row level security;

CREATE UNIQUE INDEX task_dependencies_pkey ON public.task_dependencies USING btree (id);

CREATE UNIQUE INDEX unique_dependency ON public.task_dependencies USING btree (task_id, depends_on_task_id);

alter table "public"."task_dependencies" add constraint "task_dependencies_pkey" PRIMARY KEY using index "task_dependencies_pkey";

alter table "public"."task_dependencies" add constraint "fk_depends_on" FOREIGN KEY (depends_on_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE not valid;

alter table "public"."task_dependencies" validate constraint "fk_depends_on";

alter table "public"."task_dependencies" add constraint "fk_task" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE not valid;

alter table "public"."task_dependencies" validate constraint "fk_task";

alter table "public"."task_dependencies" add constraint "no_self_dependency" CHECK ((task_id <> depends_on_task_id)) not valid;

alter table "public"."task_dependencies" validate constraint "no_self_dependency";

alter table "public"."task_dependencies" add constraint "unique_dependency" UNIQUE using index "unique_dependency";

grant delete on table "public"."task_dependencies" to "anon";

grant insert on table "public"."task_dependencies" to "anon";

grant references on table "public"."task_dependencies" to "anon";

grant select on table "public"."task_dependencies" to "anon";

grant trigger on table "public"."task_dependencies" to "anon";

grant truncate on table "public"."task_dependencies" to "anon";

grant update on table "public"."task_dependencies" to "anon";

grant delete on table "public"."task_dependencies" to "authenticated";

grant insert on table "public"."task_dependencies" to "authenticated";

grant references on table "public"."task_dependencies" to "authenticated";

grant select on table "public"."task_dependencies" to "authenticated";

grant trigger on table "public"."task_dependencies" to "authenticated";

grant truncate on table "public"."task_dependencies" to "authenticated";

grant update on table "public"."task_dependencies" to "authenticated";

grant delete on table "public"."task_dependencies" to "service_role";

grant insert on table "public"."task_dependencies" to "service_role";

grant references on table "public"."task_dependencies" to "service_role";

grant select on table "public"."task_dependencies" to "service_role";

grant trigger on table "public"."task_dependencies" to "service_role";

grant truncate on table "public"."task_dependencies" to "service_role";

grant update on table "public"."task_dependencies" to "service_role";


  create policy "Users can manage their own task dependencies"
  on "public"."task_dependencies"
  as permissive
  for all
  to public
using ((task_id IN ( SELECT tasks.id
   FROM public.tasks)));




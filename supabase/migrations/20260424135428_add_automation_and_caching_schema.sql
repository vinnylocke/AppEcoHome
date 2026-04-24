drop trigger if exists "run_plant_schedules" on "public"."inventory_items";

alter table "public"."task_blueprints" drop constraint "task_blueprints_inventory_item_id_fkey";

alter table "public"."tasks" drop constraint "tasks_inventory_item_id_fkey";

drop function if exists "public"."trigger_plant_schedules"();

alter table "public"."task_blueprints" drop column "inventory_item_id";

alter table "public"."task_blueprints" add column "inventory_item_ids" uuid[] default '{}'::uuid[];

alter table "public"."tasks" drop column "inventory_item_id";

alter table "public"."tasks" add column "inventory_item_ids" uuid[] default '{}'::uuid[];



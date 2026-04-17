alter table "public"."inventory_items" drop constraint "inventory_items_status_check";

alter table "public"."tasks" drop constraint "tasks_status_check";

alter table "public"."inventory_items" add constraint "inventory_items_status_check" CHECK ((status = ANY (ARRAY['Unplanted'::text, 'Planted'::text, 'Archived'::text]))) not valid;

alter table "public"."inventory_items" validate constraint "inventory_items_status_check";

alter table "public"."tasks" add constraint "tasks_status_check" CHECK ((status = ANY (ARRAY['Pending'::text, 'Completed'::text, 'Skipped'::text]))) not valid;

alter table "public"."tasks" validate constraint "tasks_status_check";


